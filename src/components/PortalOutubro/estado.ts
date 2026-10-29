/**
 * estado.ts — o que o portal lembra nesta tela: se a pessoa já viu a abertura,
 * se o mural está aberto, a velocidade do mural e (só no teste) quem das
 * Lendas já clicou.
 *
 * Tudo no navegador. A abertura passa UMA vez por pessoa, para quem clicou
 * em «Participar»; depois o mural fica num botão até o fim de sábado.
 */
import { useSyncExternalStore } from 'react';
import { lerPrevia } from './liberacao';

function criar<T>(inicial: T) {
  let valor = inicial;
  const ouvintes = new Set<() => void>();
  return {
    ler: () => valor,
    mudar(novo: T) { valor = novo; for (const o of ouvintes) o(); },
    useValor(): T {
      return useSyncExternalStore(o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; }, () => valor, () => valor);
    },
  };
}

// ── Já viu a abertura ───────────────────────────────────────────────────────

const CHAVE_VISTO = 'portal-outubro:visto';

function lerVisto(): boolean {
  try { return localStorage.getItem(CHAVE_VISTO) === '1'; } catch { return false; }
}

const visto = criar(lerVisto());

export const useJaViu = visto.useValor;

export function marcarVisto(): void {
  // A prévia do super_admin (Configurações) não gasta a abertura de verdade.
  if (lerPrevia()) return;
  try { localStorage.setItem(CHAVE_VISTO, '1'); } catch { /* sem armazenamento: só nesta aba */ }
  visto.mudar(true);
}

/** Do painel de teste: a abertura (e a Coisa, que vem nela) volta a passar. */
export function esquecerVisto(): void {
  try { localStorage.removeItem(CHAVE_VISTO); } catch { /* idem */ }
  visto.mudar(false);
}

// ── Quem vai participar da revelação ────────────────────────────────────────
//
// Pedido de 29/10/2026: na contagem dos 2 minutos, «a opção de participar:
// para quem participar, ao terminar a contagem a animação de revelação
// continua»; quem não participa ganha só o botão do mural, depois. Fica no
// navegador, como o «já viu».

const CHAVE_PARTICIPA = 'portal-outubro:participa';

function lerParticipa(): boolean {
  try { return localStorage.getItem(CHAVE_PARTICIPA) === '1'; } catch { return false; }
}

const participa = criar(lerParticipa());

export const useParticipa = participa.useValor;
export const participando = participa.ler;

export function participar(): void {
  try { localStorage.setItem(CHAVE_PARTICIPA, '1'); } catch { /* sem armazenamento: só nesta aba */ }
  participa.mudar(true);
}

/** Do painel de teste: volta a não participar. */
export function esquecerParticipacao(): void {
  try { localStorage.removeItem(CHAVE_PARTICIPA); } catch { /* idem */ }
  participa.mudar(false);
}

// ── O mural na tela ─────────────────────────────────────────────────────────

/**
 * A ordem da primeira vez (pedido de 28/10/2026: a Coisa vem ANTES do mural,
 * dançando): a abertura, a Coisa e o mural `puxado` por ela para a tela. No
 * botão da barra, só o visual do mural (29/10: «sem os bichos aparecendo na
 * tela com interação de matar, somente os do mural fixos mesmo»).
 */
export type Tela = null | { modo: 'abertura' } | { modo: 'coisa' } | { modo: 'mural'; puxado?: boolean };

const tela = criar<Tela>(null);

export const useTela = tela.useValor;
export const lerTela = tela.ler;

/** A abertura inteira (a tela desmanchando, a Coisa e o mural). */
export function abrirAbertura(): void { tela.mudar({ modo: 'abertura' }); }
/** Direto no mural, só o visual (o botão da barra). */
export function abrirMural(): void { tela.mudar({ modo: 'mural' }); }
/** O fim da cena: o mural entra, puxado pela Coisa. */
export function puxarMural(): void { tela.mudar({ modo: 'mural', puxado: true }); }
/** A Coisa no palco de Derry (depois da abertura, antes do mural). */
export function abrirCoisa(): void { tela.mudar({ modo: 'coisa' }); }
export function fecharTela(): void { tela.mudar(null); }

// ── A velocidade do mural ───────────────────────────────────────────────────

export const VELOCIDADES_DO_MURAL = [0.5, 1, 2, 4] as const;

const velocidade = criar<number>(1);
export const useVelocidadeDoMural = velocidade.useValor;
export const mudarVelocidadeDoMural = velocidade.mudar;

// ── Os cliques das Lendas (teste) ───────────────────────────────────────────
//
// No dia, cada uma das três clica na própria tela, e o banco junta os três
// cliques. Aqui é de mentira: clicar no card de qualquer uma conta.

const cliques = criar<ReadonlySet<number>>(new Set());
export const useCliquesDasLendas = cliques.useValor;

export function clicarLenda(posicao: number): void {
  const novo = new Set(cliques.ler());
  novo.add(posicao);
  cliques.mudar(novo);
}

export function zerarCliquesDasLendas(): void { cliques.mudar(new Set()); }
