/**
 * alvoProjecao.ts — contra qual meta o painel calcula a projeção.
 *
 * Pedido de 05/10/2026: há quem prefira acompanhar o ritmo por uma meta acima
 * da 1ª — a 2ª, a 3ª ou a 4ª. O seletor «Metas:» mora no card «Projeção» do
 * Dashboard; aqui fica só a lembrança da escolha.
 *
 * A escolha é do APARELHO e da pessoa, no mesmo molde da unidade H.O./bruto
 * (`lib/unidadeValor.ts`): chave por perfil, para dois usuários no mesmo
 * computador não herdarem a preferência um do outro. Sem escolha gravada, ou
 * sem `localStorage`, vale a 1ª meta — a de sempre.
 */

/** 1ª meta = `metas.meta_valor`; 2ª a 4ª = `metas.metas_extras[0..2]`. */
export type NivelMeta = 1 | 2 | 3 | 4;

export const NIVEL_META_PADRAO: NivelMeta = 1;

/** Até onde o seletor vai. Degrau além da 4ª não é oferecido. */
export const NIVEL_META_MAXIMO: NivelMeta = 4;

export function chaveAlvoProjecao(perfilId: string | null | undefined): string {
  return `painel-metas:alvo-projecao:${perfilId ?? 'anonimo'}`;
}

function ehNivelMeta(v: number): v is NivelMeta {
  return Number.isInteger(v) && v >= 1 && v <= NIVEL_META_MAXIMO;
}

export function lerAlvoProjecao(perfilId: string | null | undefined): NivelMeta {
  if (typeof window === 'undefined') return NIVEL_META_PADRAO;
  try {
    const salvo = Number(window.localStorage.getItem(chaveAlvoProjecao(perfilId)));
    return ehNivelMeta(salvo) ? salvo : NIVEL_META_PADRAO;
  } catch {
    // localStorage bloqueado (aba anônima, cookies desligados): o padrão vale.
    return NIVEL_META_PADRAO;
  }
}

/** A 1ª meta apaga a chave: ela já é o padrão. Falha em silêncio. */
export function gravarAlvoProjecao(
  perfilId: string | null | undefined,
  nivel: NivelMeta,
): void {
  if (typeof window === 'undefined') return;
  try {
    if (nivel === NIVEL_META_PADRAO) window.localStorage.removeItem(chaveAlvoProjecao(perfilId));
    else window.localStorage.setItem(chaveAlvoProjecao(perfilId), String(nivel));
  } catch {
    /* vazio de propósito — a escolha vale só nesta visita */
  }
}
