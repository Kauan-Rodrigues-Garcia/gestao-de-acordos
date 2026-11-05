/**
 * O canal entre a bola solta (`BolaSolta`, em `BolaDaSaudacao.tsx`) e o boneco
 * de neve (`BonecoDeNeve.tsx`): moram em lugares diferentes da tela e não se
 * conhecem. O boneco se registra aqui enquanto está passeando; a bola procura
 * por ele só durante a brincadeira.
 */
import type { Lado } from './arremesso';

type Ponto = { x: number; y: number };

export interface BonecoNaCesta {
  /** Onde fica a bola no colo dele, na tela (para medir se ela chegou perto). `null`: fora da tela. */
  colo(): Ponto | null;
  /** A bola chegou perto (estica os bracinhos, olhando para ela) ou se afastou. */
  esperar(sim: boolean, bolaX?: number): void;
  /** Pegou a bola: começa o arremesso, virado para a cesta. Devolve o instante (`performance.now()`). */
  receber(lado: Lado): number;
  /** O centro da bola na tela, `t` ms depois de pegar (segue a pose do arremesso). */
  bolaEm(t: number): Ponto;
  /** Como foi o arremesso dele: comemora ou fica tristinho. */
  resultado(acertou: boolean): void;
  /** A brincadeira acabou no meio: volta ao normal. */
  cancelar(): void;
}

let atual: BonecoNaCesta | null = null;

export function registrarBoneco(b: BonecoNaCesta): () => void {
  atual = b;
  return () => { if (atual === b) atual = null; };
}

export const bonecoDaCesta = () => atual;
