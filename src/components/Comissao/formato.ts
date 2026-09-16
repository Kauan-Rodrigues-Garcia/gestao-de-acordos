/**
 * formato.ts — percentual como a tela escreve e como a pessoa digita.
 *
 * A comissão usa percentuais com duas ou três casas (2,11%; 4,035%) e, com o
 * multiplicador, produtos de ponto flutuante (2 × 1,12 = 2,2400000000000002).
 * A tela escreve no máximo três casas e o campo aceita vírgula ou ponto.
 */

/** Só dígitos, com uma parte decimal opcional. Negativo e lixo ficam de fora. */
const NUMERO = /^\d+(?:[.,]\d+)?$/;

/** `2.11` → `2,11%`. `null` → `—`. */
export function formatarPct(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;
}

/** `'2,11'`, `'2.11'` ou `' 2,11% '` → `2.11`. Vazio, texto ou negativo → `null`. */
export function lerPct(texto: string): number | null {
  const limpo = texto.replace(/[\s%]/g, '');
  if (!NUMERO.test(limpo)) return null;
  return Number(limpo.replace(',', '.'));
}

/** O número como a pessoa digitaria: `2.11` → `'2,11'`; `null` → `''`. */
export function paraCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
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
