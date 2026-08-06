/**
 * entradaSincronizada.ts — manter `valor_entrada` e `valor_total` verdadeiros.
 * ─────────────────────────────────────────────────────────────────────────────
 * Num acordo com entrada, três números têm de contar a mesma história: o valor
 * da entrada, o de cada uma das demais parcelas e o total. O banco guarda o
 * primeiro e o terceiro; o segundo é derivado (`valorDemaisParcelas`).
 *
 * Quando a tela de edição mexe no valor de uma parcela, os três param de bater
 * se ninguém regravar o total — e o acordo passa a exibir um total que não é a
 * soma de nada. Esta função diz o que precisa ser regravado no grupo.
 *
 * Pura de propósito: é aritmética de dinheiro, o tipo de coisa que ninguém
 * confere na tela até o cliente reclamar da diferença.
 */
import { totalComEntrada } from '@/lib/money';

export interface ParcelaEscrita {
  numero: number;
  /** Já convertido para número — a tela é quem sabe ler o campo de texto. */
  valor:  number;
}

/**
 * Campos do grupo a regravar, ou `null` quando não há nada a fazer (acordo sem
 * entrada, ou entrada que não dá para determinar).
 *
 * `totalDeclarado` é o `parcelas` do acordo. Quando a lista tem TODAS as
 * parcelas, o total é a soma do que está escrito — inclusive com valores
 * irregulares, que é o caso depois de uma edição em conjunto. Quando faltam
 * linhas (parcelas ainda virtuais), cai na fórmula entrada + demais × (N−1).
 */
export function camposDeEntradaAposEdicao(params: {
  temEntrada:      boolean;
  totalDeclarado:  number;
  demaisFallback:  number | null;
  parcelas:        readonly ParcelaEscrita[];
}): { valor_entrada: number; valor_total: number } | null {
  const { temEntrada, totalDeclarado, demaisFallback, parcelas } = params;
  if (!temEntrada) return null;

  const entrada = parcelas.find(p => p.numero === 1)?.valor ?? 0;
  if (!(entrada > 0)) return null;

  const total = Math.max(totalDeclarado, parcelas.length, 1);

  if (parcelas.length >= total) {
    const soma = parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0) / 100;
    return { valor_entrada: entrada, valor_total: soma };
  }

  const demais = parcelas.find(p => p.numero === 2)?.valor ?? demaisFallback ?? 0;
  if (!(demais > 0)) return null;
  return { valor_entrada: entrada, valor_total: totalComEntrada(entrada, demais, total) };
}
