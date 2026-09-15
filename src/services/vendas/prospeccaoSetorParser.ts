/**
 * prospeccaoSetorParser.ts — o relatório do SETOR vira linhas.
 *
 * ## Por que não dá para reusar o parser do geral
 *
 * São o mesmo relatório, e são dois arquivos diferentes em tudo que importa
 * para quem lê:
 *
 *                       geral                    setor
 *   formato .......... CSV, 60 colunas          XLSX, 119 colunas
 *   cabeçalho ........ uma linha                DUAS — grupo e nome
 *   recorte .......... data de confirmação      data da venda
 *   traz «Aberta» .... nunca                    sim
 *   franquia ......... código + nome            SÓ o nome
 *   datas ............ `2026-09-08`             serial do Excel (46266)
 *
 * ## O nome da coluna não é chave neste arquivo
 *
 * Medido nas 119 colunas: `Data` aparece **cinco vezes** — venda, link de
 * pagamento, confirmação, cancelamento e devolução. `Observação` sete,
 * `Número` seis, `#` sete, `Setor` e `Informação` duas cada.
 *
 * Um parser que mapeasse por nome pegaria a primeira ocorrência e leria a data
 * da venda onde deveria ler a da confirmação, sem erro nenhum. A chave aqui é
 * **grupo + nome**: a linha 1 traz o grupo (`Prospecção`, `Confirmação`,
 * `Cancelamento`), preenchido só na primeira coluna de cada bloco, e vale até o
 * próximo grupo aparecer.
 *
 * ## Franquia vem sem código, e isso enfraquece o vínculo
 *
 * O geral traz `Codigo_Franquia`, que é chave estável — medido: 80 códigos nos
 * dois meses, zero ambiguidade. O do setor traz só o nome.
 *
 * Então aqui o nome é o que há, e o de-para casa por ele. Funciona porque
 * nenhum nome aparece com dois códigos, mas é vínculo mais fraco: renomear a
 * franquia no ERP quebra o casamento até alguém reimportar o geral. Por isso a
 * descoberta de franquia nova continua sendo trabalho do geral — ver
 * `fn_vendas_lote_promover`.
 *
 * ## Esta é a PRÉVIA, e ela nunca vira venda sozinha
 *
 * 45 das 205 linhas medidas não têm data de confirmação — são as 23 abertas e
 * parte das canceladas. Projetá-las como oficial daria mês a quem não tem.
 * O que este arquivo faz é adiantar e conferir; quem escreve no placar é o
 * geral.
 */
import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import type { SituacaoVenda } from '@/lib/vendas';
import { situacaoDoErp } from './prospeccaoParser';

/** Uma linha do relatório do setor. Espelha `LinhaProspeccao` no que coincide. */
export interface LinhaSetor {
  nr_documento: string;
  cliente: string | null;
  data_venda: string;
  /** `null` na venda ainda aberta — e é justamente o que o geral não enxerga. */
  data_confirmacao: string | null;
  /** Sempre `null`: o arquivo do setor não traz o código. */
  codigo_franquia: null;
  franquia: string;
  uf: string | null;
  nome_vendedor: string | null;
  login_vendedor: string | null;
  situacao: SituacaoVenda;
  contrato_assinado: boolean;
  valor_total: number;
  qtde_parcela: number | null;
  valor_parcela: number | null;
  valor_recebido: number;
  valor_entrada: number | null;
  tipo_recebimento: string | null;
  tipo_documento: string | null;
  produto: string | null;
  tipo_venda: string | null;
  data_cancelamento: string | null;
  data_devolucao: string | null;
  motivo: string | null;
  setor_cancelamento: string | null;
  linha_num: number;
}

export interface FranquiaVistaSetor {
  /** Sem código: o casamento com o de-para é por nome. */
  nome: string;
  linhas: number;
  faturamento: number;
}

export interface ResultadoParseSetor {
  linhas: LinhaSetor[];
  franquias: FranquiaVistaSetor[];
  /** 'yyyy-MM' pelo eixo da VENDA — o recorte deste arquivo. */
  mes: string | null;
  colunasFaltando: string[];
  erros: string[];
  descartadas: number;
  duplicadosResolvidos: string[];
  /** Quantas linhas ainda estão abertas. É o que só este relatório enxerga. */
  abertas: number;
  /** Quantas já têm data de confirmação — as que o geral também deve ter. */
  confirmadasNoArquivo: number;
  faturamentoNaRegua: number;
  quantidadeNaRegua: number;
}

/**
 * As colunas que o sistema guarda, endereçadas por GRUPO + NOME.
 *
 * `grupo: null` é a coluna que vem antes de qualquer grupo (as quatro primeiras
 * do arquivo). Ver o cabeçalho: nome sozinho não é chave aqui.
 */
interface Endereco {
  grupo: string | null;
  nome: string;
  obrigatoria: boolean;
}

const COLUNAS: Record<string, Endereco> = {
  nr_documento:       { grupo: 'Identificação da Prospecção', nome: 'Nr.Doc',      obrigatoria: true  },
  cliente:            { grupo: 'Identificação da Prospecção', nome: 'Cliente',     obrigatoria: true  },
  uf:                 { grupo: 'Identificação da Prospecção', nome: 'UF',          obrigatoria: true  },
  data_venda:         { grupo: 'Prospecção', nome: 'Data',          obrigatoria: true  },
  franquia:           { grupo: 'Prospecção', nome: 'Franquia',      obrigatoria: true  },
  nome_vendedor:      { grupo: 'Prospecção', nome: 'Vendedor',      obrigatoria: true  },
  login_vendedor:     { grupo: 'Prospecção', nome: 'Login',         obrigatoria: true  },
  situacao:           { grupo: 'Prospecção', nome: 'Sit. Venda',    obrigatoria: true  },
  qtde_parcela:       { grupo: 'Prospecção', nome: 'Parcelas',      obrigatoria: true  },
  valor_parcela:      { grupo: 'Prospecção', nome: 'Valor Parcela', obrigatoria: true  },
  valor_total:        { grupo: 'Prospecção', nome: 'Valor Total',   obrigatoria: true  },
  produto:            { grupo: 'Prospecção', nome: 'Produto',       obrigatoria: false },
  // A assinatura mora no grupo do plano, e é a outra metade da régua.
  contrato_assinado:  { grupo: 'Plano Bookplay', nome: 'Assinado',  obrigatoria: true  },
  tipo_documento:     { grupo: 'Tp.Doc / Valores', nome: 'Tipo de Documento',  obrigatoria: false },
  valor_entrada:      { grupo: 'Tp.Doc / Valores', nome: 'Valor PIX Entrada',  obrigatoria: false },
  valor_recebido:     { grupo: 'Tp.Doc / Valores', nome: 'Total Recebido',     obrigatoria: true  },
  tipo_recebimento:   { grupo: 'Tp.Doc / Valores', nome: 'Tipo Recebimento',   obrigatoria: false },
  tipo_venda:         { grupo: 'Categorias', nome: 'Tipo de venda', obrigatoria: false },
  // As três `Data` que não são a da venda. Sem o grupo, todas cairiam na mesma.
  data_confirmacao:   { grupo: 'Confirmação',  nome: 'Data',            obrigatoria: true  },
  data_cancelamento:  { grupo: 'Cancelamento', nome: 'Data',            obrigatoria: false },
  motivo_cancelado:   { grupo: 'Cancelamento', nome: 'Motivo',          obrigatoria: false },
  setor_cancelamento: { grupo: 'Cancelamento', nome: 'Setor',           obrigatoria: false },
  data_devolucao:     { grupo: 'Devolução',    nome: 'Data',            obrigatoria: false },
  motivo_devolucao:   { grupo: 'Devolução',    nome: 'Motivo Devolução', obrigatoria: false },
};

const LIMITE_ERROS = 50;

function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * O serial do Excel vira `yyyy-MM-dd`.
 *
 * A época é 1899-12-30 e não 1900-01-01: o Excel trata 1900 como bissexto, que
 * não foi, e a data base compensa o dia fantasma. Medido no arquivo: `46266` é
 * 2026-09-01, e `46266.4241849537` é o mesmo dia às 10h10.
 *
 * A parte fracionária é a hora e vai fora — o sistema guarda data, e manter a
 * hora faria duas linhas do mesmo dia parecerem dias diferentes ao agrupar.
 */
export function dataDoSerial(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  // O arquivo pode vir com a data já em texto ISO se alguém reexportar por
  // outro caminho. Aceitar as duas formas custa uma linha.
  const txt = String(valor).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(txt);
  if (iso) return iso[1];

  const n = Number(txt);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Número de célula do Excel.
 *
 * Aqui os valores chegam como número de verdade (`4736.2`), e não como texto
 * pt-BR — o oposto do CSV geral, onde `Valor_Faturamento` vem `3.816,00`. Por
 * isso não há tratamento de vírgula: inventá-lo faria `1,5` virar 15 no dia em
 * que a biblioteca mudasse de comportamento.
 */
function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? n : null;
}

function texto(valor: unknown): string | null {
  const t = String(valor ?? '').trim();
  return t === '' ? null : t;
}

function simNao(valor: unknown): boolean {
  return String(valor ?? '').trim().toLowerCase() === 'sim';
}

/**
 * Onde cada endereço (grupo + nome) caiu, pelo índice da coluna.
 *
 * O grupo da linha 1 é preenchido só na primeira coluna do bloco e vale até o
 * próximo aparecer — é assim que a planilha desenha o cabeçalho mesclado.
 */
export function mapearColunas(
  linhaGrupo: readonly unknown[],
  linhaNome: readonly unknown[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  let grupoAtual = '';

  const largura = Math.max(linhaGrupo.length, linhaNome.length);
  for (let i = 0; i < largura; i++) {
    const g = String(linhaGrupo[i] ?? '').trim();
    if (g) grupoAtual = g;
    const nome = String(linhaNome[i] ?? '').trim();
    if (!nome) continue;
    const chave = `${normalizar(grupoAtual)}|${normalizar(nome)}`;
    // Primeira ocorrência vence, como no parser do geral.
    if (!mapa.has(chave)) mapa.set(chave, i);
  }
  return mapa;
}

function indiceDe(mapa: Map<string, number>, e: Endereco): number | undefined {
  // `grupo: null` é a coluna antes de qualquer grupo — o grupo corrente ainda
  // é vazio, e a chave nasce com o lado esquerdo em branco.
  const comGrupo = `${normalizar(e.grupo ?? '')}|${normalizar(e.nome)}`;
  if (mapa.has(comGrupo)) return mapa.get(comGrupo);
  return undefined;
}

export function parseProspeccaoSetor(arquivo: ArrayBuffer): ResultadoParseSetor {
  const vazio: ResultadoParseSetor = {
    linhas: [], franquias: [], mes: null, colunasFaltando: [], erros: [],
    descartadas: 0, duplicadosResolvidos: [], abertas: 0, confirmadasNoArquivo: 0,
    faturamentoNaRegua: 0, quantidadeNaRegua: 0,
  };

  let grade: unknown[][];
  try {
    const wb = xlsxRead(arquivo, { type: 'array', cellDates: false, raw: true });
    const nomeAba = wb.SheetNames[0];
    if (!nomeAba) return { ...vazio, erros: ['A planilha não tem aba nenhuma.'] };
    grade = xlsxUtils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], {
      header: 1, defval: '', raw: true,
    }) as unknown[][];
  } catch {
    return { ...vazio, erros: ['Não foi possível ler a planilha. Ela é um .xlsx?'] };
  }

  if (grade.length < 3) {
    return { ...vazio, erros: ['A planilha não tem as duas linhas de cabeçalho e ao menos uma venda.'] };
  }

  const mapa = mapearColunas(grade[0] ?? [], grade[1] ?? []);
  const indices = new Map<string, number>();
  const colunasFaltando: string[] = [];

  for (const [campo, endereco] of Object.entries(COLUNAS)) {
    const i = indiceDe(mapa, endereco);
    if (i === undefined) {
      if (endereco.obrigatoria) {
        colunasFaltando.push(`${endereco.grupo ?? '—'} › ${endereco.nome}`);
      }
      continue;
    }
    indices.set(campo, i);
  }

  if (colunasFaltando.length > 0) return { ...vazio, colunasFaltando };

  const at = (linha: unknown[], campo: string): unknown => {
    const i = indices.get(campo);
    return i === undefined ? '' : linha[i];
  };

  const porNr = new Map<string, LinhaSetor>();
  const duplicados = new Set<string>();
  const meses = new Set<string>();
  const erros: string[] = [];
  let descartadas = 0;

  const recusar = (n: number, motivo: string) => {
    descartadas++;
    if (erros.length < LIMITE_ERROS) erros.push(`Linha ${n}: ${motivo}`);
  };

  for (let i = 2; i < grade.length; i++) {
    const linha = grade[i] ?? [];
    const linhaNum = i + 1;

    const nr = String(at(linha, 'nr_documento') ?? '').trim();
    if (nr === '') continue;          // linha de rodapé ou vazia

    const dataVenda = dataDoSerial(at(linha, 'data_venda'));
    if (dataVenda === null) {
      recusar(linhaNum, 'Data da venda ausente ou ilegível.');
      continue;
    }

    const situacao = situacaoDoErp(String(at(linha, 'situacao') ?? ''));
    if (situacao === null) {
      recusar(linhaNum, `Situação desconhecida ("${String(at(linha, 'situacao') ?? '').trim()}").`);
      continue;
    }

    const valorTotal = numero(at(linha, 'valor_total'));
    if (valorTotal === null) {
      recusar(linhaNum, 'Valor Total não é número.');
      continue;
    }

    const franquia = String(at(linha, 'franquia') ?? '').trim();
    if (franquia === '') {
      recusar(linhaNum, 'Franquia vazia — sem ela a venda não tem como ser vinculada a setor.');
      continue;
    }

    const registro: LinhaSetor = {
      nr_documento:       nr,
      cliente:            texto(at(linha, 'cliente')),
      data_venda:         dataVenda,
      data_confirmacao:   dataDoSerial(at(linha, 'data_confirmacao')),
      codigo_franquia:    null,
      franquia,
      uf:                 texto(at(linha, 'uf'))?.toUpperCase() ?? null,
      nome_vendedor:      texto(at(linha, 'nome_vendedor')),
      login_vendedor:     texto(at(linha, 'login_vendedor'))?.toLowerCase() ?? null,
      situacao,
      contrato_assinado:  simNao(at(linha, 'contrato_assinado')),
      valor_total:        valorTotal,
      qtde_parcela:       numero(at(linha, 'qtde_parcela')),
      valor_parcela:      numero(at(linha, 'valor_parcela')),
      valor_recebido:     numero(at(linha, 'valor_recebido')) ?? 0,
      valor_entrada:      numero(at(linha, 'valor_entrada')),
      tipo_recebimento:   texto(at(linha, 'tipo_recebimento')),
      tipo_documento:     texto(at(linha, 'tipo_documento')),
      produto:            texto(at(linha, 'produto')),
      tipo_venda:         texto(at(linha, 'tipo_venda')),
      data_cancelamento:  dataDoSerial(at(linha, 'data_cancelamento')),
      data_devolucao:     dataDoSerial(at(linha, 'data_devolucao')),
      motivo:             texto(at(linha, 'motivo_cancelado')) ?? texto(at(linha, 'motivo_devolucao')),
      setor_cancelamento: texto(at(linha, 'setor_cancelamento')),
      linha_num:          linhaNum,
    };

    if (porNr.has(nr)) duplicados.add(nr);
    porNr.set(nr, registro);
    meses.add(dataVenda.slice(0, 7));
  }

  const linhas = [...porNr.values()];

  // As franquias são contadas depois do dedupe, pelo mesmo motivo do geral: o
  // NR repetido somaria o faturamento duas vezes.
  const franquias = new Map<string, FranquiaVistaSetor>();
  let abertas = 0, confirmadasNoArquivo = 0;
  let faturamentoNaRegua = 0, quantidadeNaRegua = 0;

  for (const l of linhas) {
    const f = franquias.get(l.franquia);
    if (f) { f.linhas += 1; f.faturamento += l.valor_total; }
    else franquias.set(l.franquia, { nome: l.franquia, linhas: 1, faturamento: l.valor_total });

    if (l.situacao === 'aberta') abertas += 1;
    if (l.data_confirmacao) confirmadasNoArquivo += 1;
    if (l.situacao === 'confirmada' && l.contrato_assinado) {
      faturamentoNaRegua += l.valor_total;
      quantidadeNaRegua += 1;
    }
  }

  if (meses.size > 1) {
    erros.push(
      `O arquivo mistura ${meses.size} meses de venda (${[...meses].sort().join(', ')}). `
      + 'Cada lote é o retrato de UM mês.',
    );
  }

  return {
    linhas,
    franquias: [...franquias.values()].sort((a, b) => b.faturamento - a.faturamento),
    mes: meses.size === 1 ? [...meses][0] : null,
    colunasFaltando: [],
    erros,
    descartadas,
    duplicadosResolvidos: [...duplicados],
    abertas,
    confirmadasNoArquivo,
    faturamentoNaRegua: Math.round(faturamentoNaRegua * 100) / 100,
    quantidadeNaRegua,
  };
}
