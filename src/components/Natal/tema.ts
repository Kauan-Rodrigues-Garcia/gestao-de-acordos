import { createContext, useContext } from 'react';
import { ROUTE_PATHS } from '@/lib';

/**
 * Tema de Natal — novembro de 2026 (dezembro a operação sai de férias).
 *
 * Mesmo molde do Halloween (`Halloween/tema.ts`): o `Layout` decide e publica
 * aqui; quem desenha (bolha do chat, fotos) só lê. O padrão é `null`, então
 * fora do `Layout` e em teste tudo continua igual.
 *
 * Dois estilos em prévia, para escolher vendo a tela:
 *   - `simples`   — luzinhas no alto, neve leve, globo de neve no chat;
 *   - `detalhado` — tudo do simples, mais guirlanda, bolas penduradas, montes
 *                   de neve, o trenó cruzando o céu e a festa no acordo salvo.
 */
export type EstiloNatal = 'simples' | 'detalhado';

export const TemaNatalContext = createContext<EstiloNatal | null>(null);
export const useTemaNatal = () => useContext(TemaNatalContext);

/** O que cada tela ganha. Chat e gorros não dependem de tela. */
export interface CenaNatal {
  luzes: boolean;
  guirlanda: boolean;
  /** Bolas de Natal penduradas nos cantos — dá para balançar com o clique. */
  enfeites: boolean;
  neve: 'leve' | 'cheia' | null;
  montes: boolean;
  treno: boolean;
  /** Estrelas e presentes caindo de vez em quando, ao salvar acordo. */
  festa: boolean;
}

const VAZIA: CenaNatal = { luzes: false, guirlanda: false, enfeites: false, neve: null, montes: false, treno: false, festa: false };

/** Por enquanto só o Dashboard está desenhado; as outras abas vêm depois. */
export function cenaDaRota(caminho: string, estilo: EstiloNatal): CenaNatal {
  if (caminho !== ROUTE_PATHS.DASHBOARD) return VAZIA;
  return estilo === 'simples'
    ? { ...VAZIA, luzes: true, neve: 'leve', festa: true }
    : { luzes: true, guirlanda: true, enfeites: true, neve: 'cheia', montes: true, treno: true, festa: true };
}

/** Só o que é parado — para o modo leve. */
export const soParado = (c: CenaNatal): CenaNatal => ({ ...VAZIA, luzes: c.luzes, guirlanda: c.guirlanda, enfeites: c.enfeites, montes: c.montes });

export const temFundo = (c: CenaNatal) => c.neve !== null || c.montes;

/** Pedidos da prévia, para ver o trenó e a festa sem esperar a vez deles. */
export const EVENTO_TRENO = 'natal-treno';
export const EVENTO_FESTA = 'natal-festa';
export const EVENTO_GLOBO = 'natal-globo';
