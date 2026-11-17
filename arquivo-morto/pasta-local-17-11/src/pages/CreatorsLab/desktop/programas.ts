/**
 * programas.ts — o que está instalado no computador.
 * ─────────────────────────────────────────────────────────────────────────────
 * Um programa é uma linha desta lista: o id, o ícone, o tamanho em que a
 * janela nasce e de onde vem o código. O NOME não está aqui — é vocabulário, e
 * muda com o tema (`tokens.vocab.programas[id]`).
 *
 * ## Cada programa é um `import()` separado
 *
 * Quem nunca entra no Lab não baixa nada dele (a rota é `lazy`). E quem entra
 * só baixa o que abre: a área de trabalho, sozinha, não puxa o fliperama, o
 * Math Lab nem o terminal. O teste em `__tests__/programas.test.ts` lê os
 * arquivos da casca e falha se alguém importar uma seção de forma estática.
 *
 * Para instalar um programa novo:
 *   1. acrescente o id em `IdPrograma` (`theme/themes.ts`) e o nome dele no
 *      vocabulário dos três temas;
 *   2. crie o arquivo em `programas/` com `export default`;
 *   3. acrescente a linha aqui.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IdPrograma } from '../theme/themes';
import type { IdIcone } from './icones';

export interface Programa {
  id: IdPrograma;
  icone: IdIcone;
  /** Tamanho em que a janela nasce. A regra das janelas encolhe se não couber. */
  largura: number;
  altura: number;
  Componente: LazyExoticComponent<ComponentType>;
}

export const PROGRAMAS: Programa[] = [
  { id: 'criadores',     icone: 'criadores',     largura: 880, altura: 640,
    Componente: lazy(() => import('../programas/Criadores')) },
  { id: 'projetos',      icone: 'projetos',      largura: 820, altura: 600,
    Componente: lazy(() => import('../programas/Projetos')) },
  { id: 'terminal',      icone: 'terminal',      largura: 640, altura: 460,
    Componente: lazy(() => import('../programas/Terminal')) },
  { id: 'fliperama',     icone: 'fliperama',     largura: 520, altura: 760,
    Componente: lazy(() => import('../programas/Fliperama')) },
  { id: 'playground',    icone: 'playground',    largura: 820, altura: 560,
    Componente: lazy(() => import('../programas/Playground')) },
  { id: 'mathlab',       icone: 'mathlab',       largura: 840, altura: 680,
    Componente: lazy(() => import('../programas/MathLab')) },
  { id: 'conquistas',    icone: 'conquistas',    largura: 480, altura: 600,
    Componente: lazy(() => import('../programas/Conquistas')) },
  { id: 'descobridores', icone: 'descobridores', largura: 660, altura: 600,
    Componente: lazy(() => import('../programas/Descobridores')) },
  { id: 'museu',         icone: 'museu',         largura: 940, altura: 680,
    Componente: lazy(() => import('../programas/Museu')) },
  { id: 'configuracoes', icone: 'configuracoes', largura: 620, altura: 600,
    Componente: lazy(() => import('../programas/Configuracoes')) },
  { id: 'desligar',      icone: 'desligar',      largura: 520, altura: 560,
    Componente: lazy(() => import('../programas/Desligar')) },
];

const POR_ID = new Map(PROGRAMAS.map(p => [p.id, p]));

export function programa(id: string): Programa | undefined {
  return POR_ID.get(id as IdPrograma);
}
