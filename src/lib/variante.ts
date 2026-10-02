/**
 * variante.ts — qual variação da cobrança esta empresa é: BookPlay ou PaguePlay.
 *
 * ## De onde vem
 *
 * `empresas.variante` (migration 20261002230000, fase 6). Antes a resposta era
 * o slug: `isPaguePlay(slug)` comparava com `'pagueplay'`. A coluna diz isso
 * agora, e só a empresa de cobrança tem uma (`produto = 'cobranca'`).
 *
 * ## Por que um registro por slug
 *
 * `isPaguePlay(slug)` é chamada em todo canto, fora e dentro do React, só com
 * o slug na mão. Quem lê `empresas` registra aqui o que leu
 * (`registrarVariantes`); `varianteDoSlug` responde com o que o banco disse e,
 * enquanto a linha não chegou (ou numa base sem a coluna), com o mapa abaixo —
 * atalho, não fonte, como `POR_SLUG` em `produto.ts`.
 */

export type Variante = 'bookplay' | 'pagueplay';

const POR_SLUG: Readonly<Record<string, Variante>> = {
  bookplay:  'bookplay',
  pagueplay: 'pagueplay',
};

const lidas = new Map<string, Variante | null>();

/** Sem normalizar: `isPaguePlay` sempre comparou o slug exato. */
function normalizar(slug: string | null | undefined): string {
  return slug ?? '';
}

function ehVariante(v: unknown): v is Variante {
  return v === 'bookplay' || v === 'pagueplay';
}

/**
 * Guarda a variante de cada empresa lida do banco. Linha sem a coluna
 * (`variante` indefinido: select antigo, base sem a migration) não registra
 * nada — o mapa de atalho continua valendo para ela.
 */
export function registrarVariantes(
  empresas: readonly ({ slug?: string | null; variante?: string | null } | null | undefined)[],
): void {
  for (const e of empresas) {
    if (!e?.slug || e.variante === undefined) continue;
    lidas.set(normalizar(e.slug), ehVariante(e.variante) ? e.variante : null);
  }
}

/** A variante do slug, ou `null` fora da cobrança. */
export function varianteDoSlug(slug: string | null | undefined): Variante | null {
  const s = normalizar(slug);
  if (lidas.has(s)) return lidas.get(s) ?? null;
  return POR_SLUG[s] ?? null;
}

/** Só para testes: esquece o que foi lido. */
export function limparVariantes(): void {
  lidas.clear();
}
