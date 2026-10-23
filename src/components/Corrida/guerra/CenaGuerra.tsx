/**
 * CenaGuerra — o Cavalo da Guerra na página do Gestão (Guerra na Corrida,
 * 23/10/2026). Só a cola com o React: o palco inteiro é `palcoGuerra.js`, que
 * desenha num div solto no body (fora do #root: o app não redesenha por causa
 * dele) e mexe na página só por classe e atributo (`alvos.js`).
 *
 * Quem monta é o `PalcoCavalos` (ou o `TesteCavalos`, com o ensaio), quando a
 * página da corrida avisa que a janela estourou (`guerra-chefe`); quem desmonta
 * é ele também, quando ela avisa que voltou (`guerra-volta`).
 */
import { useEffect, useRef } from 'react';
import { modoLeveLigado } from '@/lib/modoLeve';
import { criarPalcoGuerra, type PalcoGuerra } from './palcoGuerra.js';
import type { LoteDeGolpes } from './regras';
import type { EstadoGuerra } from './tipos';

export interface PropsCenaGuerra {
  estado: EstadoGuerra;
  /** O relógio do banco, em ms. */
  agora: () => number;
  numero?: number | string;
  dono?: string | null;
  eu?: string | null;
  /** A janela da corrida, para estourar (o retângulo já no app; o canvas, se der para ler). */
  janela?: { rect: DOMRect; canvas?: HTMLCanvasElement | null } | null;
  aoGolpear?: (l: LoteDeGolpes) => Promise<boolean>;
  aoGolpearSim?: (quem: string, l: LoteDeGolpes) => void;
  /** 0 a 1: o operador ouve a 12%, o super_admin inteiro. */
  volume: number;
  /** Gente de mentira atirando junto (só o ensaio). */
  sims?: number;
}

export default function CenaGuerra(p: PropsCenaGuerra): null {
  const palco = useRef<PalcoGuerra | null>(null);
  // As funções mudam a cada render; o palco guarda a referência, não a função.
  const ultimas = useRef(p);
  ultimas.current = p;

  useEffect(() => {
    const raiz = document.createElement('div');
    document.body.appendChild(raiz);
    const q = ultimas.current;
    palco.current = criarPalcoGuerra({
      raiz,
      pagina: document.getElementById('root') ?? document.body,
      agora: () => ultimas.current.agora(),
      estado: q.estado,
      numero: q.numero,
      dono: q.dono ?? undefined,
      eu: q.eu ?? undefined,
      janela: q.janela,
      aoGolpear: q.aoGolpear ? l => ultimas.current.aoGolpear!(l) : undefined,
      aoGolpearSim: q.aoGolpearSim ? (quem, l) => ultimas.current.aoGolpearSim?.(quem, l) : undefined,
      volume: q.volume,
      leve: modoLeveLigado(),
      sims: q.sims ?? 0,
    });
    return () => { palco.current?.destruir(); palco.current = null; raiz.remove(); };
  }, []);

  useEffect(() => { palco.current?.atualizar(p.estado); }, [p.estado]);
  return null;
}
