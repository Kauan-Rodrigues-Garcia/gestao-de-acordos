/**
 * src/lib/importar_excel_parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor ADAPTATIVO de parsing das planilhas de importação de acordos.
 *
 * Diferente do parser antigo (posição fixa: A=NR, B=Nome, …), este módulo
 * reconhece cada campo pelo SIGNIFICADO do cabeçalho, em qualquer ordem/posição,
 * usando `detectarCampo` / `detectarCampoHeader` de `importar_excel_keywords.ts`.
 *
 * Suporta dois layouts:
 *  ─ 'tabela'  → um único cabeçalho + linhas de dados (modelo padrão da imagem).
 *  ─ 'blocos'  → várias seções, cada uma iniciada por uma linha só-data
 *                (ex.: "14/04/2026") seguida de cabeçalho + linhas; o vencimento
 *                de cada registro vem da data do seu bloco quando não há coluna
 *                de vencimento própria.
 *
 * É PURO (sem JSX / sem Supabase) para permitir testes unitários rápidos. A
 * página `ImportarExcel.tsx` re-exporta `parsearPlanilha` e `classificarLinha`
 * daqui e faz a validação de obrigatoriedade + montagem de payload por tenant.
 *
 * ⚠️ Bookplay ≠ PaguePlay: a detecção de colunas é compartilhada (header-driven),
 * mas a semântica (chave, estado/UF, valor) é resolvida no consumidor via
 * `validarColunasObrigatorias(mapa, isPaguePlay, modo)` e no payload da página.
 */
import {
  detectarCampo,
  detectarCampoHeader,
  type CampoDestino,
} from './importar_excel_keywords';

// ─── Normalizers (extraídos de ImportarExcel.tsx — comportamento idêntico) ─────

/** UF válida (2 letras) ou null. */
export function normUF(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** Forma de pagamento normalizada para o enum interno. */
export function normTipo(v: unknown): string {
  const s = String(v ?? '').toLowerCase().trim();
  if (s.includes('recorr')) return 'cartao_recorrente';
  if (s.includes('auto'))  return 'pix_automatico';
  if (s.includes('pix'))   return 'pix';
  if (s.includes('cart'))  return 'cartao';
  return 'boleto';
}

/** Quantidade de parcelas (>= 1). Aceita "3x", "3", 3. */
export function normParcelas(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(1, Math.round(v));
  const m = String(v ?? '').match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 1;
  return n >= 1 ? n : 1;
}

/** Valor monetário > 0 ou null. Aceita number, "1.234,56", "R$ 1.234,56". */
export function normValor(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 ? v : null;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const clean = s.includes(',') && s.includes('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Data para ISO (yyyy-mm-dd). Aceita serial Excel, dd/mm/yyyy e yyyy-mm-dd. */
export function normData(v: unknown): string | null {
  if (!v || v === '') return null;
  if (typeof v === 'number' && v > 36526 && v < 47848) {
    // Serial do Excel: o número JÁ é uma data em UTC, não um instante local.
    // Este é o único lugar do projeto onde `toISOString().split` está certo —
    // em qualquer outro, use `getTodayISO()` (ver lib/index.ts). Ler com
    // `getDate()` local é que estragaria a data aqui.
    const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m1) {
    const year = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
    const iso  = `${year}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
    if (!isNaN(new Date(iso).getTime())) return iso;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** Status normalizado. Sem valor reconhecível → 'verificar_pendente'.
 *  'não pago'/'nao pago' são checados ANTES de 'pago' — senão o substring
 *  "pago" dentro de "não pago" classificaria o registro como pago. */
export function normStatus(v: unknown): string {
  const s = String(v ?? '').toLowerCase().trim();
  if (s.includes('não pago') || s.includes('nao pago') || s.includes('cancelado') || s.includes('inadimplente')) return 'nao_pago';
  if (s.includes('pago') || s.includes('quitado') || s.includes('liquidado')) return 'pago';
  return 'verificar_pendente';
}

/** WhatsApp: só dígitos (10 a 13) ou null. */
export function normWhatsapp(v: unknown): string | null {
  if (!v) return null;
  const raw    = typeof v === 'number' ? String(Math.round(v)) : String(v);
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13 ? digits : null;
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type TipoLinha = 'vazia' | 'ruido' | 'data_bloco' | 'cabecalho' | 'acordo_bloco';
export type ModoParse = 'tabela' | 'blocos';

export interface RegistroImportado {
  linha:           number;
  /** Índice do bloco (1-based) no modo 'blocos'; null no modo 'tabela'. */
  bloco:           number | null;
  /** Aba de origem quando a planilha tem múltiplas abas (DIRETO/EXTRA).
   *  Preenchido pela página ao combinar as abas; ausente = 'direto'. */
  abaOrigem?:      'direto' | 'extra';
  /** Linha real na planilha de origem (para exibição) quando `linha` foi
   *  deslocada para um namespace próprio (aba EXTRA). Ver OFFSET_ABA_EXTRA. */
  linhaPlanilha?:  number;
  /** Bookplay: NR do cliente (chave). PaguePlay: ''. */
  nr_cliente:      string;
  /** Bookplay: instituição (livre). PaguePlay: código/Inscrição (chave). */
  instituicao:     string;
  nome_cliente:    string;
  whatsapp:        string | null;
  estado_uf:       string | null;
  tipo:            string;
  parcelas:        number;
  /** Valor reconhecido bruto. Bookplay: por parcela. PaguePlay: total. */
  valor:           number | null;
  vencimento:      string | null;
  status:          string;
  observacoes_raw: string | null;
  valido:          boolean;
  erros:           string[];
}

export interface ResultadoParse {
  registros: RegistroImportado[];
  modo:      ModoParse;
  /** Quantidade de blocos de data (0 no modo 'tabela'). */
  blocos:    number;
  /** Mapa campo → índice detectado no cabeçalho (para validação de colunas). */
  mapa:      MapaColunas;
}

/** Mapa campo lógico → índice da coluna na planilha. */
export type MapaColunas = Partial<Record<CampoDestino, number>>;

// ─── Classificação de linha ─────────────────────────────────────────────────────

/** Nº mínimo de cabeçalhos reconhecidos (detecção estrita) para uma linha ser
 *  considerada 'cabecalho'. Linhas de dados nunca ultrapassam 1 falso-positivo. */
const CABECALHO_MIN_RECONHECIDOS = 3;

function celulas(row: unknown[]): string[] {
  return (row ?? []).map(c => (c === null || c === undefined) ? '' : String(c).trim());
}

/**
 * Classifica uma linha da planilha em uma das categorias de layout.
 *
 * - 'vazia'        → nenhuma célula preenchida.
 * - 'data_bloco'   → exatamente uma célula preenchida e ela é uma data (topo de bloco).
 * - 'cabecalho'    → várias células reconhecidas como header (detecção estrita,
 *                    evita que "CLIENTE A"/"BANCO X" inflem a contagem).
 * - 'acordo_bloco' → linha de dados (tem valor/data ou >= 3 células preenchidas).
 * - 'ruido'        → linha decorativa ("Dados Obrigatórios/Opcionais" etc.).
 */
export function classificarLinha(row: unknown[]): TipoLinha {
  const cells    = celulas(row);
  const nonEmpty = cells.filter(c => c !== '');
  if (nonEmpty.length === 0) return 'vazia';

  if (nonEmpty.length === 1 && normData(nonEmpty[0]) !== null) return 'data_bloco';

  const reconhecidos = cells.filter(c => c !== '' && detectarCampoHeader(c) !== '_ignorar').length;
  if (reconhecidos >= CABECALHO_MIN_RECONHECIDOS) return 'cabecalho';

  const temValorOuData = cells.some(c => c !== '' && (normValor(c) !== null || normData(c) !== null));
  if (temValorOuData || nonEmpty.length >= 3) return 'acordo_bloco';

  return 'ruido';
}

// ─── Construção do mapa de colunas ──────────────────────────────────────────────

/** Constrói o mapa campo → índice a partir de uma linha de cabeçalho.
 *  Primeira ocorrência de cada campo vence (colunas duplicadas são ignoradas). */
export function construirMapa(headerRow: unknown[]): MapaColunas {
  const mapa: MapaColunas = {};
  celulas(headerRow).forEach((txt, idx) => {
    if (!txt) return;
    const campo = detectarCampo(txt);
    if (campo === '_ignorar') return;
    if (mapa[campo] === undefined) mapa[campo] = idx;
  });
  return mapa;
}

function cel(row: unknown[], mapa: MapaColunas, campo: CampoDestino): unknown {
  const idx = mapa[campo];
  return idx === undefined ? '' : row[idx];
}

function montarRegistro(
  row: unknown[],
  mapa: MapaColunas,
  linha: number,
  bloco: number | null,
  dataBloco: string | null,
): RegistroImportado {
  const nr_cliente   = String(cel(row, mapa, 'nr_cliente') ?? '').trim();
  const instituicao  = String(cel(row, mapa, 'instituicao') ?? '').trim();
  const nome_cliente = String(cel(row, mapa, 'nome_cliente') ?? '').trim();
  const whatsapp     = normWhatsapp(cel(row, mapa, 'whatsapp'));
  const estado_uf    = normUF(cel(row, mapa, 'estado_uf'));
  const tipo         = normTipo(cel(row, mapa, 'tipo'));
  const parcelas     = normParcelas(cel(row, mapa, 'parcelas'));
  const valor        = normValor(cel(row, mapa, 'valor'));
  const vencProprio  = mapa.vencimento !== undefined ? normData(cel(row, mapa, 'vencimento')) : null;
  const vencimento   = vencProprio ?? dataBloco;
  const status       = normStatus(cel(row, mapa, 'status'));
  const observacoes_raw = String(cel(row, mapa, 'observacoes') ?? '').trim() || null;

  const chave = nr_cliente || instituicao;
  const erros: string[] = [];
  if (!chave)         erros.push('NR/Inscrição ausente');
  if (valor === null) erros.push('Valor inválido');
  if (!vencimento)    erros.push('Vencimento inválido');

  return {
    linha, bloco, nr_cliente, instituicao, nome_cliente, whatsapp, estado_uf,
    tipo, parcelas, valor, vencimento, status, observacoes_raw,
    valido: erros.length === 0, erros,
  };
}

// ─── Parser principal ───────────────────────────────────────────────────────────

/**
 * Parseia a planilha (matriz de linhas) de forma adaptativa.
 * Detecta o modo, localiza o(s) cabeçalho(s) em qualquer posição e mapeia
 * colunas por significado. Sempre retorna registros — a validação de colunas
 * obrigatórias fica a cargo do consumidor (`validarColunasObrigatorias`).
 */
export function parsearPlanilha(rows: unknown[][]): ResultadoParse {
  const tipos = rows.map(classificarLinha);
  const modo: ModoParse = tipos.includes('data_bloco') ? 'blocos' : 'tabela';
  const registros: RegistroImportado[] = [];

  if (modo === 'tabela') {
    const headerIdx = tipos.indexOf('cabecalho');
    const mapa = headerIdx >= 0 ? construirMapa(rows[headerIdx]) : {};
    for (let i = headerIdx >= 0 ? headerIdx + 1 : 0; i < rows.length; i++) {
      if (tipos[i] !== 'acordo_bloco') continue;
      registros.push(montarRegistro(rows[i], mapa, i + 1, null, null));
    }
    return { registros, modo, blocos: 0, mapa };
  }

  // Modo 'blocos': percorre linear mantendo o mapa e a data do bloco corrente.
  let mapa: MapaColunas = {};
  let dataBloco: string | null = null;
  let bloco = 0;
  for (let i = 0; i < rows.length; i++) {
    const t = tipos[i];
    if (t === 'data_bloco') {
      bloco += 1;
      const primeira = celulas(rows[i]).find(c => c !== '');
      dataBloco = normData(primeira);
      continue;
    }
    if (t === 'cabecalho') { mapa = construirMapa(rows[i]); continue; }
    if (t === 'acordo_bloco') {
      registros.push(montarRegistro(rows[i], mapa, i + 1, bloco || null, dataBloco));
    }
  }
  return { registros, modo, blocos: bloco, mapa };
}

// ─── Validação de colunas obrigatórias (por tenant / modo) ──────────────────────

/** Rótulos amigáveis para as mensagens de "coluna faltando". */
const LABEL_CAMPO: Partial<Record<CampoDestino, string>> = {
  nr_cliente:   'NR',
  instituicao:  'Instituição',
  nome_cliente: 'Nome do Cliente',
  whatsapp:     'WhatsApp',
  tipo:         'Forma de Pagamento',
  parcelas:     'Qtd. Parcelas',
  valor:        'Valor',
  vencimento:   'Data de Vencimento',
  estado_uf:    'Estado (UF)',
  status:       'Status',
};

/**
 * Retorna quais colunas obrigatórias NÃO foram detectadas no cabeçalho.
 * A obrigatoriedade depende do tenant e do modo:
 *  - No modo 'blocos', o vencimento vem da data do bloco → não exige coluna.
 *  - No modo 'blocos', campos secundários (WhatsApp, Instituição, Forma,
 *    Parcelas) são opcionais (planilhas por data costumam ser enxutas).
 */
export function validarColunasObrigatorias(
  mapa: MapaColunas,
  isPaguePlay: boolean,
  modo: ModoParse,
): { ok: boolean; faltando: string[] } {
  let obrigatorias: CampoDestino[];

  if (isPaguePlay) {
    obrigatorias = modo === 'blocos'
      ? ['instituicao', 'valor']
      : ['instituicao', 'valor', 'vencimento'];
  } else {
    obrigatorias = modo === 'blocos'
      ? ['nr_cliente', 'nome_cliente', 'valor']
      : ['nr_cliente', 'nome_cliente', 'whatsapp', 'instituicao', 'tipo', 'parcelas', 'valor', 'vencimento'];
  }

  const faltando = obrigatorias
    .filter(campo => mapa[campo] === undefined)
    .map(campo => LABEL_CAMPO[campo] ?? campo);

  return { ok: faltando.length === 0, faltando };
}
