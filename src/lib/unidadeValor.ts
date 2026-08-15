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
 * ## O recebido NÃO é convertido
 *
 * `analitico_recebimentos.total_ho` vem gravado linha a linha pelo relatório, e
 * na prática dá 25,00% do bruto contra os 24,96% da constante. Aplicar a
 * constante sobre o bruto para "achar" o H.O. jogaria fora o número real do
 * relatório em troca de uma estimativa. Por isso a conversão vale só para a
 * meta e para o que deriva dela (esperado, meta diária, quanto falta) — números
 * que existem só do lado bruto.
 *
 * O efeito visível é o percentual em H.O. ficar ~0,16 ponto acima do percentual
 * em bruto. É diferença verdadeira, não erro de arredondamento.
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
