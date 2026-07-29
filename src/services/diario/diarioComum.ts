/**
 * diarioComum.ts
 * Tipos e helpers do recebimento diário que **não dependem de xlsx**.
 *
 * Mesmo motivo de `analiticoComum.ts`: `diarioParser.ts` importa `@e965/xlsx`
 * (~484 KB). As telas do diário (`DiarioLider`, `DiarioOperador`, `FormaChip`,
 * `helpers.ts`) precisavam apenas de `normDiario` / `formaKindDiario` e, por
 * importarem do parser, arrastavam a biblioteca inteira só para EXIBIR a lista.
 *
 * Regra:
 *   • **caminho de leitura** (services, hooks, telas) → importe DAQUI;
 *   • **caminho de importação** (ler o arquivo do ERP) → importe do parser.
 *
 * O parser reexporta tudo o que está aqui, então importar de lá não quebra —
 * apenas devolve os 484 KB ao bundle. O teste
 * `xlsx-fora-do-caminho-de-leitura.test.ts` guarda essa fronteira.
 */

// ── Tipos de saída ───────────────────────────────────────────────────────────

export interface LinhaDiario {
  operador_usuario: string;
  /** Coluna "Cód.Cliente", só dígitos ('' quando ausente). Mesmo código da tabulação. */
  cliente_codigo: string;
  nome_cliente: string;           // coluna Profissional
  acordo_codigo: string;
  /** Coluna "Empresa" (BookPlay). Opcional — não usado na PaguePlay. */
  instituicao?: string;
  forma_pagamento: string;        // texto bruto (Pix, Boleto, Cartão Padrão…)
  valor_recebido: number;
  data_pagamento: Date | null;
  prox_contato: Date | null;
  tabulacao: string;
  id_baixa: string;
  chave_unica: string;
}

export interface ResultadoParseDiario {
  linhas: LinhaDiario[];
  erros: string[];
  /** Linhas do arquivo sem a coluna Operador preenchida (descartadas) */
  descartadasSemOperador: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza cabeçalho/valor para comparação: sem acento, minúsculo, só [a-z0-9] */
export function normDiario(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type FormaKindDiario = 'pix' | 'boleto' | 'cartao' | 'outro';

/** Classifica a forma de pagamento bruta em pix/boleto/cartão/outro */
export function formaKindDiario(forma: string): FormaKindDiario {
  const n = normDiario(forma);
  if (n.includes('pix')) return 'pix';
  if (n.includes('cartao')) return 'cartao';
  if (n.includes('boleto')) return 'boleto';
  return 'outro';
}

export function isCartaoDiario(forma: string): boolean {
  return formaKindDiario(forma) === 'cartao';
}

/**
 * Código do cliente: só os dígitos.
 *
 * O ERP exporta com separador de milhar — "2,651,454" neste relatório, e há
 * exportações que usam ponto. Descartar tudo que não é dígito cobre os dois
 * casos e devolve o código igual ao que aparece na tabulação.
 */
export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

export function dayKeyDiario(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parsearValor(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Resolução de colunas ─────────────────────────────────────────────────────

export type ColKeysDiario =
  'op' | 'cli' | 'prof' | 'acordo' | 'forma' | 'valor' | 'idb' | 'prox' | 'dt' | 'tab';

const COL_EXATAS: Partial<Record<ColKeysDiario, string[]>> = {
  op:     ['operador', 'cobradora', 'cobrador'],
  // "Cód.Cliente" normaliza para "codcliente". Não confundir com "codacordo".
  cli:    ['codcliente', 'codigocliente', 'clientecodigo', 'codcli'],
  prof:   ['profissional', 'nome', 'cliente'],
  acordo: ['codacordo', 'acordo'],
  forma:  ['formapgto', 'formapagamento', 'formadepagamento', 'tpdoc'],
  valor:  ['valorrecebido', 'recebido'],
  idb:    ['idbaixa'],
  prox:   ['proxcontato', 'proximocontato'],
  dt:     ['data', 'dtpagamento', 'datapagamento', 'dtbaixa'],
};

const COL_PARCIAIS: Partial<Record<ColKeysDiario, string[]>> = {
  cli:    ['codcliente'],   // específico: "codacordo" não casa
  acordo: ['acordo'],
  forma:  ['forma'],
  valor:  ['valorrecebido'],
  idb:    ['idbaixa'],
  prox:   ['proxcontato', 'proximocontato'],
  dt:     ['datapagamento'],
  tab:    ['tabulacao'],
};

export function resolveColsDiario(headers: unknown[]): Partial<Record<ColKeysDiario, number>> | null {
  const norms = headers.map(h => normDiario(h));
  const map: Partial<Record<ColKeysDiario, number>> = {};

  for (const [key, aliases] of Object.entries(COL_EXATAS) as [ColKeysDiario, string[]][]) {
    const i = norms.findIndex(n => aliases.includes(n));
    if (i !== -1) map[key] = i;
  }
  for (const [key, termos] of Object.entries(COL_PARCIAIS) as [ColKeysDiario, string[]][]) {
    if (key in map) continue;
    const i = norms.findIndex(n => termos.some(t => n.includes(t)));
    if (i !== -1) map[key] = i;
  }

  // Obrigatórias: operador e valor recebido (mesma exigência do protótipo)
  if (map.op == null || map.valor == null) return null;
  return map;
}

// ── Dia de referência ────────────────────────────────────────────────────────

/** Dia mais frequente entre as datas de pagamento (moda); null se nenhum */
export function diaReferencia(linhas: LinhaDiario[]): string | null {
  const contagem: Record<string, number> = {};
  let melhor: string | null = null;
  let melhorN = 0;
  for (const l of linhas) {
    if (!l.data_pagamento) continue;
    const k = dayKeyDiario(l.data_pagamento);
    contagem[k] = (contagem[k] ?? 0) + 1;
    if (contagem[k] > melhorN) { melhorN = contagem[k]; melhor = k; }
  }
  return melhor;
}
