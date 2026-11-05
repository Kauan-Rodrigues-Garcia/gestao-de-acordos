/**
 * Por onde o trem passa — leve de propósito: o `Layout` lê isto sempre, e o
 * resto do trem (desenho, sons, horário) só desce com ele na tela.
 */
import { useSyncExternalStore } from 'react';
import { ROUTE_PATHS } from '@/lib';
import type { RegraDoSetor } from '@/lib/regraDoSetor';

export type AbaDoTrem = 'dashboard' | 'acordos' | 'pix' | 'analitico';

export const ROTULO_ABA: Readonly<Record<AbaDoTrem, string>> = {
  dashboard: 'Dashboard',
  acordos: 'Acordos',
  pix: 'Pix Automático',
  analitico: 'Analítico',
};

/**
 * Nosso produto passa por Dashboard, Acordos, Pix Automático e Analítico; a
 * regra Cofen, só por Dashboard e Analítico (CLAUDE.md, «Cofen não é
 * PaguePlay»: decide a regra do setor, nunca a empresa).
 */
export function rotaDaRegra(regra: RegraDoSetor | null): AbaDoTrem[] {
  return regra === 'cofen' ? ['dashboard', 'analitico'] : ['dashboard', 'acordos', 'pix', 'analitico'];
}

/**
 * As pistas de cada aba (Cleber, 04/11/2026): uma só, no pé da página, no
 * Dashboard (com a estação), em Acordos e no Pix; no Analítico, uma no alto e
 * outra no pé (com o fim da linha).
 */
export type PistaDoTrem = 'topo' | 'fim';
export const PISTAS_DA_ABA: Readonly<Record<AbaDoTrem, readonly PistaDoTrem[]>> = {
  dashboard: ['fim'],
  acordos: ['fim'],
  pix: ['fim'],
  analitico: ['topo', 'fim'],
};

/** O caminho (a rota do menu) de cada aba. */
export const CAMINHO_DA_ABA: Readonly<Record<AbaDoTrem, string>> = {
  dashboard: ROUTE_PATHS.DASHBOARD,
  acordos: ROUTE_PATHS.ACORDOS,
  pix: ROUTE_PATHS.PIX_AUTOMATICO,
  analitico: ROUTE_PATHS.ANALITICO,
};

export function abaDoCaminho(caminho: string): AbaDoTrem | null {
  if (caminho === ROUTE_PATHS.DASHBOARD) return 'dashboard';
  if (caminho === ROUTE_PATHS.ACORDOS) return 'acordos';
  if (caminho === ROUTE_PATHS.PIX_AUTOMATICO) return 'pix';
  if (caminho === ROUTE_PATHS.ANALITICO || caminho.startsWith(`${ROUTE_PATHS.ANALITICO}/`)) return 'analitico';
  return null;
}

/** No celular o Natal não tem trem (nem nada do tema): só de 1024 px para cima. */
const consulta = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
export function useTelaLarga(): boolean {
  return useSyncExternalStore(
    f => { consulta?.addEventListener('change', f); return () => consulta?.removeEventListener('change', f); },
    () => consulta?.matches ?? false,
  );
}
