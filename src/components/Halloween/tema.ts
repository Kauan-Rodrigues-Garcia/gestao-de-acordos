import { createContext, useContext } from 'react';
import { ROUTE_PATHS } from '@/lib';

/**
 * Tema de Halloween — pré-estreia só para o super_admin (30/09/2026).
 *
 * O `Layout` decide e publica aqui; quem desenha (bolha do chat, fotos) só lê.
 * Contexto e não `useAuth` direto: o padrão é `false`, então os componentes
 * que ganham enfeite continuam iguais em teste e fora do `Layout`.
 */
export const TemaHalloweenContext = createContext(false);
export const useTemaHalloween = () => useContext(TemaHalloweenContext);

export const halloweenLigado = (perfil: string | null | undefined) => perfil === 'super_admin';

/** O que cada tela ganha. Chat, chapéus e morcegos não dependem de tela. */
export interface CenaHalloween {
  teias: 'ambas' | 'esquerda' | 'direita' | null;
  aranha: boolean;
  chuva: boolean;
  nuvens: boolean;
  nevoa: boolean;
  olhos: boolean;
  fantasmas: boolean;
  /** Posição horizontal da mão com a lanterna, em % da largura; `null` sem lanterna. */
  lanterna: number | null;
}

const VAZIA: CenaHalloween = { teias: null, aranha: false, chuva: false, nuvens: false, nevoa: false, olhos: false, fantasmas: false, lanterna: null };

/**
 * - Dashboard (BookPlay): as duas teias, a aranha, chuva com trovão e nuvens.
 * - Acordos (BookPlay): uma teia sem aranha, névoa, fantasmas atrás das
 *   tabelas e a mão com a lanterna presa embaixo da barra de cima.
 * - Dashboard da PaguePlay (lá Acordos e Dashboard são a mesma tela): as duas
 *   teias, só névoa, e a lanterna no meio da tela.
 * - Analítico: olhos na névoa e uma teia só.
 */
export function cenaDaRota(caminho: string, isPaguePlay: boolean): CenaHalloween {
  if (caminho === ROUTE_PATHS.DASHBOARD) {
    return isPaguePlay
      ? { ...VAZIA, teias: 'ambas', nevoa: true, lanterna: 50 }
      : { ...VAZIA, teias: 'ambas', aranha: true, chuva: true, nuvens: true };
  }
  if (caminho === ROUTE_PATHS.ACORDOS) return { ...VAZIA, teias: 'esquerda', nevoa: true, fantasmas: true, lanterna: 32 };
  if (caminho === ROUTE_PATHS.ANALITICO) return { ...VAZIA, teias: 'direita', olhos: true };
  return VAZIA;
}

export const temFundo = (c: CenaHalloween) => c.chuva || c.nuvens || c.nevoa || c.olhos;

/** Mesma pessoa, mesmo chapéu o mês todo: a cor sai do nome, não do acaso. */
export function indiceDaPessoa(chave: string, quantidade: number) {
  let h = 2166136261;
  for (const c of chave) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h % quantidade;
}
