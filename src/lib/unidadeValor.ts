/**
 * unidadeValor.ts — H.O. ou bruto: qual lado do recebimento a tela mostra.
 *
 * ## Por que isto existe
 *
 * A PaguePlay retém uma parte do que recebe (o H.O.); o resto é repasse para
 * Coren e Cofen. As duas leituras interessam — o bruto é o que entrou, o H.O. é
 * o que fica — e a tela precisa saber falar as duas sem manter duas contas.
 *
 * ## A meta é gravada em BRUTO
 *
 * A meta é PENSADA em H.O. e GRAVADA em bruto: a de operador de agosto/2026 é
 * R$ 72.115,38, que a 24,96% eram R$ 18.000,00 de H.O. exatos. Comparar bruto
 * contra `metas.meta_valor` está correto; para exibir em H.O., converte-se aqui
 * — nunca no banco.
 *
 * O percentual da conversão deixou de ser constante em 29/09/2026: vem de
 * `empresas.config.ho_percentual` (padrão 22,60%), editável na aba Metas. Ver
 * `lib/hoPercentual.ts`.
 *
 * ## O recebido não é convertido AQUI — ele vem pronto do relatório
 *
 * `analitico_recebimentos.total_ho` tem coluna própria e não passa por
 * `metaNaUnidade`. Desde 29/09/2026 o número dela é o da coluna HO do
 * relatório, como veio. Entre 18/08 e 29/09/2026 foi calculado a 24,96%
 * (migration 20260818280000), porque o relatório mandava 25,00% cravado.
 */

import { paraHO } from '@/lib/hoPercentual';

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
  /**
   * A proporção H.O. ÷ bruto do recebido que esta meta vai medir — ver
   * `fatorDoRecebido`. Sem ela, o percentual configurado da empresa.
   */
  fatorHO?: number,
): number | null {
  if (meta === null || meta === undefined || !Number.isFinite(meta)) return null;
  if (unidade !== 'ho') return meta;
  return fatorHO !== undefined ? meta * fatorHO : paraHO(meta);
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
