/**
 * mestre59Parser.ts — o relatório 59 vira linhas, sem tocar em rede nem banco.
 *
 * ## O que é o 59, e por que ele ganhou parser próprio
 *
 * O 59 é o relatório MESTRE do ERP da BookPlay: um arquivo por mês com todos os
 * setores, 28 colunas, ~51 mil linhas. O 58 — o que a liderança importa hoje,
 * um arquivo por setor — é uma FATIA EXATA dele.
 *
 * Isso foi medido em 04/09/2026 sobre agosto/2026, setor Play 5, e o número não
 * precisa ser refeito:
 *
 *   58 (fechamento do setor)                    2.210 linhas · R$ 361.768,85
 *   59 com `NomeGrupoFiltro = 'MARILIA - PLAY 5'`  2.210 linhas · R$ 361.768,85
 *   diferença                                        0 linhas · R$      0,00
 *
 * O pareamento é bijetivo por NrDocumento + Parcela + DtPgto + Recebido +
 * Cobradora + Título, e 13 das 15 colunas comuns são idênticas célula a célula.
 * As duas exceções são o 58 vindo VAZIO onde o 59 traz valor (`TipoVenda` 2.090
 * vezes, `TpDoc` 72) — o mestre nunca contradiz o fechamento, só preenche.
 *
 * ⚠️ A análise de 01/09/2026 cruzava os dois pela coluna `Setor` e concluiu que
 * eles discordavam. Estava errada, e todo número dela está anulado. As duas
 * colunas respondem a perguntas diferentes:
 *
 *   `NomeGrupoFiltro` → QUEM COBROU. De quem é o relatório. 16 rótulos, nenhuma
 *                       linha sem valor, e a soma dos 16 é o total do arquivo.
 *                       É este o recorte do 58.
 *   `Setor`           → PARA QUEM O DINHEIRO CONTA. 34 rótulos, 377 linhas sem
 *                       valor, e o receptivo vem composto:
 *                       `COB RECEPTIVO - BEATRIZ - «destino»`.
 *
 * ## Este parser não decide nada sobre setor
 *
 * Ele devolve as colunas como vieram. Quem liga `cod_grupo_filtro` a um setor do
 * sistema é a tabela `mestre_grupos`, preenchida à mão — e é de propósito que a
 * decisão não more aqui.
 */

/** Uma linha do 59, já tipada. Os nomes seguem as colunas da tabela. */
export interface LinhaMestre59 {
  /** Atribuição do ERP. Para o receptivo vem composta com o destino. */
  setor: string;
  cobradora: string;
  subgrupo_equipe: string;
  cliente: string;
  cod_cli: string;
  titulo: string;
  /** `Colchão?` = Sim. Recebimento automático de acordo de período anterior. */
  colchao: boolean;
  /** Texto, não número: o COFEN usa `201601`, que é competência, não parcela. */
  parcela: string;
  nr_documento: string;
  /** Coluna `Empresa` do ERP (FACULDADE BOOKPLAY, MUNDIAL EDITORA, …). */
  empresa_erp: string;
  tipo_venda: string | null;
  tp_doc: string;
  dt_lig: string | null;
  prev_pgto: string | null;
  dias: number | null;
  /** Sempre presente — é dela que sai o mês de referência. */
  dt_pgto: string;
  dias_atraso: number | null;
  recebido: number;
  /** `Integral` ou `Extra`. O Direto/Extra deixa de ser inferido. */
  tipo: string;
  operador_orig: string | null;
  setor_orig: string | null;
  dias_ligacao_baixa: number | null;
  cod_grupo: string;
  cod_grupo_representa: string | null;
  /** A CHAVE do vínculo. Ver `COLUNAS_OBRIGATORIAS`. */
  cod_grupo_filtro: string;
  nome_grupo_filtro: string;
  /** Linha no arquivo (1 = cabeçalho), para o erro apontar onde. */
  linha_num: number;
}

export interface ResultadoParse59 {
  linhas: LinhaMestre59[];
  /** 'yyyy-MM'. `null` quando o arquivo mistura meses — e aí `erros` diz. */
  mes: string | null;
  /** Cabeçalhos que o arquivo trouxe, na ordem. */
  cabecalho: string[];
  /** Colunas exigidas que não apareceram. Não-vazio = arquivo recusado. */
  colunasFaltando: string[];
  /** Problema por linha, no máximo `LIMITE_ERROS`. */
  erros: string[];
  /** Linhas puladas por erro. */
  descartadas: number;
  totalRecebido: number;
}

/**
 * As colunas que o mestre guarda, com o nome normalizado do cabeçalho.
 *
 * `DDD1` e `Fone1` ficam de FORA de propósito. São telefone do cliente, o
 * sistema não usa nenhum dos dois, e trazer contato pessoal para uma tabela
 * nova é ampliar o dado guardado sem ninguém ter pedido. Se um dia forem
 * precisos, entram com a decisão explícita de quem manda.
 */
const COLUNAS_OBRIGATORIAS = [
  'setor', 'cobradora', 'subgrupoequipe', 'cliente', 'titulo', 'colchao',
  'parcela', 'nrdocumento', 'empresa', 'tipovenda', 'tpdoc', 'dtlig',
  'prevpgto', 'dias', 'dtpgto', 'diasatraso', 'recebido', 'tipo',
  'operadororig', 'setororig', 'diasligacaobaixa', 'codgrupo',
  'codgruporepresenta', 'codgrupofiltro', 'nomegrupofiltro', 'codcli',
] as const;

const LIMITE_ERROS = 50;

/**
 * `Colchão?` → `colchao`. Tira acento, pontuação e caixa.
 *
 * O `?` do cabeçalho é o motivo de existir: sem removê-lo, a coluna do colchão
 * não casa com alias nenhum, e ela decide R$ 363 mil de recebimento que não é
 * do mês. Ver `docs/relatorio-59-conferencia-2026-08-25.md`.
 */
export function normalizarCabecalho(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Quebra uma linha de CSV respeitando aspas.
 *
 * O arquivo medido em 04/09 não tem NENHUMA aspa dupla — um `split(';')` daria
 * o mesmo resultado nas 50.934 linhas. O tratamento existe porque o dia em que
 * um nome de cliente vier com `;` dentro, o split silencioso jogaria as colunas
 * uma casa para o lado e o `Recebido` viraria outra coisa, sem erro nenhum.
 */
export function quebrarLinhaCsv(linha: string, sep = ';'): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        // `""` dentro de aspas é uma aspa literal.
        if (linha[i + 1] === '"') { atual += '"'; i++; } else dentroDeAspas = false;
      } else atual += c;
    } else if (c === '"' && atual === '') {
      dentroDeAspas = true;
    } else if (c === sep) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

/** Número com ponto decimal (`189.05`). Vazio e lixo viram `null`. */
function numero(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Inteiro que pode ser negativo (`Dias` chega como `-1`). */
function inteiro(v: string): number | null {
  const n = numero(v);
  return n === null ? null : Math.trunc(n);
}

/** Texto, com vazio virando `null` — para a coluna aceitar a ausência. */
function texto(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Data ISO do 59. Formato diferente do 58, que grava serial do Excel. */
function data(v: string): string | null {
  const t = v.trim();
  return ISO_DATA.test(t) ? t : null;
}

/**
 * Lê o texto inteiro do CSV.
 *
 * Aceita o arquivo como veio: BOM de UTF-8, CRLF e separador `;`. Nada disso é
 * adivinhado por heurística — é o formato conferido do rel_59.
 */
export function parseMestre59(conteudo: string): ResultadoParse59 {
  const vazio: ResultadoParse59 = {
    linhas: [], mes: null, cabecalho: [], colunasFaltando: [],
    erros: [], descartadas: 0, totalRecebido: 0,
  };

  const texto0 = conteudo.replace(/^\ufeff/, '');
  const linhasBrutas = texto0.split(/\r?\n/);
  if (linhasBrutas.length === 0 || linhasBrutas[0].trim() === '') {
    return { ...vazio, erros: ['Arquivo vazio ou sem cabeçalho.'] };
  }

  const cabecalho = quebrarLinhaCsv(linhasBrutas[0]).map(c => c.trim());
  const indice = new Map<string, number>();
  cabecalho.forEach((c, i) => {
    const n = normalizarCabecalho(c);
    // Primeira ocorrência vence: cabeçalho repetido não deve trocar a coluna
    // que já foi mapeada.
    if (n && !indice.has(n)) indice.set(n, i);
  });

  const colunasFaltando = COLUNAS_OBRIGATORIAS.filter(c => !indice.has(c));
  if (colunasFaltando.length > 0) {
    return { ...vazio, cabecalho, colunasFaltando };
  }

  const at = (campos: string[], nome: string): string => campos[indice.get(nome)!] ?? '';

  const linhas: LinhaMestre59[] = [];
  const erros: string[] = [];
  const meses = new Set<string>();
  let descartadas = 0;
  let totalRecebido = 0;

  for (let i = 1; i < linhasBrutas.length; i++) {
    const bruta = linhasBrutas[i];
    if (bruta.trim() === '') continue;      // última linha do arquivo
    const linhaNum = i + 1;                 // 1-based, contando o cabeçalho
    const campos = quebrarLinhaCsv(bruta);

    const dtPgto = data(at(campos, 'dtpgto'));
    if (dtPgto === null) {
      descartadas++;
      if (erros.length < LIMITE_ERROS) {
        erros.push(`Linha ${linhaNum}: DtPgto ausente ou fora do formato aaaa-mm-dd.`);
      }
      continue;
    }

    const recebido = numero(at(campos, 'recebido'));
    if (recebido === null) {
      descartadas++;
      if (erros.length < LIMITE_ERROS) {
        erros.push(`Linha ${linhaNum}: Recebido não é número ("${at(campos, 'recebido')}").`);
      }
      continue;
    }

    const codGrupoFiltro = at(campos, 'codgrupofiltro').trim();
    if (codGrupoFiltro === '') {
      // Sem o código não há como vincular a linha a setor nenhum, e deixá-la
      // entrar seria criar dinheiro que nunca aparece em lugar algum.
      descartadas++;
      if (erros.length < LIMITE_ERROS) {
        erros.push(`Linha ${linhaNum}: CodGrupoFiltro vazio — sem ele a linha não tem como ser vinculada.`);
      }
      continue;
    }

    meses.add(dtPgto.slice(0, 7));
    totalRecebido += recebido;

    linhas.push({
      setor:                at(campos, 'setor').trim(),
      cobradora:            at(campos, 'cobradora').trim(),
      subgrupo_equipe:      at(campos, 'subgrupoequipe').trim(),
      cliente:              at(campos, 'cliente').trim(),
      cod_cli:              at(campos, 'codcli').trim(),
      titulo:               at(campos, 'titulo').trim(),
      colchao:              at(campos, 'colchao').trim().toLowerCase().startsWith('s'),
      parcela:              at(campos, 'parcela').trim(),
      nr_documento:         at(campos, 'nrdocumento').trim(),
      empresa_erp:          at(campos, 'empresa').trim(),
      tipo_venda:           texto(at(campos, 'tipovenda')),
      tp_doc:               at(campos, 'tpdoc').trim(),
      dt_lig:               data(at(campos, 'dtlig')),
      prev_pgto:            data(at(campos, 'prevpgto')),
      dias:                 inteiro(at(campos, 'dias')),
      dt_pgto:              dtPgto,
      dias_atraso:          inteiro(at(campos, 'diasatraso')),
      recebido,
      tipo:                 at(campos, 'tipo').trim(),
      operador_orig:        texto(at(campos, 'operadororig')),
      setor_orig:           texto(at(campos, 'setororig')),
      dias_ligacao_baixa:   inteiro(at(campos, 'diasligacaobaixa')),
      cod_grupo:            at(campos, 'codgrupo').trim(),
      cod_grupo_representa: texto(at(campos, 'codgruporepresenta')),
      cod_grupo_filtro:     codGrupoFiltro,
      nome_grupo_filtro:    at(campos, 'nomegrupofiltro').trim(),
      linha_num:            linhaNum,
    });
  }

  const listaMeses = [...meses].sort();
  if (listaMeses.length > 1) {
    // Um lote é o retrato de UM mês, e promovê-lo apaga o retrato anterior
    // daquele mês. Com dois meses no arquivo, promover apagaria metade do que
    // não foi substituído. Recusar é a única saída segura.
    erros.unshift(
      `O arquivo tem ${listaMeses.length} meses (${listaMeses.join(', ')}). `
      + 'O mestre substitui o retrato de um mês por vez — importe um arquivo por mês.',
    );
  }

  return {
    linhas,
    mes: listaMeses.length === 1 ? listaMeses[0] : null,
    cabecalho,
    colunasFaltando: [],
    erros,
    descartadas,
    totalRecebido: Math.round(totalRecebido * 100) / 100,
  };
}

/** Os grupos do arquivo, com contagem — o que a aba lista antes de vincular. */
export interface GrupoDoArquivo {
  cod_grupo_filtro: string;
  nome_grupo_filtro: string;
  linhas: number;
  recebido: number;
  /** Rótulos distintos de `SubgrupoEquipe` vistos dentro deste grupo. */
  equipes: string[];
}

/**
 * Agrupa por `cod_grupo_filtro` — o CÓDIGO, nunca o nome.
 *
 * Medido em 04/09/2026: 16 códigos, 16 nomes, correspondência 1-para-1 exata,
 * zero código com dois nomes e zero nome com dois códigos. O código é o que
 * sobrevive à troca de liderança: `COB PLAY 1 - PAOLA` vira outro texto quando
 * a Paola sair, e o código 25 continua 25. Vincular pelo nome seria construir
 * sobre areia — foi o alerta que a análise de 01/09 deu, e ele continua válido
 * mesmo com o resto dela anulado.
 */
export function agruparPorGrupoFiltro(linhas: readonly LinhaMestre59[]): GrupoDoArquivo[] {
  const mapa = new Map<string, {
    nomes: Map<string, number>; linhas: number; recebido: number; equipes: Set<string>;
  }>();

  for (const l of linhas) {
    let g = mapa.get(l.cod_grupo_filtro);
    if (!g) {
      g = { nomes: new Map(), linhas: 0, recebido: 0, equipes: new Set() };
      mapa.set(l.cod_grupo_filtro, g);
    }
    g.linhas++;
    g.recebido += l.recebido;
    if (l.subgrupo_equipe) g.equipes.add(l.subgrupo_equipe);
    g.nomes.set(l.nome_grupo_filtro, (g.nomes.get(l.nome_grupo_filtro) ?? 0) + 1);
  }

  return [...mapa].map(([cod, g]) => ({
    cod_grupo_filtro: cod,
    // Se um código chegar com dois nomes (nunca aconteceu, mas o arquivo é do
    // ERP), vale o mais frequente — e não o último lido, que seria aleatório.
    nome_grupo_filtro: [...g.nomes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    linhas: g.linhas,
    recebido: Math.round(g.recebido * 100) / 100,
    equipes: [...g.equipes].sort(),
  })).sort((a, b) => b.recebido - a.recebido);
}
