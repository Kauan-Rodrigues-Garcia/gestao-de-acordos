/**
 * formato.ts — percentual como a tela escreve e como a pessoa digita.
 *
 * A comissão usa percentuais com até seis casas desde 16/09/2026 — o Receptivo
 * paga prêmio ÷ meta, e 467 ÷ 90.000 = 0,518889% (NUMERIC(9,6)). Com o
 * multiplicador, há ainda produtos de ponto flutuante (2 × 1,12 =
 * 2,2400000000000002).
 *
 * A LEITURA mostra até quatro casas (0,5189%). O CAMPO guarda as seis: com três,
 * editar qualquer faixa regravaria a configuração inteira arredondada, e a
 * comissão na meta cheia deixaria de bater com o prêmio por centavos.
 */

/** Só dígitos, com uma parte decimal opcional. Negativo e lixo ficam de fora. */
const NUMERO = /^\d+(?:[.,]\d+)?$/;

/** `2.11` → `2,11%`; `0.518889` → `0,5189%`. `null` → `—`. */
export function formatarPct(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

/** `'2,11'`, `'2.11'` ou `' 2,11% '` → `2.11`. Vazio, texto ou negativo → `null`. */
export function lerPct(texto: string): number | null {
  const limpo = texto.replace(/[\s%]/g, '');
  if (!NUMERO.test(limpo)) return null;
  return Number(limpo.replace(',', '.'));
}

/** O número como a pessoa digitaria: `2.11` → `'2,11'`; `0.518889` → `'0,518889'`; `null` → `''`. */
export function paraCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 6, useGrouping: false });
}

/**
 * Máscara de dinheiro como a tela de Metas: só dígitos, os dois últimos são os
 * centavos. `'2000000'` → `'20.000,00'`.
 */
export function mascararReais(texto: string): string {
  const digitos = texto.replace(/\D/g, '');
  if (!digitos) return '';
  return (Number(digitos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `'20.000,00'` → `20000`. Vazio ou zero → `null`. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[^\d,]/g, '').replace(',', '.');
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `20000` → `'20.000,00'`; `null` → `''`. */
export function reaisParaCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor) || valor <= 0) return '';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
