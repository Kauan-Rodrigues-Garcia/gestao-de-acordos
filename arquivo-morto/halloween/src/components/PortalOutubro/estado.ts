/**
 * estado.ts — o que o portal lembra nesta tela: se a pessoa já viu a abertura,
 * se o mural está aberto, a velocidade do mural e (só no teste) quem das
 * Lendas já clicou.
 *
 * O «já viu» fica no navegador; o «participou», só na memória da aba (o F5
 * perde a abertura). A abertura passa UMA vez por pessoa, para quem clicou
 * em «Participar»; depois o mural fica num botão até o fim de sábado.
 */
import { useSyncExternalStore } from 'react';
import { definirEnsaio, ensaioDesdeAgora, ensaioNaAgua, lerEnsaio, lerPrevia } from './liberacao';
import { agoraDoPortal } from './relogio';

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
  // A prévia do super_admin (Configurações) não gasta a abertura de verdade;
  // o ensaio marca só na memória (o botão da barra aparece depois, como no dia).
  if (lerPrevia()) return;
  if (lerEnsaio()) { visto.mudar(true); return; }
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
// continua»; quem não participa ganha só o botão do mural, depois.
//
// Só na memória desta aba, de propósito (30/10/2026: «caso a pessoa
// recarregue a página no meio, vai acontecer como se ela não tivesse
// escolhido participar; para quem recarregar, perde a abertura»): o F5 zera,
// e o botão do mural só aparece quando ele abre para todo mundo.

const participa = criar(false);

export const useParticipa = participa.useValor;
export const participando = participa.ler;

export function participar(): void {
  participa.mudar(true);
}

/** Do painel de teste: volta a não participar. */
export function esquecerParticipacao(): void {
  participa.mudar(false);
}

// O X do convite (pedido de 29/10/2026: «um botão para fechar o campo que
// aparece o botão de participar; fechando, fica só o bueiro»). Só nesta aba.
const conviteFechado = criar(false);
export const useConviteFechado = conviteFechado.useValor;
export function fecharConvite(): void { conviteFechado.mudar(true); }

// ── O ensaio completo do super_admin (`liberacao.ts`) ───────────────────────

/** O «participou» de verdade, guardado enquanto o ensaio usa o dele. */
let participavaAntesDoEnsaio = false;

/** Começa o ensaio nesta aba: como quem nunca viu nem participou, sem gravar nada. */
export function comecarEnsaio(): void {
  if (!lerEnsaio()) participavaAntesDoEnsaio = participa.ler();
  tela.mudar(null);
  visto.mudar(false);
  participa.mudar(false);
  conviteFechado.mudar(false);
  definirEnsaio(ensaioDesdeAgora(agoraDoPortal()));
}

/** O atalho do ensaio: pula a espera do bueiro, até 3 s antes da água. */
export function pularEnsaioParaAgua(): void {
  const e = lerEnsaio();
  if (e) definirEnsaio(ensaioNaAgua(e, agoraDoPortal()));
}

/** Acaba o ensaio: fecha o que estiver aberto e volta o «já viu» e o «participou» de verdade. */
export function pararEnsaio(): void {
  definirEnsaio(null);
  tela.mudar(null);
  visto.mudar(lerVisto());
  participa.mudar(participavaAntesDoEnsaio);
  conviteFechado.mudar(false);
}

// ── O mural na tela ─────────────────────────────────────────────────────────

/**
 * A ordem da primeira vez (pedido de 28/10/2026: a Coisa vem ANTES do mural,
 * dançando): a abertura, a Coisa e o mural `puxado` por ela para a tela. No
 * botão da barra, só o visual do mural (29/10: «sem os bichos aparecendo na
 * tela com interação de matar, somente os do mural fixos mesmo»).
 */
export type Tela = null | { modo: 'abertura' } | { modo: 'coisa' } | {
  modo: 'mural';
  puxado?: boolean;
  /** Pulou a animação (30/10/2026): o mural inteiro, já pregado, sem a puxada. */
  pulou?: boolean;
};

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
/**
 * Pulou a animação (o X ao lado do volume, confirmado): conta como visto e vai
 * direto ao mural inteiro — o mesmo de quem assistiu até o fim, com os bichos.
 */
export function pularAnimacao(): void {
  marcarVisto();
  tela.mudar({ modo: 'mural', pulou: true });
}
export function fecharTela(): void { tela.mudar(null); }

// ── A velocidade do mural ───────────────────────────────────────────────────

export const VELOCIDADES_DO_MURAL = [0.5, 1, 2, 4] as const;

const velocidade = criar<number>(1);
export const useVelocidadeDoMural = velocidade.useValor;
export const mudarVelocidadeDoMural = velocidade.mudar;

// ── Os cliques das Lendas (teste) ───────────────────────────────────────────
//
// Só no laboratório (`usarPremioDeTeste`): clicar no card de qualquer uma
// conta. No app, os cliques são do banco (`premio.ts`).

const cliques = criar<ReadonlySet<number>>(new Set());
export const useCliquesDasLendas = cliques.useValor;

export function clicarLenda(posicao: number): void {
  const novo = new Set(cliques.ler());
  novo.add(posicao);
  cliques.mudar(novo);
}

export function zerarCliquesDasLendas(): void { cliques.mudar(new Set()); }
