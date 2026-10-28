/**
 * NoMural.tsx — a Coisa no mural depois de puxá-lo (pedidos de 28/10/2026):
 * fica na porta do canto de baixo à direita, no escuro, e olha o mouse. «Se o
 * mouse parar ele irá abrir a boca e abocanhar.» Na segunda volta veio a
 * pixel art de referência (atrás do balão, só os olhos por cima) e o pedido:
 * «a animação dele da boca abrindo tem que ser o mesmo boneco, não outro».
 * Por isso é um desenho só, o busto em cores (a versão toda preta saiu na
 * volta seguinte: «ser preto está esquisito»):
 *
 *   escondida   atrás do balão vermelho, só os olhos por cima, seguindo o
 *               mouse
 *   espia       o balão sai da frente: a cabeça baixa e o sorriso de dentes
 *   torta       a cabeça entorta para um lado, olhando
 *
 * O bote: o mouse parado por `PARADO_MS`; ela recua (`arma`), solta o balão e
 * o MESMO busto sai da porta crescendo até o cursor, abrindo a boca no
 * caminho (`salta`); a bocarra aberta em volta dele (`abre`), fecha — nhac —,
 * o mural treme, o cursor some até o mouse mexer de novo e ela volta
 * encolhendo para a porta (`vai`). Só de novo depois que o mouse mexer. Com
 * um sorteio ou o prêmio aberto por cima (`pausada`), ela só olha.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Busto } from './Busto';
import { ALTURA_DA_CABECONA, LARGURA_DA_CABECONA, meioDaBoca, type PoseDaCabecona } from './cabecona';
import { BALAO, PALETA_DO_BALAO } from './arte';
import { Pixel } from '../Bueiro';

/** A porta na parede de 1920 × 1080 (o vão por dentro do batente; à direita ela passa da borda). */
export const PORTA = { x: 1736, y: 640, l: 220, a: 440, batente: 12 } as const;
/** Onde ela fica na parede (o canto de cima à esquerda do busto) e o pixel dela. */
const NA_PAREDE = { x: 1746, y: 762, tam: 3.3 } as const;
const PARADO_MS = 3000;
/** Depois que o mural chega, um tempo antes do primeiro bote. */
const CALMA_MS = 4000;

type Pose = 'escondida' | 'espia' | 'torta';
/** A volta das poses, com quanto cada uma fica. */
const POSES: readonly [Pose, number][] = [['escondida', 9000], ['espia', 3800], ['escondida', 8000], ['torta', 3800]];

type FaseDoBote = 'arma' | 'salta' | 'abre' | 'nhac' | 'olha' | 'vai';
const BOTE: readonly [FaseDoBote, number][] = [['arma', 220], ['salta', 320], ['abre', 420], ['nhac', 90], ['olha', 750], ['vai', 420]];

function poseDe(p: Pose, olhar: readonly [number, number]): PoseDaCabecona {
  if (p === 'espia') return { baixa: true, dentes: true, olhar };
  if (p === 'torta') return { inclina: 0.6, dentes: true, olhar };
  return { balao: true, olhar };
}

/** No bote os olhos acendem, e a bocarra mostra as luzes mortas lá no fundo. */
function poseDoBote(f: FaseDoBote): PoseDaCabecona {
  if (f === 'arma') return { brilho: true, dentes: true, olhar: [-1, -1] };
  if (f === 'salta') return { brilho: true, queixo: 0.5 };
  if (f === 'abre') return { brilho: true, queixo: 1 };
  return { brilho: true, dentes: true, sangue: true, olhar: [0, 1] };
}

const BOCA_ABERTA = meioDaBoca({ queixo: 1 });
/** O meio do balão no busto (`balao` em `cabecona.ts`), de onde ele sobe quando ela o solta. */
const MEIO_DO_BALAO = [LARGURA_DA_CABECONA / 2 - 2.5, 51] as const;

export function ACoisaNoMural({ escala, v, pausada, leve }: {
  /** A escala da parede na tela (a mesma do mural). */
  escala: number;
  v: number;
  pausada: boolean;
  leve: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);
  const [olhar, setOlhar] = useState<readonly [number, number]>([0, 0]);
  const [bote, setBote] = useState<{ fase: FaseDoBote; x: number; y: number; balao: boolean } | null>(null);
  const indiceRef = useRef(indice);
  indiceRef.current = indice;
  const vRef = useRef(v);
  vRef.current = v;
  const pausadaRef = useRef(pausada);
  pausadaRef.current = pausada;

  // A volta das poses (parada durante o bote).
  useEffect(() => {
    if (bote) return;
    const t = window.setTimeout(() => setIndice(i => (i + 1) % POSES.length), POSES[indice][1] / vRef.current);
    return () => window.clearTimeout(t);
  }, [indice, bote]);

  // O mouse: os olhos vão atrás; parado, o bote.
  useEffect(() => {
    let mx = -1, my = -1, ultimo = performance.now(), armado = false, id = 0;
    const chegou = performance.now();
    const mover = (e: PointerEvent) => {
      mx = e.clientX; my = e.clientY;
      ultimo = performance.now();
      armado = true;
      document.documentElement.classList.remove('portal-sem-cursor');
      if (id) return;
      id = requestAnimationFrame(() => {
        id = 0;
        const r = raiz.current?.getBoundingClientRect();
        if (!r) return;
        const ox = (r.left + r.width * 0.5), oy = r.top + r.height * 0.34;
        const q = (n: number) => Math.round(Math.max(-1, Math.min(1, n)) * 2) / 2;
        const novo = [q((mx - ox) / 420), q((my - oy) / 320)] as const;
        setOlhar(o => (o[0] === novo[0] && o[1] === novo[1] ? o : novo));
      });
    };
    const espiar = window.setInterval(() => {
      const agora = performance.now();
      if (!armado || pausadaRef.current || agora - chegou < CALMA_MS / vRef.current) return;
      if (agora - ultimo < PARADO_MS / vRef.current) return;
      armado = false;
      setBote({ fase: 'arma', x: mx, y: my, balao: POSES[indiceRef.current][0] === 'escondida' });
    }, 200);
    window.addEventListener('pointermove', mover, { passive: true });
    return () => {
      window.removeEventListener('pointermove', mover);
      window.clearInterval(espiar);
      cancelAnimationFrame(id);
      document.documentElement.classList.remove('portal-sem-cursor');
    };
  }, []);

  // As fases do bote, uma atrás da outra. Na volta, sem o balão (ela o soltou).
  useEffect(() => {
    if (!bote) return;
    const i = BOTE.findIndex(([f]) => f === bote.fase);
    if (bote.fase === 'nhac') document.documentElement.classList.add('portal-sem-cursor');
    const t = window.setTimeout(() => {
      const prox = BOTE[i + 1];
      setBote(prox ? { ...bote, fase: prox[0] } : null);
      if (!prox) setIndice(1);
    }, BOTE[i][1] / vRef.current);
    return () => window.clearTimeout(t);
  }, [bote]);

  const W = typeof window === 'undefined' ? 1920 : window.innerWidth;
  const H = typeof window === 'undefined' ? 1080 : window.innerHeight;
  const naTela = (x: number, y: number) => [W / 2 + (x - 960) * escala, H / 2 + (y - 540) * escala] as const;
  const tam = NA_PAREDE.tam * escala;
  const [esquerda, topo] = naTela(NA_PAREDE.x, NA_PAREDE.y);
  const [vaoX, vaoY] = naTela(PORTA.x + PORTA.batente, PORTA.y + PORTA.batente);
  const vaoL = (PORTA.l - PORTA.batente) * escala, vaoA = (PORTA.a - PORTA.batente) * escala;
  const naPorta = !bote || bote.fase === 'arma';
  const pose = bote?.fase === 'arma' ? poseDoBote('arma') : poseDe(POSES[indice][0], olhar);

  // O bote: o mesmo busto, crescendo da porta até a bocarra ficar em volta do cursor.
  const tamBote = Math.max(4, Math.floor((Math.min(W, H) * 0.95) / ALTURA_DA_CABECONA));
  const alvoX = bote && bote.x >= 0 ? bote.x : W / 2, alvoY = bote && bote.y >= 0 ? bote.y : H / 2;
  const boteX = alvoX - (LARGURA_DA_CABECONA / 2) * tamBote, boteY = alvoY - BOCA_ABERTA[1] * tamBote;
  const daPorta = {
    ['--de-x' as string]: `${esquerda - boteX}px`,
    ['--de-y' as string]: `${topo - boteY}px`,
    ['--de-s' as string]: tam / tamBote,
  };

  return (
    <>
      <div className="coisa-na-porta" style={{ left: vaoX, top: vaoY, width: vaoL, height: vaoA }} aria-hidden>
        <div
          ref={raiz}
          className={`coisa-no-mural${naPorta ? '' : ' coisa-no-mural-fora'}${bote?.fase === 'arma' ? ' coisa-no-mural-arma' : ''}${leve ? '' : ' coisa-no-mural-respira'}`}
          style={{ left: esquerda - vaoX, top: topo - vaoY, ['--v' as string]: v } as CSSProperties}
        >
          <Busto pose={pose} tam={tam} />
        </div>
      </div>

      {bote?.balao && bote.fase !== 'arma' && !leve && (
        <div
          className="coisa-balao-solto"
          style={{ left: esquerda + MEIO_DO_BALAO[0] * tam, top: topo + MEIO_DO_BALAO[1] * tam, ['--v' as string]: v } as CSSProperties}
          aria-hidden
        >
          <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={Math.round(tam * 2.1)} />
        </div>
      )}

      {bote && bote.fase !== 'arma' && (
        <div
          className={`coisa-bote coisa-bote-${bote.fase}${leve ? ' coisa-bote-leve' : ''}`}
          style={{ left: boteX, top: boteY, ['--v' as string]: v, ...daPorta } as CSSProperties}
          aria-hidden
        >
          <Busto pose={poseDoBote(bote.fase)} tam={tamBote} />
        </div>
      )}
      {bote && (bote.fase === 'nhac' || bote.fase === 'olha') && <div className="coisa-bote-clarao" aria-hidden />}
      {bote && (bote.fase === 'olha' || bote.fase === 'vai') && <p className="coisa-bote-frase">Peguei você.</p>}
    </>
  );
}
