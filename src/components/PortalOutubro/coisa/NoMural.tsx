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
 * caminho com a cabeça indo para trás (`salta` e `abre`, a segunda foto de
 * 29/10: a cara de baixo e as presas); aí a boca desencaixa do tamanho da
 * tela em volta dele, com os anéis de dentinhos girando (`engole`, a terceira
 * foto: `goela.ts`), fecha — nhac —, o mural treme, o cursor some até o mouse
 * mexer de novo e ela volta encolhendo para a porta (`vai`). Morde UMA vez e
 * só de novo depois de `ENTRE_BOTES_MS` (pedido de 29/10: «morder apenas uma
 * vez o mouse, depois só voltando em 5 minutos»). Com um sorteio ou o prêmio
 * aberto por cima (`pausada`), ela só olha.
 *
 * O clique nela (29/10: «ele terá uma animação que ele irá voltar e irá
 * descendo até sair da tela devagar»; melhorada no mesmo dia), em três tempos
 * (`EtapaDaFuga`):
 *
 *   susto    dá um pulo, a boca abre e os olhos acendem; se estava atrás
 *            do balão, ele escapa e sobe pela parede
 *   rosna    estremece, entorta a cabeça e mostra os dentes para quem clicou
 *   afunda   recua para dentro da porta e desce devagar, balançando, rindo
 *            baixinho; o corpo escurece na névoa que sobe do chão e só os
 *            olhos continuam acesos, os últimos a sumir
 *
 * Volta subindo depois de `ENTRE_BOTES_MS`, e o bote também espera.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Busto } from './Busto';
import { ALTURA_DA_CABECONA, CANTO_DOS_OLHOS, LARGURA_DA_CABECONA, PALETA_DA_CABECONA, meioDaBoca, olhosDaCabecona, type PoseDaCabecona } from './cabecona';
import { tocarSomDaCoisa } from './trilha';
import { ALTURA_DA_GOELA, LARGURA_DA_GOELA, MEIO_DA_GOELA, PALETA_DA_GOELA, alturaDaGoela, montarGoela } from './goela';
import { pintarGrade } from './derry';
import { BALAO, PALETA_DO_BALAO } from './arte';
import { Pixel } from '../Bueiro';

/** A porta na parede de 1920 × 1080 (o vão por dentro do batente; à direita ela passa da borda). */
export const PORTA = { x: 1736, y: 640, l: 220, a: 440, batente: 12 } as const;
/** Onde ela fica na parede (o canto de cima à esquerda do busto) e o pixel dela. */
const NA_PAREDE = { x: 1746, y: 762, tam: 3.3 } as const;
const PARADO_MS = 3000;
/** Depois que o mural chega, um tempo antes do primeiro bote. */
const CALMA_MS = 4000;
/** Uma mordida (ou um clique que a espanta) e ela só volta depois disso. */
const ENTRE_BOTES_MS = 5 * 60_000;
/** O susto, o recuo e a descida devagar até sumir (o clique); e a volta, subindo. */
const FOGE_MS = 5600;
const VOLTA_MS = 1800;
/** Os três tempos da fuga e quando cada um começa (casam com `coisa-foge`, em `mural.css`). */
type EtapaDaFuga = 'susto' | 'rosna' | 'afunda';
const ROSNA_MS = 650, AFUNDA_MS = 1500;
/** Os olhos acesos que ficam por último, no escuro. */
const OLHOS_ACESOS = olhosDaCabecona({ brilho: true, olhar: [0, -1] });

type Pose = 'escondida' | 'espia' | 'torta';
/** A volta das poses, com quanto cada uma fica. */
const POSES: readonly [Pose, number][] = [['escondida', 9000], ['espia', 3800], ['escondida', 8000], ['torta', 3800]];

type FaseDoBote = 'arma' | 'salta' | 'abre' | 'engole' | 'nhac' | 'olha' | 'vai';
const BOTE: readonly [FaseDoBote, number][] = [
  ['arma', 220], ['salta', 340], ['abre', 320], ['engole', 720], ['nhac', 140], ['olha', 750], ['vai', 420],
];
/** O clique: o susto e a descida, sumida esperando, e a volta. */
type Fuga = 'foge' | 'sumida' | 'volta';

function poseDe(p: Pose, olhar: readonly [number, number]): PoseDaCabecona {
  if (p === 'espia') return { baixa: true, dentes: true, olhar };
  if (p === 'torta') return { inclina: 0.6, dentes: true, olhar };
  return { balao: true, olhar };
}

/** A cara em cada tempo da fuga (afundando, os olhos no lugar de sempre, para os acesos casarem). */
function poseDaFuga(e: EtapaDaFuga): PoseDaCabecona {
  if (e === 'susto') return { brilho: true, queixo: 0.4, olhar: [0, -1] };
  if (e === 'rosna') return { brilho: true, dentes: true, sangue: true, inclina: -0.5, olhar: [-1, 0] };
  return { brilho: true, dentes: true, olhar: [0, -1] };
}

/** No bote os olhos acendem, e a bocarra mostra as luzes mortas lá no fundo. */
function poseDoBote(f: FaseDoBote): PoseDaCabecona {
  if (f === 'arma') return { brilho: true, dentes: true, olhar: [-1, -1] };
  if (f === 'salta') return { brilho: true, queixo: 0.5 };
  if (f === 'abre') return { brilho: true, queixo: 1, dentes: true };
  return { brilho: true, dentes: true, sangue: true, olhar: [0, 1] };
}

const BOCA_ABERTA = meioDaBoca({ queixo: 1 });
/** O meio do balão no busto (`balao` em `cabecona.ts`), de onde ele sobe quando ela o solta. */
const MEIO_DO_BALAO = [LARGURA_DA_CABECONA / 2 - 2.5, 51] as const;

/** A goela da terceira foto: abre, os anéis giram e, no nhac, fecha de uma vez. */
function Goela({ fechando, tam, v, leve }: { fechando: boolean; tam: number; v: number; leve: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fechandoRef = useRef(fechando);
  fechandoRef.current = fechando;
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    let id = 0, t = 0, abre = 0.25, antes = performance.now(), sobra = 0;
    const pintar = () => {
      c.clearRect(0, 0, LARGURA_DA_GOELA, ALTURA_DA_GOELA);
      pintarGrade(c, montarGoela(abre, t), PALETA_DA_GOELA, 0, 0);
    };
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000) * v;
      antes = agora;
      t += dt;
      // Abre em ~0,25 s; no nhac fecha em ~0,1 s.
      abre = fechandoRef.current ? Math.max(0, abre - dt * 10) : Math.min(1, abre + dt * 3.2);
      // Uns 20 quadros por segundo, como pixel art (no modo leve, 10).
      sobra += dt;
      if (sobra >= (leve ? 0.1 : 0.05)) { sobra = 0; pintar(); }
      id = requestAnimationFrame(quadro);
    };
    pintar();
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
  }, [v, leve]);
  return (
    <canvas
      ref={ref}
      width={LARGURA_DA_GOELA}
      height={ALTURA_DA_GOELA}
      style={{ width: LARGURA_DA_GOELA * tam, height: ALTURA_DA_GOELA * tam, imageRendering: 'pixelated', display: 'block' }}
      aria-hidden
    />
  );
}

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
  const [fuga, setFuga] = useState<Fuga | null>(null);
  const [etapa, setEtapa] = useState<EtapaDaFuga>('susto');
  /** Estava atrás do balão quando levou o clique: ele escapa. */
  const [soltouOBalao, setSoltouOBalao] = useState(false);
  const fugaRef = useRef(fuga);
  fugaRef.current = fuga;
  /** Antes disso ela não morde (a calma do começo, depois da mordida, depois do clique). */
  const liberada = useRef(0);
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
    liberada.current = performance.now() + CALMA_MS / vRef.current;
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
      if (!armado || pausadaRef.current || fugaRef.current || agora < liberada.current) return;
      if (agora - ultimo < PARADO_MS / vRef.current) return;
      armado = false;
      liberada.current = agora + ENTRE_BOTES_MS / vRef.current;
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

  // O clique: foge afundando, fica sumida e volta subindo.
  useEffect(() => {
    if (!fuga) return;
    const depois: Record<Fuga, [Fuga | null, number]> = {
      foge: ['sumida', FOGE_MS],
      sumida: ['volta', ENTRE_BOTES_MS - FOGE_MS],
      volta: [null, VOLTA_MS],
    };
    const [prox, ms] = depois[fuga];
    const ts = [window.setTimeout(() => setFuga(prox), ms / vRef.current)];
    if (fuga === 'foge') {
      setEtapa('susto');
      ts.push(window.setTimeout(() => setEtapa('rosna'), ROSNA_MS / vRef.current));
      ts.push(window.setTimeout(() => {
        setEtapa('afunda');
        tocarSomDaCoisa('risada', vRef.current, 0.55);
      }, AFUNDA_MS / vRef.current));
    }
    return () => ts.forEach(t => window.clearTimeout(t));
  }, [fuga]);
  const espantar = () => {
    if (bote || fuga) return;
    setSoltouOBalao(POSES[indice][0] === 'escondida');
    setFuga('foge');
    liberada.current = Math.max(liberada.current, performance.now() + (ENTRE_BOTES_MS + VOLTA_MS + CALMA_MS) / vRef.current);
  };

  const W = typeof window === 'undefined' ? 1920 : window.innerWidth;
  const H = typeof window === 'undefined' ? 1080 : window.innerHeight;
  const naTela = (x: number, y: number) => [W / 2 + (x - 960) * escala, H / 2 + (y - 540) * escala] as const;
  const tam = NA_PAREDE.tam * escala;
  const [esquerda, topo] = naTela(NA_PAREDE.x, NA_PAREDE.y);
  const [vaoX, vaoY] = naTela(PORTA.x + PORTA.batente, PORTA.y + PORTA.batente);
  const vaoL = (PORTA.l - PORTA.batente) * escala, vaoA = (PORTA.a - PORTA.batente) * escala;
  const naPorta = !bote || bote.fase === 'arma';
  const pose: PoseDaCabecona = bote?.fase === 'arma' ? poseDoBote('arma')
    : fuga === 'foge' ? poseDaFuga(etapa)
    // Escondida, o balão escapou: sem ele até a volta.
    : fuga === 'volta' && soltouOBalao ? poseDe('espia', olhar)
    : poseDe(POSES[indice][0], olhar);

  // O bote: o mesmo busto, crescendo da porta até a bocarra ficar em volta do cursor.
  const tamBote = Math.max(4, Math.floor((Math.min(W, H) * 0.95) / ALTURA_DA_CABECONA));
  const alvoX = bote && bote.x >= 0 ? bote.x : W / 2, alvoY = bote && bote.y >= 0 ? bote.y : H / 2;
  const boteX = alvoX - (LARGURA_DA_CABECONA / 2) * tamBote, boteY = alvoY - BOCA_ABERTA[1] * tamBote;
  // A goela: a boca aberta ocupa uns 90% da altura da tela, o meio no cursor.
  const tamGoela = Math.max(4, Math.floor((H * 0.9) / (2 * alturaDaGoela(1) + 12)));
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
          className={`coisa-no-mural${naPorta ? '' : ' coisa-no-mural-fora'}${bote?.fase === 'arma' ? ' coisa-no-mural-arma' : ''}${leve ? '' : ' coisa-no-mural-respira'}${fuga ? ` coisa-no-mural-${fuga}` : bote ? '' : ' coisa-no-mural-clicavel'}`}
          style={{ left: esquerda - vaoX, top: topo - vaoY, ['--v' as string]: v } as CSSProperties}
          onClick={e => { e.stopPropagation(); espantar(); }}
        >
          <Busto pose={pose} tam={tam} />
          {fuga === 'foge' && etapa === 'afunda' && (
            <div className="coisa-olhos-no-escuro" style={{ left: CANTO_DOS_OLHOS[0] * tam, top: CANTO_DOS_OLHOS[1] * tam }}>
              <Pixel linhas={OLHOS_ACESOS} paleta={PALETA_DA_CABECONA} tam={tam} />
            </div>
          )}
        </div>
        {fuga === 'foge' && <span className="coisa-porta-nevoa" style={{ ['--v' as string]: v } as CSSProperties} />}
      </div>

      {fuga === 'foge' && soltouOBalao && !leve && (
        <div
          className="coisa-balao-solto coisa-balao-escapa"
          style={{ left: esquerda + MEIO_DO_BALAO[0] * tam, top: topo + MEIO_DO_BALAO[1] * tam, ['--v' as string]: v } as CSSProperties}
          aria-hidden
        >
          <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={Math.round(tam * 2.1)} />
        </div>
      )}

      {bote?.balao && bote.fase !== 'arma' && !leve && (
        <div
          className="coisa-balao-solto"
          style={{ left: esquerda + MEIO_DO_BALAO[0] * tam, top: topo + MEIO_DO_BALAO[1] * tam, ['--v' as string]: v } as CSSProperties}
          aria-hidden
        >
          <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={Math.round(tam * 2.1)} />
        </div>
      )}

      {bote && (bote.fase === 'engole' || bote.fase === 'nhac') && (
        <div
          className="coisa-goela"
          style={{ left: alvoX - MEIO_DA_GOELA[0] * tamGoela, top: alvoY - MEIO_DA_GOELA[1] * tamGoela, ['--v' as string]: v } as CSSProperties}
          aria-hidden
        >
          <Goela fechando={bote.fase === 'nhac'} tam={tamGoela} v={v} leve={leve} />
        </div>
      )}
      {bote && bote.fase !== 'arma' && bote.fase !== 'engole' && bote.fase !== 'nhac' && (
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
