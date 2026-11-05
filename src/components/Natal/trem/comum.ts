/**
 * Medidas e relógio que a camada do trem e as faixas dividem.
 */
import { useEffect, useState } from 'react';
import { conferirRelogioNatal, relogioNatal } from '../musica';
import { ALTURA_TREM, COMPRIMENTO_TREM } from './carros';

/**
 * O trem na tela: 0,45 do desenho — a locomotiva com ~37 px de altura e as
 * fotos com ~36 px (as fotos maiores que o trem, pedido do Cleber).
 */
export const ESCALA_TREM = 0.45;
export const ALTURA_TREM_PX = ALTURA_TREM * ESCALA_TREM;
export const COMPRIMENTO_TREM_PX = COMPRIMENTO_TREM * ESCALA_TREM;

/** As faixas que o `Layout` abre no alto e no pé da aba. */
export const ALTURA_FAIXA = 116;
/** A faixa do alto do Analítico, mais alta: é onde mora o iglu do urso. */
export const ALTURA_FAIXA_DO_IGLU = 170;
export const ALTURA_ESTACAO = 152;
/** Do pé da faixa até o eixo do trilho. */
export const TRILHO_NA_FAIXA = 24;
/** Onde o fundo do trem para, medido da borda esquerda do conteúdo da faixa. */
export const RECUO_DA_PARADA = 188;

/** O relógio do Natal, relido a cada `passoMs`. */
export function useRelogioDoTrem(passoMs: number): number {
  const [agora, setAgora] = useState(relogioNatal);
  useEffect(() => {
    conferirRelogioNatal();
    const id = window.setInterval(() => setAgora(relogioNatal()), passoMs);
    return () => window.clearInterval(id);
  }, [passoMs]);
  return agora;
}
