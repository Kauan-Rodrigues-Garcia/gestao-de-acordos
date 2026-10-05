import { createContext, useContext } from 'react';
import { ROUTE_PATHS } from '@/lib';

/**
 * Tema de Halloween — em pré-estreia até a validação (`preferencia.ts`).
 *
 * O `Layout` decide e publica aqui; quem desenha (bolha do chat, fotos) só lê.
 * Contexto e não `useAuth` direto: o padrão é `false`, então os componentes
 * que ganham enfeite continuam iguais em teste e fora do `Layout`.
 */
export const TemaHalloweenContext = createContext(false);
export const useTemaHalloween = () => useContext(TemaHalloweenContext);

/*
 * Quem vê o tema saiu daqui para `preferencia.ts` (01/10/2026): temporada,
 * liberação e a escolha de desligar de cada pessoa.
 */

/** O que cada tela ganha. Chat, chapéus e morcegos não dependem de tela. */
export interface CenaHalloween {
  teias: 'ambas' | 'esquerda' | 'direita' | null;
  aranha: boolean;
  chuva: boolean;
  nuvens: boolean;
  nevoa: boolean;
  /** Analítico: alguém atrás de um vidro fosco, na névoa. */
  vulto: boolean;
  fantasmas: boolean;
  /** Posição horizontal da mão com a lanterna, em % da largura; `null` sem lanterna. */
  lanterna: number | null;
}

const VAZIA: CenaHalloween = { teias: null, aranha: false, chuva: false, nuvens: false, nevoa: false, vulto: false, fantasmas: false, lanterna: null };

/**
 * - Dashboard (BookPlay): as duas teias, a aranha, chuva com trovão e nuvens.
 * - Acordos (BookPlay): uma teia sem aranha, névoa, fantasmas atrás das
 *   tabelas e a mão com a lanterna presa embaixo da barra de cima.
 * - Dashboard da PaguePlay (lá Acordos e Dashboard são a mesma tela): as duas
 *   teias com a aranha, chuva com trovão (sem nuvens) e a lanterna no meio.
 * - Analítico: um vulto atrás de vidro fosco, na névoa, e uma teia só.
 */
export function cenaDaRota(caminho: string, isPaguePlay: boolean): CenaHalloween {
  if (caminho === ROUTE_PATHS.DASHBOARD) {
    return isPaguePlay
      ? { ...VAZIA, teias: 'ambas', aranha: true, chuva: true, lanterna: 50 }
      : { ...VAZIA, teias: 'ambas', aranha: true, chuva: true, nuvens: true };
  }
  if (caminho === ROUTE_PATHS.ACORDOS) return { ...VAZIA, teias: 'esquerda', nevoa: true, fantasmas: true, lanterna: 32 };
  if (caminho === ROUTE_PATHS.ANALITICO) return { ...VAZIA, teias: 'direita', vulto: true };
  return VAZIA;
}

export const temFundo = (c: CenaHalloween) => c.chuva || c.nuvens || c.nevoa || c.vulto;

/**
 * Onde o modo Batman aparece (`Batman/modoBatman.ts`), pedido de 05/10/2026.
 * Nas outras telas, a música do Batman toca e nada muda.
 *   - Dashboard e Acordos: `mesa` — ele sai de trás da tabela; onde há
 *     lanterna (Acordos da BookPlay, Dashboard da PaguePlay), ela mira nele.
 *   - Analítico: `vultos` — no lugar dos vultos atrás do vidro.
 */
export function modoBatmanDaRota(caminho: string): 'mesa' | 'vultos' | null {
  if (caminho === ROUTE_PATHS.DASHBOARD || caminho === ROUTE_PATHS.ACORDOS) return 'mesa';
  if (caminho === ROUTE_PATHS.ANALITICO) return 'vultos';
  return null;
}

export const EVENTO_ACORDO_SALVO = 'hw-acordo-salvo';
/**
 * Quem salva um acordo avisa; a chuva de doces (só com o tema ligado) decide
 * se é a vez dela. Sem o tema ninguém escuta e o aviso não faz nada.
 */
export const avisarAcordoSalvo = () => { window.dispatchEvent(new Event(EVENTO_ACORDO_SALVO)); };

/** Mesma pessoa, mesmo chapéu o mês todo: a cor sai do nome, não do acaso. */
export function indiceDaPessoa(chave: string, quantidade: number) {
  let h = 2166136261;
  for (const c of chave) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h % quantidade;
}
