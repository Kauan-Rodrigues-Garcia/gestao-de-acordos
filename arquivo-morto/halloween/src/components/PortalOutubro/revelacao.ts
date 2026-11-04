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
/** A subida de cada um, de baixo da tela até o lugar dele (entre isso e mais 2,5 s). */
const SUBIDA_S = 6;
/** A subida curta de quem chega depois (a abertura do jeito de antes, que estoura em 2,9 s). */
export const SUBIDA_RAPIDA_S = 1.7;
/** O «hello» começa quando faltam isso: o golpe da música (2,75 s do trecho) cai no zero. */
export const OLA_ANTES_MS = 2_750;
/** Enchem quando faltam isso. */
export const ENCHE_ANTES_MS = 900;
/** O retrato da tela, quando faltam isso: com folga, porque no Gestão de verdade ele pode levar segundos. */
export const FOTO_ANTES_MS = 8_000;

export interface BalaoDaRevelacao {
  /** Onde ele para, em fração da tela. */
  para: readonly [number, number];
  tam: number;
  /** A vez do estouro (0 = o primeiro). */
  vez: number;
  /** Quantos segundos antes do zero ele termina de chegar. */
  chega: number;
  /** Quanto leva subindo, de baixo da tela até o lugar (s). */
  sobe: number;
  /** O tanto que ele vem de lado enquanto sobe (px): não sobe em linha reta. */
  deriva: number;
  /** O jeito de boiar de cada um: a fase (s) e o ritmo. */
  fase: number;
  ritmo: number;
}

/**
 * Os lugares saem de uma semente: todo mundo vê os mesmos. Desde 30/10/2026
 * eles sobem de baixo da tela, como os outros balões, e vão parando
 * espalhados (pedido: «os balões aparecem de baixo para cima, como se
 * estivessem subindo normalmente, e vão parando e ficando aglomerados»; antes
 * vinham dos cantos num arco e pareciam surgir do nada).
 */
export function montarBaloes(n: number): BalaoDaRevelacao[] {
  const acaso = sorteador(1958);
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  return Array.from({ length: n }, (_, i) => {
    // Para no caminho para o meio, espalhado (sem empilhar no centro).
    const ang = (i / n) * Math.PI * 2 + acaso() * 0.4;
    const raio = 0.16 + acaso() * 0.2;
    const para = [0.5 + Math.cos(ang) * raio * 1.25, 0.5 + Math.sin(ang) * raio] as const;
    const tam = 5 + Math.floor(acaso() * 4);
    const folga = acaso() - 0.5, fase = acaso() * 3, ritmo = 0.85 + acaso() * 0.35;
    const sobe = SUBIDA_S + acaso() * 2.5;
    const deriva = Math.round((acaso() - 0.5) * 140);
    // Chegam na ordem do estouro: o primeiro sai lá de baixo quando faltam
    // 30 s, o último para no lugar faltando 6 s.
    const k = n > 1 ? ordem[i] / (n - 1) : 0;
    const primeiro = CHEGADA_S - sobe;
    return {
      para, tam, vez: ordem[i], sobe, deriva, fase, ritmo,
      chega: Math.max(ULTIMO_CHEGA_S, primeiro - k * (primeiro - ULTIMO_CHEGA_S) + folga),
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
