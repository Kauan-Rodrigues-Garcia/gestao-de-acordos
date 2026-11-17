/**
 * contexto.tsx — o que um programa pode pedir à área de trabalho.
 * ─────────────────────────────────────────────────────────────────────────────
 * Dois contextos, de alcances diferentes:
 *
 *  • `useMesa()` — a área de trabalho inteira: abrir outro programa, desligar
 *    (voltar ao Gestão), disparar o efeito `matrix`.
 *  • `useJanela()` — a janela em que o programa está: o corpo dela, que serve
 *    de PALCO para o que antes se media contra a tela inteira.
 *
 * ## Por que existe o palco
 *
 * A câmera do fliperama centraliza e amplia o gabinete. Na página de rolagem
 * ela usava a janela do navegador como referência; agora o gabinete mora
 * dentro de uma janela do Lab, cujo corpo corta o que passa da borda. O
 * programa pergunta ao palco quanto espaço tem e onde ele começa, em vez de
 * presumir a tela — e fora de uma janela (num teste, por exemplo) os dois
 * hooks devolvem `null` e o componente volta a medir a tela.
 */
import { createContext, useContext, type RefObject } from 'react';
import type { IdPrograma } from '../theme/themes';

export interface ContextoMesa {
  abrir: (id: IdPrograma) => void;
  /** Volta ao Gestão. */
  desligar: () => void;
  /** O efeito visual do comando `matrix`. */
  matrix: () => void;
  /** Tela estreita: programas em tela cheia, sem arrastar. */
  celular: boolean;
}

export interface ContextoJanela {
  /** O corpo da janela: bloco de contenção e limite de corte do programa. */
  palcoRef: RefObject<HTMLDivElement | null>;
  /** O elemento que rola dentro do corpo. */
  rolagemRef: RefObject<HTMLDivElement | null>;
}

export const MesaCtx = createContext<ContextoMesa | null>(null);
export const JanelaCtx = createContext<ContextoJanela | null>(null);

export function useMesa(): ContextoMesa | null {
  return useContext(MesaCtx);
}

export function useJanela(): ContextoJanela | null {
  return useContext(JanelaCtx);
}
