/**
 * previa.ts — quem vê o Natal, e a prévia (só no `npm run dev`).
 *
 * ## Quem vê (09/11/2026)
 *
 * Antes da liberação (`liberacao.ts`, card de Configurações › Geral): só o
 * super_admin e o `npm run dev`. Depois: todo mundo. Em qualquer caso o Natal
 * só entra depois que a pessoa abre o presente (`presente/AberturaNatal.tsx`).
 *
 * ## A prévia
 *
 * Só no `npm run dev` (09/11/2026: com o Natal liberado, o Cleber não quis
 * mais o painel de prévia na conta de super_admin). `?natal=simples`, `?natal=detalhado` ou `?natal=off` no endereço grava
 * a escolha neste navegador; o seletor da prévia (`PreviaNatal.tsx`) faz o
 * mesmo sem mexer no endereço. Para todo mundo o estilo é o detalhado (quem
 * quer menos movimento liga o modo leve).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ligarMusica } from './musica';
import { useNatalLiberado } from './liberacao';
import { EVENTO_VIDEO_PREVIA, lerVideoDaPrevia, useMinhaAbertura, type VideoDaCidade } from './abertura';
import type { EstiloNatal } from './tema';

const CHAVE = 'natal:previa';
const EVENTO = 'natal-previa';

/** O que a prévia gravou: um estilo, «off», ou nada (= o detalhado). */
function ler(): EstiloNatal | 'off' | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'simples' || v === 'detalhado' || v === 'off' ? v : null;
  } catch { return null; }
}

/** `null` desliga (grava «off»: sem nada gravado, o padrão é o detalhado). */
export function escolherPreviaNatal(estilo: EstiloNatal | null) {
  try { localStorage.setItem(CHAVE, estilo ?? 'off'); } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * O estilo de quem tem o presente aberto. Exportada para os testes: na prévia
 * vale o que ela gravou; fora dela, sempre o detalhado.
 */
export function estiloDoNatal(gravado: EstiloNatal | 'off' | null, prevista: boolean): EstiloNatal | null {
  if (!prevista) return 'detalhado';
  if (gravado === 'off') return null;
  return gravado ?? 'detalhado';
}

/**
 * O presente está aberto para esta pessoa? Exportada para os testes.
 * `local`: '1' abriu neste navegador; '0' a prévia devolveu o presente (vale
 * mais que o banco, para testar de novo); `null` nada aqui.
 */
export function presenteAberto(local: string | null, noBanco: boolean): boolean {
  return local === '1' || (local !== '0' && noBanco);
}

/** Quem tem a prévia (o seletor e os botões de teste): só o `npm run dev`. Exportada para os testes. */
export function natalEmPrevia(dev: boolean): boolean {
  return dev;
}

/**
 * Quem vê o Natal: o `npm run dev`, o super_admin (para validar antes de
 * liberar, ou com o tema recolhido), e todo mundo depois de liberado.
 * Exportada para os testes.
 */
export function podeVerNatal(p: { dev: boolean; cargo: string | null | undefined; liberado: boolean }): boolean {
  return p.dev || p.cargo === 'super_admin' || p.liberado;
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener('storage', aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener('storage', aviso);
  };
}

/*
 * O presente da abertura (`presente/AberturaNatal.tsx`): o Natal só entra
 * depois que a pessoa abre o presente e clica em «Entrar no Natal» (vendo o
 * vídeo até o fim ou pulando). Fica gravado neste navegador, por pessoa, e no
 * banco (`abertura.ts`), que leva para os outros computadores dela.
 * `?natal=presente` no endereço devolve o presente, para testar de novo.
 */
const chaveAberto = (pessoa: string) => `natal:presente-aberto:${pessoa}`;

function lerAberto(pessoa: string): string | null {
  try { return localStorage.getItem(chaveAberto(pessoa)); } catch { return null; }
}

/** A pessoa abriu o presente: o Natal entra. */
export function abrirNatal(pessoa: string) {
  try { localStorage.setItem(chaveAberto(pessoa), '1'); } catch { /* modo privado: vale até recarregar */ }
  window.dispatchEvent(new Event(EVENTO));
}

/** A prévia devolve o presente: «0», que vale mais que o banco, neste navegador. */
function devolverPresente() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('natal:presente-aberto:')) localStorage.setItem(k, '0');
    const eu = pessoaAtual;
    if (eu) localStorage.setItem(chaveAberto(eu), '0');
  } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO));
}
/** Quem está logado neste navegador (para devolver o presente dele mesmo sem chave gravada). */
let pessoaAtual: string | null = null;

// ── Os botões de teste da abertura (Cleber, 04/11/2026) ──────────────────────
//
// «Como admin, começar quando eu quiser a abertura novamente, fazer aparecer
// ou sumir o presente para mim.» Ficam na prévia (`PreviaNatal.tsx`), que é
// só do `npm run dev` desde 09/11/2026.

/** O `Layout` ouve: desmonta a abertura que estiver na tela e monta outra do zero. */
export const EVENTO_REINICIAR_ABERTURA = 'natal-abertura-reiniciar';
/** A `AberturaNatal` ouve: pula etapas (`detail`: `PuloDaAbertura`). */
export const EVENTO_ABERTURA = 'natal-abertura-pular';
export type PuloDaAbertura = 'fim-do-video' | 'bilhete';

const CHAVE_OCULTO = 'natal:presente-oculto';

function lerOculto(): boolean {
  try { return localStorage.getItem(CHAVE_OCULTO) === '1'; } catch { return false; }
}

/** Some com o presente da espera neste navegador (ou traz de volta). */
export function esconderPresente(oculto: boolean) {
  try {
    if (oculto) localStorage.setItem(CHAVE_OCULTO, '1');
    else localStorage.removeItem(CHAVE_OCULTO);
  } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * A abertura do começo: devolve o presente (o Natal sai até abrir de novo),
 * desliga a rádio — para ver a música entrar como na primeira vez — e o
 * presente aparece mesmo se estava escondido.
 */
export function reiniciarAbertura() {
  ligarMusica(false);
  esconderPresente(false);
  devolverPresente();
  window.dispatchEvent(new Event(EVENTO_REINICIAR_ABERTURA));
}

export function pularAbertura(pulo: PuloDaAbertura) {
  window.dispatchEvent(new CustomEvent<PuloDaAbertura>(EVENTO_ABERTURA, { detail: pulo }));
}

/** `?natal=...` no endereço: grava e tira do endereço. */
function lerDoEndereco() {
  const busca = new URLSearchParams(window.location.search);
  if (!busca.has('natal')) return;
  const v = busca.get('natal');
  if (v === 'presente') devolverPresente();
  else escolherPreviaNatal(v === 'simples' || v === 'detalhado' ? v : null);
  const url = new URL(window.location.href);
  url.searchParams.delete('natal');
  window.history.replaceState(window.history.state, '', url);
}

export interface EstadoNatal {
  /** O tema está disponível para esta pessoa (liberado, super_admin ou dev). */
  podeVer: boolean;
  /** A prévia (seletor e testes): só no `npm run dev`. */
  prevista: boolean;
  estilo: EstiloNatal | null;
  pessoa: string;
  /** O presente está aberto neste navegador (o Natal ligado por ele). */
  aberto: boolean;
  presenteOculto: boolean;
  /** Já se sabe se a pessoa abriu em outro computador (o presente espera por isso para não piscar). */
  pronto: boolean;
  /** O vídeo da cidade dela (ou o que a prévia escolheu). */
  video: VideoDaCidade;
}

export function useNatal(): EstadoNatal {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const liberado = useNatalLiberado(empresa?.id);
  const prevista = natalEmPrevia(import.meta.env.DEV);
  const podeVer = podeVerNatal({ dev: import.meta.env.DEV, cargo: perfil?.perfil, liberado });
  const pessoa = perfil?.id ?? 'anonimo';
  pessoaAtual = perfil?.id ?? null;
  const gravado = useSyncExternalStore(assinar, ler);
  const abertoLocal = useSyncExternalStore(assinar, () => lerAberto(pessoa));
  const presenteOculto = useSyncExternalStore(assinar, lerOculto);
  const videoDaPrevia = useSyncExternalStore(assinarVideoDaPrevia, lerVideoDaPrevia);
  useEffect(() => { if (prevista) lerDoEndereco(); }, [prevista]);
  // O banco só é perguntado com o presente ainda fechado aqui (aberto, não há o que saber).
  const doBanco = useMinhaAbertura(perfil?.id ?? null, perfil?.setor_id ?? null, podeVer && abertoLocal !== '1');
  const aberto = presenteAberto(abertoLocal, doBanco.liberou);
  // Sem o presente aberto, nada do Natal aparece (é ele que traz o tema).
  return {
    podeVer, prevista, pessoa, aberto,
    estilo: podeVer && aberto ? estiloDoNatal(gravado, prevista) : null,
    presenteOculto: prevista && presenteOculto,
    pronto: abertoLocal === '1' || doBanco.pronto,
    video: (prevista && videoDaPrevia) || doBanco.video,
  };
}

function assinarVideoDaPrevia(aviso: () => void) {
  window.addEventListener(EVENTO_VIDEO_PREVIA, aviso);
  return () => window.removeEventListener(EVENTO_VIDEO_PREVIA, aviso);
}
