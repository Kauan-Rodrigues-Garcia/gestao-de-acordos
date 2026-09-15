/**
 * prospeccaoParser.ts — o relatório de prospecção vira linhas, sem tocar em rede.
 *
 * ## O arquivo
 *
 * Um CSV por mês, separador `;`, BOM de UTF-8, CRLF, 60 colunas. O recorte é
 * por **data de confirmação**: todas as linhas do `Prospeccao_202609.csv` têm
 * `Data_Confirmacao` em setembro, e é por isso que **ele nunca traz venda
 * aberta** — medido nos dois meses inteiros:
 *
 *   agosto    6.955 linhas   Confirmada 6.131 · Devolvida 564 · Cancelada 260
 *   setembro  2.868 linhas   Confirmada 2.623 · Devolvida 190 · Cancelada  55
 *
 * Zero abertas nos dois. Para ter data de confirmação, a venda precisou ser
 * confirmada. Venda em aberto só chega pelo relatório do setor, que recorta por
 * data da venda.
 *
 * ## O arquivo é um RETRATO, e ele se move
 *
 * Medido: em 14/09 o arquivo de setembro tinha 2.838 linhas; reexportado em
 * 15/09 às 08:15, passou a 2.868, cobrindo até o dia 15. E o de agosto, baixado
 * em 31/08, traz **zero** devolução ou cancelamento datado de setembro — ele
 * congelou no instante do download e não se atualiza sozinho.
 *
 * Daí o desenho de lote: cada carga é um retrato inteiro que substitui o
 * anterior do mesmo mês. Reimportar o mês passado é a única forma de captar uma
 * reversão que aconteceu depois.
 *
 * ## A armadilha dos números: o formato é POR COLUNA
 *
 * O ERP mistura duas convenções no mesmo arquivo — e cada coluna é sempre a
 * mesma, nunca mistura dentro de si. Medido nas 2.868 linhas de setembro:
 *
 *   pt-BR (`3.816,00`)  Valor_Faturamento, Pix, Cartao_Padrao, Cartao_Recorrente
 *   en    (`159.0`)     Valor_Parcela, Total_Recebido, Porcentagem_Recebido
 *   int   (`13075529`)  Codigo_Venda, NrDocumento, Codigo_Franquia, QTDE_Parcela
 *
 * Por isso não há um `numero()` esperto que adivinhe: adivinhação erra em
 * silêncio no dia em que um faturamento vier `1.234` sem centavos — pt-BR lê
 * mil duzentos e trinta e quatro, en lê um vírgula dois. O mapa abaixo declara
 * o formato de cada coluna, e ele é a documentação do arquivo.
 *
 * ## O que este parser NÃO traz
 *
 * **CPF, telefone, e-mail, escolaridade, idade e etnia.** O sistema expurgou
 * CPF de propósito (migration 20260728b) e passou a usar o código do cliente;
 * reintroduzi-lo por uma importação nova desfaria a decisão pela porta dos
 * fundos. Escolaridade, idade e etnia são atributo de pessoa que ninguém pediu.
 *
 * **A decomposição de pagamento** (`Pix`, `Cartao_Padrao`, `Cartao_Recorrente`).
 * Medido: ela **não fecha** com `Total_Recebido` — 100 linhas divergem, R$
 * 27.437,73 de excesso, e 66 dessas estão marcadas «SEM RECEBIMENTO» com valor
 * na decomposição. Boleto, que recebeu R$ 4.782,20, não tem coluna nenhuma.
 * Guardar três números que não somam é convidar alguém a somá-los. Fica
 * `Total_Recebido` como valor e `TipoRecebimento` como classificação — que é a
 * regra 4 do plano.
 *
 * ## Este parser não decide setor
 *
 * Devolve `Codigo_Franquia` como veio. Quem liga franquia a setor é
 * `vendas_franquias`, preenchida à mão. Medido nos dois meses: 80 códigos
 * distintos, **zero** código com dois nomes e **zero** nome com dois códigos —
 * a chave é melhor que a do 59, onde o nome trocava.
 */
import type { SituacaoVenda } from '@/lib/vendas';

/** Uma linha do prospecção, já tipada. Os nomes seguem as colunas da tabela. */
export interface LinhaProspeccao {
  /** Id da venda no ERP. Não é o NR — duas linhas do mesmo NR têm códigos diferentes. */
  codigo_venda: string;
  /** A CHAVE da venda no mundo real. */
  nr_documento: string;
  data_venda: string;
  /** Só a data: o arquivo traz `2026-09-08 00:00:00.000`. É o eixo oficial. */
  data_confirmacao: string;
  /** A chave do de-para para setor. Estável — ver o cabeçalho. */
  codigo_franquia: string;
  /** Último nome visto da franquia. Rótulo, nunca chave. */
  franquia: string;
  /** Quem comprou. Coluna `Cliente`, sem nenhum vazio nos dois meses medidos. */
  cliente: string | null;
  uf: string | null;
  nome_vendedor: string | null;
  login_vendedor: string | null;
  situacao: SituacaoVenda;
  /** A outra metade da régua. `ContratoAssinado` = Sim. */
  contrato_assinado: boolean;
  valor_total: number;
  qtde_parcela: number | null;
  valor_parcela: number | null;
  valor_recebido: number;
  /** Classificação da forma de pagamento. Nunca fonte de valor — ver o cabeçalho. */
  tipo_recebimento: string | null;
  tipo_documento: string | null;
  /** Entrada, quando o export a traz (`Valor PIX Entrada`, só no de 119 colunas). */
  valor_entrada: number | null;
  produto: string | null;
  categoria: string | null;
  tipo_venda: string | null;
  tipo_produto: string | null;
  data_cancelamento: string | null;
  data_devolucao: string | null;
  motivo: string | null;
  setor_cancelamento: string | null;
  /** `VendaLead` = Sim. 596 das 2.838 linhas de setembro — 21%. */
  veio_de_lead: boolean;
  score_classe: string | null;
  spc_serasa: string | null;
  /** Linha no arquivo (1 = cabeçalho), para o erro apontar onde. */
  linha_num: number;
}

/** Uma franquia vista no arquivo, para o de-para. */
export interface FranquiaVista {
  codigo: string;
  nome: string;
  linhas: number;
  /** Faturamento total das linhas dela, para a tela mostrar o peso da decisão. */
  faturamento: number;
}

export interface ResultadoParseProspeccao {
  /** Uma linha por NR: o duplicado do arquivo já foi resolvido. */
  linhas: LinhaProspeccao[];
  franquias: FranquiaVista[];
  /** 'yyyy-MM' pelo eixo de confirmação. `null` quando o arquivo mistura meses. */
  mes: string | null;
  cabecalho: string[];
  /** Colunas exigidas que não apareceram. Não-vazio = arquivo recusado. */
  colunasFaltando: string[];
  erros: string[];
  descartadas: number;
  /**
   * NRs que vieram mais de uma vez no arquivo e foram resolvidos.
   *
   * Não é erro: é devolução seguida de reconfirmação com troca de produto.
   * Medido: 19 casos em agosto (R$ 70.156,60 de faturamento inflado se somado
   * sem resolver) e 4 em setembro (R$ 18.584,00).
   */
  duplicadosResolvidos: string[];
  /** Faturamento de tudo que está na régua (confirmada E assinada). */
  faturamentoNaRegua: number;
  /** Quantas linhas estão na régua. */
  quantidadeNaRegua: number;
}

/**
 * As colunas que o sistema guarda, com o formato de cada uma.
 *
 * `obrigatoria: false` é a coluna que só existe no export de 119 colunas — a
 * entrada é oportunista (regra 3 do plano) e não pode recusar o arquivo.
 */
type Formato = 'texto' | 'inteiro' | 'ptbr' | 'en' | 'data' | 'simnao';

interface Coluna {
  /** Nome no cabeçalho, já normalizado. */
  chave: string;
  formato: Formato;
  obrigatoria: boolean;
}

const COLUNAS: readonly Coluna[] = [
  { chave: 'codigovenda',         formato: 'texto',   obrigatoria: true  },
  { chave: 'nrdocumento',         formato: 'texto',   obrigatoria: true  },
  { chave: 'datavenda',           formato: 'data',    obrigatoria: true  },
  { chave: 'dataconfirmacao',     formato: 'data',    obrigatoria: true  },
  { chave: 'codigofranquia',      formato: 'texto',   obrigatoria: true  },
  { chave: 'franquia',            formato: 'texto',   obrigatoria: true  },
  /*
   * `Cliente` — quem comprou.
   *
   * Ficou de fora até 15/09/2026 por descuido, e o efeito apareceu na tela: as
   * 140 vendas projetadas mostravam «sem cliente» na frente do NR, todas.
   * Parecia dado que o relatório não traz; o relatório traz, na coluna 51, e
   * com ZERO vazios em 3.101 linhas — nos dois meses.
   *
   * `obrigatoria: true` de propósito: se um export futuro deixar de trazê-la, é
   * melhor a importação recusar e dizer qual coluna falta do que voltar a
   * gravar 140 nomes em branco sem ninguém perceber.
   */
  { chave: 'cliente',             formato: 'texto',   obrigatoria: true  },
  { chave: 'uf',                  formato: 'texto',   obrigatoria: true  },
  { chave: 'nomevendedor',        formato: 'texto',   obrigatoria: true  },
  { chave: 'loginvendedor',       formato: 'texto',   obrigatoria: true  },
  { chave: 'situacao',            formato: 'texto',   obrigatoria: true  },
  { chave: 'contratoassinado',    formato: 'simnao',  obrigatoria: true  },
  { chave: 'valorfaturamento',    formato: 'ptbr',    obrigatoria: true  },
  { chave: 'qtdeparcela',         formato: 'inteiro', obrigatoria: true  },
  { chave: 'valorparcela',        formato: 'en',      obrigatoria: true  },
  { chave: 'totalrecebido',       formato: 'en',      obrigatoria: true  },
  { chave: 'tiporecebimento',     formato: 'texto',   obrigatoria: true  },
  { chave: 'tipodocumento',       formato: 'texto',   obrigatoria: true  },
  { chave: 'produto',             formato: 'texto',   obrigatoria: true  },
  { chave: 'categoria',           formato: 'texto',   obrigatoria: true  },
  { chave: 'tipovenda',           formato: 'texto',   obrigatoria: true  },
  { chave: 'tipoproduto',         formato: 'texto',   obrigatoria: true  },
  { chave: 'datacancelamento',    formato: 'data',    obrigatoria: true  },
  { chave: 'datadevolucao',       formato: 'data',    obrigatoria: true  },
  { chave: 'motivocancelado',     formato: 'texto',   obrigatoria: true  },
  { chave: 'motivodevolucao',     formato: 'texto',   obrigatoria: true  },
  { chave: 'setorcancelamento',   formato: 'texto',   obrigatoria: true  },
  { chave: 'vendalead',           formato: 'simnao',  obrigatoria: true  },
  { chave: 'scoreclasse',         formato: 'texto',   obrigatoria: true  },
  { chave: 'spcserasa',           formato: 'texto',   obrigatoria: true  },
  // Só no export de 119 colunas. Ver regra 3 do plano.
  { chave: 'valorpixentrada',     formato: 'ptbr',    obrigatoria: false },
];

const LIMITE_ERROS = 50;

/** `Data_Confirmacao` → `dataconfirmacao`. Tira acento, pontuação e caixa. */
export function normalizarCabecalho(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Quebra uma linha de CSV respeitando aspas.
 *
 * O arquivo medido não tem nenhuma aspa dupla — um `split(';')` daria o mesmo
 * resultado. O tratamento existe para o dia em que um nome de cliente vier com
 * `;` dentro: o split silencioso jogaria as colunas uma casa para o lado e o
 * `Valor_Faturamento` viraria outra coisa, sem erro nenhum.
 */
export function quebrarLinhaCsv(linha: string, sep = ';'): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
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

/** `3.816,00` → 3816. Ponto é milhar, vírgula é decimal. */
export function numeroPtBr(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** `159.0` → 159. Ponto é decimal e não existe separador de milhar. */
export function numeroEn(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function inteiro(v: string): number | null {
  const n = numeroEn(v);
  return n === null ? null : Math.trunc(n);
}

function texto(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

/** `Sim` → true. Qualquer outra coisa, inclusive vazio, é false. */
function simNao(v: string): boolean {
  return v.trim().toLowerCase() === 'sim';
}

const ISO_DATA = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Só a data, de `2026-09-08` ou de `2026-09-08 00:00:00.000`.
 *
 * As duas formas convivem no mesmo arquivo: `Data_Venda` vem só com a data e
 * `Data_Confirmacao` vem com hora. Cortar em dez caracteres resolve as duas sem
 * precisar saber qual coluna é qual.
 */
function data(v: string): string | null {
  const m = ISO_DATA.exec(v.trim());
  return m ? m[1] : null;
}

/**
 * A situação do ERP na do sistema.
 *
 * O geral só traz três. `Aberta` existe no tipo porque o relatório do setor a
 * traz — e porque o operador lança nela — mas encontrá-la aqui seria sinal de
 * que o arquivo não é o que se pensa, então ela também é aceita.
 */
export function situacaoDoErp(v: string): SituacaoVenda | null {
  switch (v.trim().toLowerCase()) {
    case 'confirmada': return 'confirmada';
    case 'cancelada':  return 'cancelada';
    case 'devolvida':  return 'devolvida';
    case 'aberta':     return 'aberta';
    default:           return null;
  }
}

export function parseProspeccao(conteudo: string): ResultadoParseProspeccao {
  const vazio: ResultadoParseProspeccao = {
    linhas: [], franquias: [], mes: null, cabecalho: [], colunasFaltando: [],
    erros: [], descartadas: 0, duplicadosResolvidos: [],
    faturamentoNaRegua: 0, quantidadeNaRegua: 0,
  };

  const texto0 = conteudo.replace(/^\uFEFF/, '');
  const linhasBrutas = texto0.split(/\r?\n/);
  if (linhasBrutas.length === 0 || linhasBrutas[0].trim() === '') {
    return { ...vazio, erros: ['Arquivo vazio ou sem cabeçalho.'] };
  }

  const cabecalho = quebrarLinhaCsv(linhasBrutas[0]).map(c => c.trim());
  const indice = new Map<string, number>();
  cabecalho.forEach((c, i) => {
    const n = normalizarCabecalho(c);
    // Primeira ocorrência vence: cabeçalho repetido não troca a coluna mapeada.
    if (n && !indice.has(n)) indice.set(n, i);
  });

  const colunasFaltando = COLUNAS
    .filter(c => c.obrigatoria && !indice.has(c.chave))
    .map(c => c.chave);
  if (colunasFaltando.length > 0) {
    return { ...vazio, cabecalho, colunasFaltando };
  }

  const cru = (campos: string[], chave: string): string => {
    const i = indice.get(chave);
    return i === undefined ? '' : (campos[i] ?? '');
  };

  /*
   * O duplicado é resolvido por MAPA, e a última ocorrência vence.
   *
   * Vence a última porque o arquivo vem em ordem de confirmação e a linha viva
   * é a mais recente: o caso medido é `13075361`, que aparece devolvida (PEC 4
   * PÓS, 28×249 = 6.972,00) e depois confirmada (PEC 1 PÓS, 16×175 = 2.800,00).
   * Somar as duas contaria R$ 9.772,00 numa venda de R$ 2.800,00.
   */
  const porNr = new Map<string, LinhaProspeccao>();
  const duplicados = new Set<string>();
  const franquias = new Map<string, FranquiaVista>();
  const meses = new Set<string>();
  const erros: string[] = [];
  let descartadas = 0;

  const recusar = (linhaNum: number, motivo: string) => {
    descartadas++;
    if (erros.length < LIMITE_ERROS) erros.push(`Linha ${linhaNum}: ${motivo}`);
  };

  for (let i = 1; i < linhasBrutas.length; i++) {
    const bruta = linhasBrutas[i];
    if (bruta.trim() === '') continue;        // última linha do arquivo
    const linhaNum = i + 1;                   // 1-based, contando o cabeçalho
    const campos = quebrarLinhaCsv(bruta);

    const nr = cru(campos, 'nrdocumento').trim();
    if (nr === '') { recusar(linhaNum, 'NrDocumento vazio.'); continue; }

    const dataConfirmacao = data(cru(campos, 'dataconfirmacao'));
    if (dataConfirmacao === null) {
      recusar(linhaNum, 'Data_Confirmacao ausente ou fora do formato aaaa-mm-dd.');
      continue;
    }

    const dataVenda = data(cru(campos, 'datavenda'));
    if (dataVenda === null) {
      recusar(linhaNum, 'Data_Venda ausente ou fora do formato aaaa-mm-dd.');
      continue;
    }

    const situacao = situacaoDoErp(cru(campos, 'situacao'));
    if (situacao === null) {
      recusar(linhaNum, `Situação desconhecida ("${cru(campos, 'situacao').trim()}").`);
      continue;
    }

    const valorTotal = numeroPtBr(cru(campos, 'valorfaturamento'));
    if (valorTotal === null) {
      recusar(linhaNum, `Valor_Faturamento não é número ("${cru(campos, 'valorfaturamento')}").`);
      continue;
    }

    const codigoFranquia = cru(campos, 'codigofranquia').trim();
    if (codigoFranquia === '') {
      // Sem o código não há como ligar a linha a setor nenhum, e deixá-la
      // entrar criaria faturamento que nunca aparece em lugar algum.
      recusar(linhaNum, 'Codigo_Franquia vazio — sem ele a venda não tem como ser vinculada.');
      continue;
    }

    const linha: LinhaProspeccao = {
      codigo_venda:       cru(campos, 'codigovenda').trim(),
      nr_documento:       nr,
      data_venda:         dataVenda,
      data_confirmacao:   dataConfirmacao,
      codigo_franquia:    codigoFranquia,
      franquia:           cru(campos, 'franquia').trim(),
      cliente:            texto(cru(campos, 'cliente')),
      uf:                 texto(cru(campos, 'uf'))?.toUpperCase() ?? null,
      nome_vendedor:      texto(cru(campos, 'nomevendedor')),
      login_vendedor:     texto(cru(campos, 'loginvendedor'))?.toLowerCase() ?? null,
      situacao,
      contrato_assinado:  simNao(cru(campos, 'contratoassinado')),
      valor_total:        valorTotal,
      qtde_parcela:       inteiro(cru(campos, 'qtdeparcela')),
      valor_parcela:      numeroEn(cru(campos, 'valorparcela')),
      valor_recebido:     numeroEn(cru(campos, 'totalrecebido')) ?? 0,
      tipo_recebimento:   texto(cru(campos, 'tiporecebimento')),
      tipo_documento:     texto(cru(campos, 'tipodocumento')),
      valor_entrada:      numeroPtBr(cru(campos, 'valorpixentrada')),
      produto:            texto(cru(campos, 'produto')),
      categoria:          texto(cru(campos, 'categoria')),
      tipo_venda:         texto(cru(campos, 'tipovenda')),
      tipo_produto:       texto(cru(campos, 'tipoproduto')),
      data_cancelamento:  data(cru(campos, 'datacancelamento')),
      data_devolucao:     data(cru(campos, 'datadevolucao')),
      // Um motivo só: a linha é cancelada OU devolvida, nunca as duas.
      motivo:             texto(cru(campos, 'motivocancelado'))
                          ?? texto(cru(campos, 'motivodevolucao')),
      setor_cancelamento: texto(cru(campos, 'setorcancelamento')),
      veio_de_lead:       simNao(cru(campos, 'vendalead')),
      score_classe:       texto(cru(campos, 'scoreclasse')),
      spc_serasa:         texto(cru(campos, 'spcserasa')),
      linha_num:          linhaNum,
    };

    if (porNr.has(nr)) duplicados.add(nr);
    porNr.set(nr, linha);
    meses.add(dataConfirmacao.slice(0, 7));
  }

  /*
   * As franquias são contadas DEPOIS do dedupe.
   *
   * Contá-las dentro do laço somaria o faturamento das duas linhas do NR
   * duplicado — o mesmo R$ 9.772,00 que o mapa acabou de resolver. A tela do
   * de-para mostra o peso da decisão, e o peso precisa estar certo.
   */
  for (const l of porNr.values()) {
    const vista = franquias.get(l.codigo_franquia);
    if (vista) {
      vista.linhas += 1;
      vista.faturamento += l.valor_total;
      // Último nome visto vence — é rótulo, e o arquivo pode tê-lo atualizado.
      if (l.franquia) vista.nome = l.franquia;
    } else {
      franquias.set(l.codigo_franquia, {
        codigo: l.codigo_franquia,
        nome: l.franquia,
        linhas: 1,
        faturamento: l.valor_total,
      });
    }
  }

  const linhas = [...porNr.values()];
  let faturamentoNaRegua = 0;
  let quantidadeNaRegua = 0;
  for (const l of linhas) {
    if (l.situacao === 'confirmada' && l.contrato_assinado) {
      faturamentoNaRegua += l.valor_total;
      quantidadeNaRegua += 1;
    }
  }

  if (meses.size > 1) {
    erros.push(
      `O arquivo mistura ${meses.size} meses de confirmação (${[...meses].sort().join(', ')}). `
      + 'Cada lote é o retrato de UM mês.',
    );
  }

  return {
    linhas,
    franquias: [...franquias.values()].sort((a, b) => b.faturamento - a.faturamento),
    mes: meses.size === 1 ? [...meses][0] : null,
    cabecalho,
    colunasFaltando: [],
    erros,
    descartadas,
    duplicadosResolvidos: [...duplicados],
    faturamentoNaRegua: Math.round(faturamentoNaRegua * 100) / 100,
    quantidadeNaRegua,
  };
}
