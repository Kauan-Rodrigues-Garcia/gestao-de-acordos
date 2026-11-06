/**
 * O controlador do pisca-pisca (06/11/2026, pedido do Kauan: «quero que pisque
 * aleatoriamente igual pisca-pisca: às vezes pisca muito, às vezes devagar»).
 *
 * É a caixinha de oito funções do pisca-pisca de loja: ela troca de função
 * sozinha, sem ordem, e cada função dura um tempo diferente. Um controlador
 * só para o app inteiro — o varal do Dashboard, o pisca-pisca do Pix e a rena
 * mudam juntos, como luzes ligadas na mesma tomada.
 *
 * Quem desenha a luz põe `data-pisca={modo}` no bloco e, em cada lâmpada, a
 * classe do canal (`pp-a` / `pp-b`, os dois fios do pisca de verdade) e as
 * variáveis `--i` (posição no fio) e `--r` (um número fixo de 0 a 1 da
 * lâmpada). O CSS de cada função mora em `piscaPisca.css`.
 *
 * O relógio só anda enquanto alguém está olhando (há assinante) e para com a
 * aba escondida. No modo leve as animações param pelo `data-leve` do app.
 */
import { useSyncExternalStore } from 'react';
import './piscaPisca.css';

export type ModoPisca =
  | 'alterna'    // os dois fios se revezam, no compasso
  | 'onda'       // o brilho passa como onda pelo fio
  | 'corre'      // uma luz acesa corre o fio (sequencial)
  | 'devagar'    // os dois fios acendem e apagam devagarinho
  | 'frenetico'  // pisca rápido, quase estroboscópio
  | 'estrelas'   // cada lâmpada no seu tempo, como estrela
  | 'loucura'    // cada lâmpada pisca rápido no seu tempo
  | 'fixo';      // tudo aceso, parado

/** [modo, peso no sorteio, duração mínima e máxima em segundos]. */
const FUNCOES: readonly [ModoPisca, number, number, number][] = [
  ['alterna', 4, 5, 10],
  ['estrelas', 4, 6, 12],
  ['loucura', 3, 2.5, 5],
  ['frenetico', 2, 1.6, 3.5],
  ['onda', 3, 5, 9],
  ['corre', 3, 4, 8],
  ['devagar', 2, 6, 10],
  ['fixo', 1, 2.5, 5],
];

/** Só no `npm run dev`: `?pisca=frenetico` prende uma função, para ajustar o CSS dela. */
const PRESO: ModoPisca | null = (() => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.search).get('pisca');
  return FUNCOES.some(([m]) => m === p) ? p as ModoPisca : null;
})();

let modo: ModoPisca = PRESO ?? 'alterna';
let timer: number | null = null;
const ouvintes = new Set<() => void>();

function sortear(): [ModoPisca, number] {
  // Nunca repete a função de agora; os pesos deixam o «alterna» e as
  // «estrelas» mais comuns, e a correria aparece de surpresa.
  const opcoes = FUNCOES.filter(([m]) => m !== modo);
  let total = opcoes.reduce((s, [, p]) => s + p, 0) * Math.random();
  for (const [m, p, min, max] of opcoes) {
    total -= p;
    if (total <= 0) return [m, min + Math.random() * (max - min)];
  }
  const [m, , min, max] = opcoes[0];
  return [m, min + Math.random() * (max - min)];
}

function agendar(segundos: number) {
  timer = window.setTimeout(() => {
    if (document.hidden) { agendar(2); return; }
    const [proximo, dura] = sortear();
    modo = proximo;
    ouvintes.forEach(f => f());
    agendar(dura);
  }, segundos * 1000);
}

function assinar(f: () => void) {
  ouvintes.add(f);
  if (timer === null && !PRESO) agendar(4 + Math.random() * 4);
  return () => {
    ouvintes.delete(f);
    if (ouvintes.size === 0 && timer !== null) { window.clearTimeout(timer); timer = null; }
  };
}

export function usePiscaPisca(): ModoPisca {
  return useSyncExternalStore(assinar, () => modo, () => modo);
}

/** O número fixo de cada lâmpada (0 a 1): a mesma lâmpada, o mesmo jeito. */
export function acasoDa(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** As variáveis de uma lâmpada, para pôr no `style`. */
export function varsDaLampada(i: number): Record<string, string | number> {
  return { '--i': i, '--r': acasoDa(i).toFixed(3) };
}
