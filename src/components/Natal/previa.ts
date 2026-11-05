/**
 * previa.ts — quem vê o Natal enquanto ele está sendo desenhado.
 *
 * Ainda não há temporada nem liberação no banco: o tema só aparece para quem
 * pede, no navegador. `?natal=simples`, `?natal=detalhado` ou `?natal=off` no
 * endereço grava a escolha neste navegador; o seletor da prévia
 * (`PreviaNatal.tsx`) faz o mesmo sem mexer no endereço.
 *
 * Só no `npm run dev` ou para o super_admin: em produção ninguém mais esbarra
 * nele. Quando for para todos, isto vira o `preferencia.ts` do Halloween
 * (temporada de novembro + liberação + escolha de cada pessoa).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ligarMusica } from './musica';
import type { EstiloNatal } from './tema';

const CHAVE = 'natal:previa';
const EVENTO = 'natal-previa';

function ler(): EstiloNatal | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'simples' || v === 'detalhado' ? v : null;
  } catch { return null; }
}

export function escolherPreviaNatal(estilo: EstiloNatal | null) {
  try {
    if (estilo) localStorage.setItem(CHAVE, estilo);
    else localStorage.removeItem(CHAVE);
  } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO));
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
 * depois que a pessoa abre o presente, vê o vídeo e clica em «Entrar no
 * Natal». Fica gravado neste navegador, por pessoa (ainda não no banco).
 * `?natal=presente` no endereço devolve o presente, para testar de novo.
 */
const chaveAberto = (pessoa: string) => `natal:presente-aberto:${pessoa}`;

function lerAberto(pessoa: string): boolean {
  try { return localStorage.getItem(chaveAberto(pessoa)) === '1'; } catch { return false; }
}

/** A pessoa abriu o presente: o Natal entra (no estilo da prévia, ou o detalhado). */
export function abrirNatal(pessoa: string) {
  try { localStorage.setItem(chaveAberto(pessoa), '1'); } catch { /* modo privado: vale até recarregar */ }
  if (!ler()) escolherPreviaNatal('detalhado');
  window.dispatchEvent(new Event(EVENTO));
}

function devolverPresente() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('natal:presente-aberto:')) localStorage.removeItem(k);
  } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO));
}

// ── Os botões de teste da abertura (Cleber, 04/11/2026) ──────────────────────
//
// «Como admin, começar quando eu quiser a abertura novamente, fazer aparecer
// ou sumir o presente para mim.» Ficam na prévia (`PreviaNatal.tsx`), que é
// só do super_admin e do `npm run dev`.

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

export function useNatal(): { podeVer: boolean; estilo: EstiloNatal | null; pessoa: string; aberto: boolean; presenteOculto: boolean } {
  const { perfil } = useAuth();
  const podeVer = import.meta.env.DEV || perfil?.perfil === 'super_admin';
  const pessoa = perfil?.id ?? 'anonimo';
  const estilo = useSyncExternalStore(assinar, ler);
  const aberto = useSyncExternalStore(assinar, () => lerAberto(pessoa));
  const presenteOculto = useSyncExternalStore(assinar, lerOculto);
  useEffect(() => { if (podeVer) lerDoEndereco(); }, [podeVer]);
  // Sem o presente aberto, nada do Natal aparece (é ele que traz o tema).
  return { podeVer, estilo: podeVer && aberto ? estilo : null, pessoa, aberto, presenteOculto: podeVer && presenteOculto };
}
