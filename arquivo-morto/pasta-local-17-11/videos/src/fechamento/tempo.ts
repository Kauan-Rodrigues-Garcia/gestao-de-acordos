// Linha do tempo do «Entre Metas e Risadas», medida em batidas da música
// (120 bpm, 30 fps → 15 quadros por batida). Todo corte cai numa batida.
//
// scripts/musica-fechamento.mjs monta a trilha com a MESMA conta (abertura 20,
// setor = 4 + 4 por pessoa + 4, final 8 + 32 + 8). Mexeu aqui, mexa lá.

import { SETORES, type Pessoa, type Setor } from './elenco';

export const FPS = 30;
export const BPM = 120;
/** Quadros por batida. */
export const B = (FPS * 60) / BPM;

export const ABERTURA = 20;
export const CLAQUETE = 4;
export const ESTRELA = 4;
export const MURAL = 4;
export const MOSAICO = 8;
export const CREDITOS = 32;
export const FIM = 8;

export type Trecho =
  | { tipo: 'abertura'; ini: number; dur: number }
  | { tipo: 'claquete'; ini: number; dur: number; setor: Setor; cena: number }
  | { tipo: 'estrela'; ini: number; dur: number; setor: Setor; cena: number; pessoa: Pessoa; ordem: number; geral: number }
  | { tipo: 'mural'; ini: number; dur: number; setor: Setor; cena: number }
  | { tipo: 'mosaico'; ini: number; dur: number }
  | { tipo: 'creditos'; ini: number; dur: number }
  | { tipo: 'fim'; ini: number; dur: number };

function montar(): Trecho[] {
  const t: Trecho[] = [];
  let b = 0;
  type SemIni = Trecho extends infer T ? (T extends Trecho ? Omit<T, 'ini'> : never) : never;
  const por = (x: SemIni) => {
    t.push({ ...x, ini: b } as Trecho);
    b += x.dur;
  };
  por({ tipo: 'abertura', dur: ABERTURA });
  let geral = 0;
  SETORES.forEach((setor, i) => {
    const cena = i + 1;
    por({ tipo: 'claquete', dur: CLAQUETE, setor, cena });
    setor.pessoas.forEach((pessoa, ordem) => por({ tipo: 'estrela', dur: ESTRELA, setor, cena, pessoa, ordem, geral: geral++ }));
    por({ tipo: 'mural', dur: MURAL, setor, cena });
  });
  por({ tipo: 'mosaico', dur: MOSAICO });
  por({ tipo: 'creditos', dur: CREDITOS });
  por({ tipo: 'fim', dur: FIM });
  return t;
}

export const TRECHOS = montar();
const ultimo = TRECHOS[TRECHOS.length - 1];
export const TOTAL_BATIDAS = ultimo.ini + ultimo.dur;
export const TOTAL_FECHAMENTO = TOTAL_BATIDAS * B;
