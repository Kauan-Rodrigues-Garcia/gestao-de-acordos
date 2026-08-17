/**
 * paleta.ts — as cores do relatório, e por que são estas.
 *
 * São as MESMAS do aplicativo (`lib/diasUteis`). Não é preciosismo: o relatório
 * é projetado ao lado da tela numa reunião, e um verde diferente para o mesmo
 * "bateu a meta" faz o leitor procurar diferença onde não há.
 *
 * `lib/diasUteis` não é importado aqui de propósito — ele arrasta tipos do
 * Supabase para dentro de um módulo que precisa ser puro e sem dependência de
 * app. Os valores são duplicados, e o teste `paleta.test.ts` quebra se os dois
 * lados divergirem.
 */

/** Verde 1º, azul 2º, âmbar 3º, vermelho 4º — igual a `COR_QUARTIL` do app. */
export const COR_QUARTIL: Record<number, string> = {
  1: '#22c55e',
  2: '#6366f1',
  3: '#f59e0b',
  4: '#ef4444',
};

/**
 * Cor de uma projeção (%).
 *
 * Faixas FIXAS, mesmo que os quartis sejam configuráveis: a leitura visual
 * "vermelho = mal, verde = bateu" não deve mudar quando alguém mexe na config
 * do mês. Mesma decisão de `corProjecao` em `lib/diasUteis`.
 *
 * `null` (sem meta) devolve cinza — não é desempenho ruim, é ausência de alvo.
 */
export function corDaProjecao(p: number | null | undefined): string {
  if (p === null || p === undefined) return COR_NEUTRA;
  if (p >= 100) return COR_QUARTIL[1];
  if (p >= 80) return COR_QUARTIL[2];
  if (p >= 50) return COR_QUARTIL[3];
  return COR_QUARTIL[4];
}

/** Cinza de "não se aplica" — sem meta, sem classificação, sem base. */
export const COR_NEUTRA = '#94a3b8';

/** Positivo verde, negativo vermelho — variação e diferença contra o esperado. */
export function corDaVariacao(v: number): string {
  return v >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4];
}

/**
 * Paleta das fatias por forma de pagamento.
 *
 * Ordem estável: a forma na posição N recebe sempre a cor N, então Pix é da
 * mesma cor no donut do setor e no donut de cada operador do mesmo relatório.
 */
export const CORES_FORMA = [
  '#6366f1', '#22c55e', '#f59e0b', '#06b6d4',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
] as const;

/** Cor das fatias agregadas em "outras" quando as formas excedem a paleta. */
export const COR_OUTRAS = '#64748b';

/** Cor do Pix Automático — âmbar, como o módulo usa na tela. */
export const COR_PIX = '#f59e0b';

/** Ouro, prata e bronze do pódio. */
export const COR_PODIO = ['#f59e0b', '#94a3b8', '#b45309'] as const;
