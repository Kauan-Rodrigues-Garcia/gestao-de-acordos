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
  /** Estrelas e presentes caindo de vez em quando, ao salvar acordo. */
  festa: boolean;
  /** O chalé no alto de Acordos: lareira, poltrona, árvore e presentes (`chale/Chale.tsx`). */
  chale: boolean;
}

const VAZIA: CenaNatal = { luzes: false, guirlanda: false, enfeites: false, neve: null, montes: false, festa: false, chale: false };

/**
 * O que cada aba ganha. Dashboard: a cena inteira. Acordos (as duas regras,
 * desde 05/11/2026): o chalé no alto e a festa do acordo salvo — é lá que o
 * acordo nasce, então a festa mora lá também (antes só o Dashboard escutava,
 * e com a mesa fora dele ela nunca tocava). O Analítico tem os enfeites dele
 * (gelo, iglu) fora da cena.
 */
export function cenaDaRota(caminho: string, estilo: EstiloNatal): CenaNatal {
  if (caminho === ROUTE_PATHS.ACORDOS) return estilo === 'simples' ? { ...VAZIA, festa: true } : { ...VAZIA, festa: true, chale: true };
  if (caminho !== ROUTE_PATHS.DASHBOARD) return VAZIA;
  return estilo === 'simples'
    ? { ...VAZIA, luzes: true, neve: 'leve', festa: true }
    : { luzes: true, guirlanda: true, enfeites: true, neve: 'cheia', montes: true, festa: true, chale: false };
}

/** Só o que é parado — para o modo leve (o chalé fica, sem se mexer). */
export const soParado = (c: CenaNatal): CenaNatal => ({ ...VAZIA, luzes: c.luzes, guirlanda: c.guirlanda, enfeites: c.enfeites, montes: c.montes, chale: c.chale });

export const temFundo = (c: CenaNatal) => c.neve !== null || c.montes;

/** Pedidos da prévia, para ver o trenó e a festa sem esperar a vez deles. */
export const EVENTO_TRENO = 'natal-treno';
export const EVENTO_FESTA = 'natal-festa';
export const EVENTO_GLOBO = 'natal-globo';

/*
 * Vieram de `Halloween/tema.ts`, que foi para o arquivo morto em 03/11/2026.
 * Quem salva um acordo avisa; a festa do Natal (só no estilo detalhado) decide
 * se é a vez dela. Sem o tema ninguém escuta e o aviso não faz nada.
 */
export const EVENTO_ACORDO_SALVO = 'acordo-salvo';
export const avisarAcordoSalvo = () => { window.dispatchEvent(new Event(EVENTO_ACORDO_SALVO)); };

/** Mesma pessoa, mesmo enfeite o mês todo: sai do nome, não do acaso. */
export function indiceDaPessoa(chave: string, quantidade: number) {
  let h = 2166136261;
  for (const c of chave) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h % quantidade;
}
