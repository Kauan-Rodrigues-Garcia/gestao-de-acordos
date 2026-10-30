/**
 * revelacao.ts — as contas dos balões da revelação (`BaloesDaRevelacao.tsx`)
 * e o que passa da contagem para a abertura: o retrato da tela tirado antes
 * e a marca de que os balões já chegaram.
 */
import { sorteador } from './acaso';
import { fotografar } from './fotografar';
import type { Pixels } from './desmanche';

/** Quantos balões (no modo leve, menos), e o tempo entre um estouro e o outro. */
export const QUANTOS = 14, QUANTOS_LEVE = 6, ENTRE_ESTOUROS_MS = 70;
/** Os balões começam a chegar quando faltam isso. */
export const CHEGADA_S = 30;
/** O último chega quando faltam isso. */
const ULTIMO_CHEGA_S = 6;
/** Quanto dura o voo de cada um. */
export const VOO_S = 1.8;
/** O «hello» começa quando faltam isso: o golpe da música (2,75 s do trecho) cai no zero. */
export const OLA_ANTES_MS = 2_750;
/** Enchem quando faltam isso. */
export const ENCHE_ANTES_MS = 900;
/** O retrato da tela, quando faltam isso. */
export const FOTO_ANTES_MS = 4_000;

export interface BalaoDaRevelacao {
  /** De onde sai e onde para, em fração da tela. */
  de: readonly [number, number];
  para: readonly [number, number];
  tam: number;
  /** A vez do estouro (0 = o primeiro). */
  vez: number;
  /** Quantos segundos antes do zero ele termina de chegar. */
  chega: number;
  /** O jeito de boiar de cada um: a fase (s) e o ritmo. */
  fase: number;
  ritmo: number;
}

/** Os cantos e as beiradas de onde eles saem (um pouco para fora da tela). */
const SAIDAS: readonly (readonly [number, number])[] = [
  [-0.08, -0.1], [0.5, -0.14], [1.08, -0.1], [1.1, 0.5], [1.08, 1.12], [0.5, 1.16], [-0.08, 1.12], [-0.1, 0.5],
];

/** Os lugares saem de uma semente: todo mundo vê os mesmos. */
export function montarBaloes(n: number): BalaoDaRevelacao[] {
  const acaso = sorteador(1958);
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  return Array.from({ length: n }, (_, i) => {
    const de = SAIDAS[i % SAIDAS.length];
    // Para no caminho para o meio, espalhado (sem empilhar no centro).
    const ang = (i / n) * Math.PI * 2 + acaso() * 0.4;
    const raio = 0.16 + acaso() * 0.2;
    const para = [0.5 + Math.cos(ang) * raio * 1.25, 0.5 + Math.sin(ang) * raio] as const;
    // Chegam na ordem do estouro, do primeiro (faltando 28 s) ao último (6 s).
    const k = n > 1 ? ordem[i] / (n - 1) : 0;
    return {
      de, para,
      tam: 5 + Math.floor(acaso() * 4),
      vez: ordem[i],
      chega: CHEGADA_S - VOO_S - k * (CHEGADA_S - VOO_S - ULTIMO_CHEGA_S) + (acaso() - 0.5),
      fase: acaso() * 3,
      ritmo: 0.85 + acaso() * 0.35,
    };
  });
}

/** Os pedaços de borracha do estouro: para onde voa cada um, o tamanho e o giro. */
export const CACOS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.25;
  const r = 70 + ((i * 37) % 50);
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r * 0.8 - 20), l: 6 + ((i * 5) % 9), gira: ((i * 73) % 360) - 180 };
});

export type EtapaDoBalao = 'voando' | 'enchendo' | 'cheio' | 'estourou';

// ── O que passa da contagem para a abertura ─────────────────────────────────

let foto: { em: number; p: Promise<Pixels> } | null = null;
let chegaramEm = 0;

/** Tira o retrato da tela antes da hora (sem os balões, o bueiro e os avisos: `data-portal-fora`). */
export function anteciparFoto(): void {
  foto = { em: Date.now(), p: fotografar(document.body) };
}

/** O retrato tirado há pouco, se tiver. */
export function fotoAntecipada(): Promise<Pixels> | null {
  return foto && Date.now() - foto.em < 15_000 ? foto.p : null;
}

/** Os balões da contagem começaram a encher: a abertura que montar agora os pega cheios. */
export function marcarChegada(): void {
  chegaramEm = Date.now();
}

/** A abertura monta com os balões já no lugar, cheios? (eles chegaram na contagem há pouco) */
export function chegaramAgora(): boolean {
  return Date.now() - chegaramEm < 4_000;
}
