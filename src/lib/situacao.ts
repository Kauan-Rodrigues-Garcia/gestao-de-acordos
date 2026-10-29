/**
 * situacao.ts — o que cada situação da pessoa significa para as contas.
 *
 * Fica fora de `lib/supabase.ts` de propósito: os testes simulam aquele módulo
 * inteiro, e uma regra pura não deveria precisar ser simulada.
 */

/**
 * Situações que tiram a pessoa de ranking, quartil, desafios e TV — sem tirar
 * o dinheiro dela dos totais. Um lugar só, para «afastado» (20261028100000)
 * não ser esquecido onde «ferias» já era lembrado.
 */
export function situacaoForaDasContas(s: string | null | undefined): boolean {
  return s === 'ferias' || s === 'afastado';
}
