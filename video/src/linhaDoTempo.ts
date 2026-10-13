// A voz manda: cada cena dura o áudio dela, mais um respiro antes e depois.
// Trocar um áudio e rodar `npm run transcrever` reencaixa o vídeo inteiro.

import duracoes from './duracoes.json';
import tempos from './tempos.json';
import { FPS, s } from './movimento';

export type IdCena =
  | 'cena-01' | 'cena-02' | 'cena-03' | 'cena-04' | 'cena-05' | 'cena-06'
  | 'cena-07' | 'cena-08' | 'cena-09' | 'cena-10' | 'cena-11' | 'cena-12';

export const CENAS: IdCena[] = [
  'cena-01', 'cena-02', 'cena-03', 'cena-04', 'cena-05', 'cena-06',
  'cena-07', 'cena-08', 'cena-09', 'cena-10', 'cena-11', 'cena-12',
];

/** Respiro antes da voz e depois dela, em segundos. */
const RESPIRO: Record<IdCena, [number, number]> = {
  'cena-01': [1.0, 0.45],
  'cena-02': [0.25, 0.75],
  'cena-03': [0.45, 0.35],
  'cena-04': [0.6, 0.45],
  'cena-05': [0.6, 0.35],
  'cena-06': [0.6, 0.35],
  'cena-07': [0.6, 0.35],
  'cena-08': [0.6, 0.35],
  'cena-09': [0.5, 0.4],
  'cena-10': [0.3, 0.6],
  'cena-11': [0.35, 0.45],
  'cena-12': [0.45, 2.8],
};

export type Cena = {
  id: IdCena;
  /** Primeiro frame da cena no vídeo. */
  inicio: number;
  /** Frame em que a voz começa. */
  voz: number;
  /** Frame seguinte ao último da cena. */
  fim: number;
};

type Palavra = { palavra: string; inicioMs: number; fimMs: number };
const PALAVRAS = tempos as Record<IdCena, Palavra[]>;

function montar(): { cenas: Record<IdCena, Cena>; total: number } {
  const cenas = {} as Record<IdCena, Cena>;
  let cursor = 0;
  for (const id of CENAS) {
    const [antes, depois] = RESPIRO[id];
    const inicio = cursor;
    const voz = inicio + s(antes);
    const fim = voz + s((duracoes as Record<IdCena, number>)[id] + depois);
    cenas[id] = { id, inicio, voz, fim };
    cursor = fim;
  }
  return { cenas, total: cursor };
}

export const LINHA = montar();
export const TOTAL_FRAMES = LINHA.total;
export const cena = (id: IdCena) => LINHA.cenas[id];

const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Frame (absoluto, no vídeo inteiro) em que a voz começa a dizer `texto`
 * dentro da cena. `ocorrencia` escolhe a 2ª, 3ª… vez que a palavra aparece.
 * Palavra que o Whisper não achou cai no início da voz — e avisa no console.
 */
export function palavra(id: IdCena, texto: string, ocorrencia = 0): number {
  const alvo = normalizar(texto);
  const achadas = PALAVRAS[id].filter((p) => normalizar(p.palavra) === alvo);
  const p = achadas[ocorrencia];
  if (!p) {
    console.warn(`[linhaDoTempo] "${texto}" não encontrada em ${id}`);
    return LINHA.cenas[id].voz;
  }
  return LINHA.cenas[id].voz + Math.round((p.inicioMs / 1000) * FPS);
}

/** Frame em que a voz termina de dizer `texto`. */
export function fimDaPalavra(id: IdCena, texto: string, ocorrencia = 0): number {
  const alvo = normalizar(texto);
  const p = PALAVRAS[id].filter((x) => normalizar(x.palavra) === alvo)[ocorrencia];
  if (!p) return LINHA.cenas[id].voz;
  return LINHA.cenas[id].voz + Math.round((p.fimMs / 1000) * FPS);
}

/** Frame em que a voz da cena acaba. */
export function fimDaVoz(id: IdCena): number {
  return LINHA.cenas[id].voz + s((duracoes as Record<IdCena, number>)[id]);
}
