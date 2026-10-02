/**
 * regraDoSetor.ts — a regra de negócio de um setor: Nosso produto ou Cofen.
 *
 * Decisão do kauan em 02/10/2026: BookPlay e PaguePlay passam a ser só o nome
 * (dado pela cidade do setor), e a regra (relatório importado, tabela de
 * acordos, como o acordo é salvo) é escolhida por setor, pelo super admin.
 *
 *   nosso_produto  a regra que a BookPlay usa hoje
 *   cofen          a regra que a PaguePlay usa hoje
 *
 * Coluna `setores.regra` (migration 20261003150000).
 */

export type RegraDoSetor = 'nosso_produto' | 'cofen';

export const ROTULO_REGRA: Readonly<Record<RegraDoSetor, string>> = {
  nosso_produto: 'Nosso produto',
  cofen: 'Cofen',
};

export function ehRegraDoSetor(v: unknown): v is RegraDoSetor {
  return v === 'nosso_produto' || v === 'cofen';
}

// ─────────────────────────────────────────────────────────────────────────────
// A regra da pessoa logada
//
// `isPaguePlay(slug)` é a pergunta que o app inteiro faz para escolher abas,
// tipos de acordo, importação e como salvar. Ela continua com o mesmo nome,
// mas, para a empresa da pessoa logada, passa a responder pela regra do setor
// dela: Cofen é o jeito PaguePlay, Nosso produto é o jeito BookPlay.
//
// Quem não tem setor (admin, super admin) ou setor sem a coluna lida segue
// pela empresa, como antes. O `AuthProvider` registra a regra quando lê o
// setor do perfil; `useTenant` escuta a troca e redesenha.
// ─────────────────────────────────────────────────────────────────────────────

interface RegraDaSessao { slug: string; regra: RegraDoSetor }

let sessao: RegraDaSessao | null = null;
const ouvintes = new Set<() => void>();

/** Registra (ou esquece, com `null`) a regra do setor da pessoa logada. */
export function definirRegraDaSessao(proxima: RegraDaSessao | null): void {
  if (sessao?.slug === proxima?.slug && sessao?.regra === proxima?.regra) return;
  sessao = proxima;
  for (const f of ouvintes) f();
}

/** A regra da pessoa logada, se `slug` é a empresa dela; senão `null`. */
export function regraDaSessao(slug: string | null | undefined): RegraDoSetor | null {
  return sessao && slug && sessao.slug === slug ? sessao.regra : null;
}

/** Para `useSyncExternalStore`: avisa quando a regra da sessão muda. */
export function ouvirRegraDaSessao(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** A regra registrada agora, qualquer que seja a empresa. */
export function regraDaSessaoAtual(): RegraDoSetor | null {
  return sessao?.regra ?? null;
}
