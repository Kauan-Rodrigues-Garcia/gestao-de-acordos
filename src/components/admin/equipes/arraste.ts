/**
 * Arrastar e soltar do quadro de equipes (HTML5 DnD).
 */
import { useState, type DragEvent } from 'react';
import type { Destino } from './modelo';

// ── Arrastar e soltar ────────────────────────────────────────────────────────

/** Quem está sendo arrastado. Nível de módulo: o HTML5 DnD não leva objeto. */
let arrastando: string | null = null;
export const arraste = {
  comecar(id: string) { arrastando = id; },
  pegar(): string | null { const id = arrastando; arrastando = null; return id; },
};

/**
 * Props de uma zona de soltar. A zona do subgrupo fica DENTRO da zona da
 * equipe: sem parar a propagação, o mesmo largar dispara as duas e a de fora
 * — sem subgrupo — desfaz o que a de dentro acabou de fazer.
 */
export function useZonaDeSoltar(destino: Destino, onSoltar: (destino: Destino) => void, ativa = true) {
  const [sobre, setSobre] = useState(false);
  if (!ativa) return { sobre: false, props: {} };
  return {
    sobre,
    props: {
      onDragOver: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!sobre) setSobre(true); },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setSobre(false);
      },
      onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setSobre(false); onSoltar(destino); },
    },
  };
}
