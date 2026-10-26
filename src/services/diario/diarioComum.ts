/**
 * diarioComum.ts
 * Tipos e helpers do recebimento diário que **não dependem de xlsx**.
 *
 * Quem exibe o recebimento (`FormaChip`, `helpers.ts`, `AnaliticoLider`) e
 * quem grava o diário da regra Nosso produto (`useAnaliticoImport`, a partir do
 * relatório mensal) importam daqui. O diário da regra Cofen vem do relatório
 * 945 e é lido por `relatorioPaguePlay/parser.ts` desde 26/10/2026 — o parser
 * próprio do diário (`diarioParser.ts`) saiu do código junto com a importação
 * que aceitava o relatório 58 no lugar do 945.
 *
 * O teste `xlsx-fora-do-caminho-de-leitura.test.ts` guarda a fronteira.
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

export function dayKeyDiario(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
