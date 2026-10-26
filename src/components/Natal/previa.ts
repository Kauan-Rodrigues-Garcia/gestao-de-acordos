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

/** `?natal=...` no endereço: grava e tira do endereço. */
function lerDoEndereco() {
  const busca = new URLSearchParams(window.location.search);
  if (!busca.has('natal')) return;
  const v = busca.get('natal');
  escolherPreviaNatal(v === 'simples' || v === 'detalhado' ? v : null);
  const url = new URL(window.location.href);
  url.searchParams.delete('natal');
  window.history.replaceState(window.history.state, '', url);
}

export function useNatal(): { podeVer: boolean; estilo: EstiloNatal | null } {
  const { perfil } = useAuth();
  const podeVer = import.meta.env.DEV || perfil?.perfil === 'super_admin';
  const estilo = useSyncExternalStore(assinar, ler);
  useEffect(() => { if (podeVer) lerDoEndereco(); }, [podeVer]);
  return { podeVer, estilo: podeVer ? estilo : null };
}
