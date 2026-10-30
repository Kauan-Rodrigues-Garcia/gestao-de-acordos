/**
 * demo.ts — uma partida de mentira para `/#/tv?demo=1&bingo=1&tema=<id>`.
 *
 * Sem banco: as pedras saem de 7 em 7 s numa ordem fixa, alguém grita na
 * 6ª pedra e a quina de verdade é comemorada na 8ª. Os nomes são inventados.
 */
import { useEffect, useState } from 'react';
import { padrao } from './regras';
import type { EstadoBingo, PartidaBingo, TemaBingoId } from './tipos';

/** Uma cartela válida (colunas nas faixas certas) e fixa, para a demonstração. */
export const CARTELA_DEMO = [
  3, 22, 41, 50, 67,
  11, 17, 38, 59, 72,
  7, 29, 0, 46, 64,
  14, 25, 33, 55, 61,
  1, 19, 44, 52, 75,
];

/** A primeira linha da cartela demo sai entre a 2ª e a 8ª pedra: a quina é real. */
const ORDEM = [9, 3, 22, 58, 41, 50, 31, 67, 12, 70, 27, 5, 48, 36, 61, 18, 74, 44, 2, 53];

const PARTIDA: Omit<PartidaBingo, 'tema'> = {
  id: 'demo-bingo', painel_id: 'demo', estado: 'aberta', auto_marcar_s: 120,
  premio_quina: 'Caixa de bombom', premio_bingo: 'Vale-folga de meio período', som_na_tv: false,
  auto_intervalo_s: null, auto_pausado: false, proxima_pedra_em: null,
  criada_em: new Date().toISOString(), encerrada_em: null, participantes: 34,
};

export function estadoDemo(tema: TemaBingoId, pedras: number[]): EstadoBingo {
  const gritou = pedras.length >= 6;
  const comemorou = pedras.length >= 8;
  const p = padrao(CARTELA_DEMO, new Set(pedras), 'quina');
  return {
    partida: { ...PARTIDA, tema },
    pedras,
    gritos: gritou ? [{ perfil_id: 'demo-a', nome: 'Ana Beatriz Lima', foto: null, tipo: 'quina', em: new Date().toISOString() }] : [],
    vitoria: comemorou && p ? {
      id: 'demo-v1', tipo: 'quina', em: new Date().toISOString(),
      ganhadores: [{ perfil_id: 'demo-a', nome: 'Ana Beatriz Lima', foto: null, numeros: CARTELA_DEMO, padrao: p }],
    } : null,
  };
}

/** A demonstração andando sozinha. `inicio` = quantas pedras já saíram ao abrir. */
export function useBingoDemo(tema: TemaBingoId, inicio = 0, intervaloMs = 7000): EstadoBingo {
  const [qtd, setQtd] = useState(inicio);
  useEffect(() => {
    const t = setInterval(() => setQtd(n => (n >= ORDEM.length ? inicio : n + 1)), intervaloMs);
    return () => clearInterval(t);
  }, [inicio, intervaloMs]);
  return estadoDemo(tema, ORDEM.slice(0, qtd));
}
