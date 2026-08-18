/**
 * unidadeValor.ts — H.O. ou bruto: qual lado do recebimento a tela mostra.
 *
 * ## Por que isto existe
 *
 * A PaguePlay retém 24,96% do que recebe (o H.O.); o resto é repasse para Coren
 * e Cofen. As duas leituras interessam — o bruto é o que entrou, o H.O. é o que
 * fica — e a tela precisa saber falar as duas sem manter duas contas.
 *
 * ## A meta é gravada em BRUTO
 *
 * `docs/REGRAS-DE-NEGOCIO.md` §1.4 dizia que "o H.O. é a base de cálculo das
 * metas". O banco mostra o contrário: a meta de operador da PaguePlay em
 * agosto/2026 é R$ 72.115,38, e `72.115,38 × 24,96% = R$ 18.000,00` exatos. A
 * meta é PENSADA como 18 mil de H.O. e GRAVADA em bruto.
 *
 * Consequência: comparar bruto contra `metas.meta_valor` está correto. Para
 * exibir a meta em H.O., converte-se aqui — nunca no banco, que continua sendo
 * a fonte em bruto para a aba Metas.
 *
 * ## O recebido não é convertido AQUI — ele já chega em 24,96%
 *
 * `analitico_recebimentos.total_ho` tem coluna própria, e por isso não passa
 * por `metaNaUnidade`. Mas o número dessa coluna também é 24,96% do bruto: o
 * trigger `trg_analitico_recebimentos_ho` o deriva do `valor_recebido` na
 * gravação (migration `20260818280000_ho_calculado_2496.sql`).
 *
 * Isso mudou em 18/08/2026. Antes a coluna vinha copiada do relatório do ERP,
 * que manda 25,00% (divide por 4), e o percentual em H.O. aparecia ~0,16 ponto
 * acima do percentual em bruto — duas abas de recebimento discordando. Agora os
 * dois lados saem da mesma constante e fecham.
 */

import { PP_HO_PERCENTUAL } from '@/lib/index';

export type UnidadeValor = 'ho' | 'bruto';

/** H.O. é o padrão: é o número que a PaguePlay acompanha. */
export const UNIDADE_PADRAO: UnidadeValor = 'ho';

export function ehUnidadeValida(v: unknown): v is UnidadeValor {
  return v === 'ho' || v === 'bruto';
}

/** Rótulo curto, para o alternador e para os títulos de card. */
export function rotuloUnidade(unidade: UnidadeValor): string {
  return unidade === 'ho' ? 'H.O.' : 'Bruto';
}

/** A unidade oposta — a que a linha secundária do card mostra. */
export function unidadeOposta(unidade: UnidadeValor): UnidadeValor {
  return unidade === 'ho' ? 'bruto' : 'ho';
}

/**
 * A meta gravada (bruta) na unidade pedida.
 *
 * Serve para tudo que deriva da meta: esperado até hoje, meta diária e quanto
 * falta. Não serve para o recebido — esse tem coluna própria.
 */
export function metaNaUnidade(
  meta: number | null | undefined,
  unidade: UnidadeValor,
): number | null {
  if (meta === null || meta === undefined || !Number.isFinite(meta)) return null;
  return unidade === 'ho' ? meta * PP_HO_PERCENTUAL : meta;
}

/**
 * Chave por usuário, e não global.
 *
 * Máquina compartilhada é a regra em operação de call center: sem o id no meio,
 * a escolha de quem usou antes viraria a visão de quem senta depois.
 */
export function chaveUnidade(perfilId: string | null | undefined): string {
  return `painel-metas:unidade:${perfilId ?? 'anonimo'}`;
}

/** Lê a preferência salva. Sem escolha registrada, devolve o padrão. */
export function lerUnidade(perfilId: string | null | undefined): UnidadeValor {
  if (typeof window === 'undefined') return UNIDADE_PADRAO;
  try {
    const salvo = window.localStorage.getItem(chaveUnidade(perfilId));
    return ehUnidadeValida(salvo) ? salvo : UNIDADE_PADRAO;
  } catch {
    // localStorage bloqueado (aba anônima, cookies desligados): o padrão vale.
    return UNIDADE_PADRAO;
  }
}

/** Grava a preferência. Falha em silêncio — preferência não vale um erro. */
export function gravarUnidade(
  perfilId: string | null | undefined,
  unidade: UnidadeValor,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(chaveUnidade(perfilId), unidade);
  } catch {
    /* vazio de propósito */
  }
}
