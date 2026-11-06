/**
 * Por onde o trem passa — leve de propósito: o `Layout` lê isto sempre, e o
 * resto do trem (desenho, sons, horário) só desce com ele na tela.
 */
import { useSyncExternalStore } from 'react';
import { ROUTE_PATHS } from '@/lib';

export type AbaDoTrem = 'dashboard' | 'acordos' | 'analitico';

export const ROTULO_ABA: Readonly<Record<AbaDoTrem, string>> = {
  dashboard: 'Dashboard',
  acordos: 'Acordos',
  analitico: 'Analítico',
};

/**
 * O percurso do trem — UM SÓ, para todo mundo (Cleber, 05/11/2026: «tem que
 * ser o mesmo tempo e o mesmo sorteio para todos»): Dashboard, Acordos e
 * Analítico, ida e volta. É ele que dá o relógio (`horario.ts`): o trem está
 * no mesmo lugar, na mesma hora, para todas as empresas e as duas regras.
 *
 * Também são as abas em que cada um VÊ o trem, igual para Nosso produto e
 * Cofen: desde 05/11/2026 as duas regras têm Dashboard e Acordos com a mesma
 * estrutura. O Pix Automático saiu da rota no mesmo dia (Cleber): o Natal
 * mora no Dashboard, em Acordos e no Analítico, como o Halloween.
 */
export const ROTA_DO_TREM: readonly AbaDoTrem[] = ['dashboard', 'acordos', 'analitico'];

/**
 * As pistas de cada aba (Cleber, 04/11/2026): uma só, no pé da página, no
 * Dashboard (com a estação) e em Acordos; no Analítico, uma no alto e outra
 * no pé (com o fim da linha).
 */
export type PistaDoTrem = 'topo' | 'fim';
export const PISTAS_DA_ABA: Readonly<Record<AbaDoTrem, readonly PistaDoTrem[]>> = {
  dashboard: ['fim'],
  acordos: ['fim'],
  analitico: ['topo', 'fim'],
};

/** O caminho (a rota do menu) de cada aba. */
export const CAMINHO_DA_ABA: Readonly<Record<AbaDoTrem, string>> = {
  dashboard: ROUTE_PATHS.DASHBOARD,
  acordos: ROUTE_PATHS.ACORDOS,
  analitico: ROUTE_PATHS.ANALITICO,
};

export function abaDoCaminho(caminho: string): AbaDoTrem | null {
  if (caminho === ROUTE_PATHS.DASHBOARD) return 'dashboard';
  if (caminho === ROUTE_PATHS.ACORDOS) return 'acordos';
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
