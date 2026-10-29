/**
 * ACoisa.tsx — a Coisa ANTES do mural (pedido de 28/10/2026: «quero que o It
 * dançando venha antes do mural e depois que acabar ele saia puxando o
 * mural»). A abertura desmancha a tela do Gestão e, atrás dela, está o palco
 * de Derry; dali ela nasce, dança na toca, baba, olha de perto — e puxa o
 * mural para a tela com o corpo inteiro. Sem luta: é uma cena (`cena.ts`).
 *
 *   espera    a chuva e os olhos no bueiro (a tela do Gestão desmanchando
 *             por cima, `Abertura.tsx`)
 *   pronto    o balão sai do bueiro, estoura em sangue, ela nasce
 *   ...       a dança na toca, com o fogo e o rastro
 *   babando   a câmera chega devagar no rosto, a baba escorrendo
 *   perto     o corte para o close (`CloseNoRosto`): ela encarando no fogo,
 *             babando; a boca abre e as luzes mortas tomam a tela
 *   fim       a câmera volta, ela sai do palco e o desenho dela por cima da
 *             tela corre até a borda e puxa o mural (`Puxando.tsx`;
 *             `aoPuxar` monta o mural fora da tela, `aoTerminar` avisa que
 *             ele chegou)
 *
 * A trilha (`trilha.ts`, 29/10/2026) vai junto das fases: a apresentação
 * quando o balão sai do bueiro, o estouro, a música da dança, o «we'll float
 * down here» babando e encarando, as luzes mortas quando a boca abre e a
 * risada quando ela sai puxando o mural.
 *
 * Esc ou o X fecham (voltam ao Gestão).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { X } from 'lucide-react';
import { BASE_X, BASE_Y, CenaDaCoisa, DURA_DO_CLOSE, ESCALA, ROSTO, type FaseDaCena } from './cena';
import { PALCO_A, PALCO_L } from './derry';
import { ACoisaPuxando } from './Puxando';
import { Busto } from './Busto';
import { FogoDePixel, LuzesMortas } from './LuzesMortas';
import { ALTURA_DA_CABECONA, meioDaBoca, type PoseDaCabecona } from './cabecona';
import { fecharTela, useVelocidadeDoMural } from '../estado';
import { sorteador } from '../acaso';
import { calarSomDaCoisa, tocarSomDaCoisa, type SomDaCoisa } from './trilha';
import './coisa.css';

// ── O sangue na tela ────────────────────────────────────────────────────────

interface Respingo { id: number; x: number; y: number; tam: number; semente: number }

/** Uma mancha em pixel: um borrão e as gotas escorrendo. */
function Mancha({ semente, tam }: { semente: number; tam: number }) {
  const rects = useMemo(() => {
    const acaso = sorteador(semente);
    const lista: [number, number, number, number][] = [];
    for (let y = -8; y <= 8; y++) {
      for (let x = -8; x <= 8; x++) {
        const d = Math.hypot(x, y) + (acaso() - 0.5) * 4;
        if (d < 6) lista.push([x + 12, y + 10, 1, 1]);
      }
    }
    for (let i = 0; i < 9; i++) {
      const ang = acaso() * Math.PI * 2, r = 7 + acaso() * 5;
      lista.push([Math.round(12 + Math.cos(ang) * r), Math.round(10 + Math.sin(ang) * r), 1 + Math.round(acaso()), 1 + Math.round(acaso())]);
    }
    for (let i = 0; i < 4; i++) {
      const x = 7 + Math.floor(acaso() * 11);
      lista.push([x, 12, 1, 6 + Math.floor(acaso() * 16)]);
    }
    return lista;
  }, [semente]);
  return (
    <svg viewBox="0 0 24 40" width={tam} height={(tam * 40) / 24} shapeRendering="crispEdges" aria-hidden>
      {rects.map(([x, y, l, a], i) => <rect key={i} x={x} y={y} width={l} height={a} fill={i % 7 === 0 ? '#5a0610' : '#8f0a16'} />)}
    </svg>
  );
}

// ── O close no rosto ────────────────────────────────────────────────────────

/**
 * O close, no tempo (pedido de 28/10/2026, com a pixel art dela no fogo como
 * modelo da «cara encarando babando», e as fotos da bocarra para «abrir a
 * boca para flutuar»):
 *
 *   0 a ENCARA    a cabeça baixa no fogo, encarando por baixo da sobrancelha,
 *                 os olhos em fenda acesos, a baba descendo; o sorriso de
 *                 sangue aparece e a cabeça entorta um pouco
 *   ... + ABRE    a cabeça vai para trás (pedido de 29/10, com a foto dela
 *                 de baixo: «quando ele abre pra luzes da morte o rosto dele
 *                 vai para trás») e a boca abre até o peito, as luzes no
 *                 fundo girando; no fim a câmera entra nela
 *   até o fim     as luzes mortas (`LuzesMortas.tsx`) tomam a tela, e o
 *                 sussurro: «aqui embaixo, todos nós flutuamos»
 */
/** Encarando até o «yes, we do» da trilha acabar (babando + ENCARA = 5,8 s). */
const ENCARA = 4, ABRE = 1.1;
const LUZES = DURA_DO_CLOSE - ENCARA - ABRE + 0.25;

function poseDoClose(t: number): PoseDaCabecona {
  const baba = Math.min(24, Math.round(t * 6));
  const abre = Math.max(0, Math.min(1, (t - ENCARA) / ABRE));
  if (abre > 0) {
    // As luzes da bocarra giram (uma volta a cada 2,5 s), em passos de pixel.
    const giro = Math.round(((t - ENCARA) / 2.5) * 24) / 24;
    return { fogo: true, sangue: true, queixo: Math.round(abre * 10) / 10, giro, olhar: [0, 1], baba: [Math.max(0, baba - 3), baba] };
  }
  return {
    fogo: true,
    baixa: true,
    sangue: true,
    dentes: t > 1.5,
    inclina: t > 2.4 ? Math.min(0.4, Math.round((t - 2.4) * 4) / 10) : 0,
    olhar: [0, -1],
    baba: [Math.max(0, baba - 3), baba],
  };
}

const BOCA_DO_CLOSE = meioDaBoca({ queixo: 1 });

function CloseNoRosto({ v, aoAbrir }: { v: RefObject<number>; aoAbrir: () => void }) {
  const [t, setT] = useState(0);
  const [tam, setTam] = useState(8);
  const abrindo = t > ENCARA;
  // A câmera só entra na boca quando ela já está quase toda aberta.
  const entrando = t > ENCARA + ABRE * 0.5;
  const luzes = t > ENCARA + ABRE - 0.25;
  const abrir = useRef(aoAbrir);
  abrir.current = aoAbrir;
  useEffect(() => { if (abrindo) abrir.current(); }, [abrindo]);
  useEffect(() => {
    const medir = () => setTam(Math.max(4, Math.floor((window.innerHeight * 1.02) / ALTURA_DA_CABECONA)));
    medir();
    window.addEventListener('resize', medir);
    let antes = performance.now();
    const id = window.setInterval(() => {
      // O passo sai antes: o React roda o `setT` depois, com o `antes` já trocado.
      const agora = performance.now();
      const passo = ((agora - antes) / 1000) * v.current;
      antes = agora;
      setT(x => x + passo);
    }, 90);
    return () => { window.clearInterval(id); window.removeEventListener('resize', medir); };
  }, [v]);
  return (
    <div className="coisa-close" aria-hidden>
      <span className="coisa-close-fogo" />
      <FogoDePixel v={v} />
      <Busto
        pose={poseDoClose(t)}
        tam={tam}
        className={`coisa-close-rosto${abrindo ? ' coisa-close-pra-tras' : ''}${entrando ? ' coisa-close-abrindo' : ''}`}
        style={{ transformOrigin: `50% ${(BOCA_DO_CLOSE[1] / ALTURA_DA_CABECONA) * 100}%` }}
      />
      {luzes && <LuzesMortas dura={LUZES} v={v} />}
      {luzes && <p className="coisa-sussurro">Aqui embaixo, todos nós flutuamos.</p>}
    </div>
  );
}

// ── A cena ──────────────────────────────────────────────────────────────────

/** O respiro entre a câmera voltar e ela ir puxar o mural. */
const PAUSA_NO_FIM_MS = 650;

export function ACoisa({ leve, pronto, mural, aoPuxar, aoTerminar }: {
  leve: boolean;
  /** A tela do Gestão acabou de desmanchar: o balão pode sair do bueiro. */
  pronto: boolean;
  /** O mural (montado em `aoPuxar`), que ela arrasta pelo transform. */
  mural: RefObject<HTMLDivElement | null>;
  /** Ela vai puxar: o mural monta, fora da tela, à direita. */
  aoPuxar: () => void;
  /** O mural chegou inteiro na tela. */
  aoTerminar: () => void;
}) {
  const v = useVelocidadeDoMural();
  const vRef = useRef(v);
  vRef.current = v;
  const [fase, setFase] = useState<FaseDaCena>('espera');
  const [puxando, setPuxando] = useState(false);
  const [estourou, setEstourou] = useState(0);
  const [respingos, setRespingos] = useState<Respingo[]>([]);
  const palco = useRef<HTMLCanvasElement>(null);
  const cena = useRef<CenaDaCoisa | null>(null);
  const [tela, setTela] = useState({ escala: 1, w: 1920, h: 1080 });
  const proximoId = useRef(0);
  const puxar = useRef(aoPuxar);
  puxar.current = aoPuxar;
  const tocar = (som: SomDaCoisa) => { tocarSomDaCoisa(som, vRef.current); };
  const calar = (som: SomDaCoisa, ms: number) => calarSomDaCoisa(som, ms / vRef.current);
  const tocarRef = useRef(tocar);
  tocarRef.current = tocar;

  // O palco cobre a tela (como `cover`).
  useEffect(() => {
    const medir = () => setTela({
      escala: Math.max(window.innerWidth / PALCO_L, window.innerHeight / PALCO_A),
      w: window.innerWidth,
      h: window.innerHeight,
    });
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const respingar = (n: number) => {
    const acaso = sorteador(Date.now() & 0xffff);
    const novos = Array.from({ length: n }, () => ({
      id: proximoId.current++,
      x: 6 + acaso() * 82,
      y: 4 + acaso() * 60,
      tam: 90 + acaso() * 170,
      semente: Math.floor(acaso() * 1e6),
    }));
    setRespingos(r => [...r, ...novos]);
    window.setTimeout(() => setRespingos(r => r.filter(x => !novos.includes(x))), 4800);
  };
  const respingarRef = useRef(respingar);
  respingarRef.current = respingar;

  // A cena roda do começo (a chuva), embaixo da tela que desmancha.
  useEffect(() => {
    const cv = palco.current;
    if (!cv) return;
    const c = new CenaDaCoisa(cv, {
      fase: setFase,
      estouro: () => { setEstourou(n => n + 1); respingarRef.current(leve ? 3 : 6); tocarRef.current('balao'); },
    }, leve);
    cena.current = c;
    let id = 0, antes = performance.now();
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000) * vRef.current;
      antes = agora;
      c.passo(dt);
      id = requestAnimationFrame(quadro);
    };
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
  }, [leve]);

  // A tela do Gestão saiu: o balão sai do bueiro.
  useEffect(() => { if (pronto) cena.current?.comecarBalao(); }, [pronto]);

  // A trilha, fase a fase (os tempos de `cena.ts` casam com os trechos).
  useEffect(() => {
    if (fase === 'subindo') { calar('ola', 500); tocar('apresenta'); }
    else if (fase === 'dancando') { calar('apresenta', 250); tocar('danca'); }
    else if (fase === 'babando') { calar('danca', 700); tocar('flutua'); }
  }, [fase]);

  // O close acabou: a câmera volta, um respiro, e ela vai puxar o mural.
  useEffect(() => {
    if (fase !== 'fim') return;
    const t = window.setTimeout(() => {
      cena.current?.sair();
      puxar.current();
      setPuxando(true);
      calarSomDaCoisa('luzes', 1200 / vRef.current);
      tocarSomDaCoisa('risada', vRef.current);
    }, PAUSA_NO_FIM_MS / vRef.current);
    return () => window.clearTimeout(t);
  }, [fase]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharTela(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // Um ponto do palco, na tela.
  const naTela = (px: number, py: number) =>
    [tela.w / 2 + (px - PALCO_L / 2) * tela.escala, tela.h / 2 + (py - PALCO_A / 2) * tela.escala] as const;
  const [rx, ry] = naTela(ROSTO[0], ROSTO[1]);
  const [cx, cy] = naTela(Math.round(BASE_X), BASE_Y);
  const perto = fase === 'babando' || fase === 'perto';

  return (
    <>
      <div className="coisa" style={{ ['--v' as string]: v } as CSSProperties} role="dialog" aria-label="A Coisa">
        <div className="coisa-palco">
          <div
            className={`coisa-camera${perto && !leve ? ' coisa-camera-perto' : ''}${fase === 'fim' ? ' coisa-camera-volta' : ''}`}
            style={{ transformOrigin: `${rx}px ${ry}px` }}
          >
            <canvas ref={palco} className="coisa-canvas" style={{ transform: `translate(-50%, -50%) scale(${tela.escala})` }} />
          </div>
        </div>

        {estourou > 0 && <div key={estourou} className="coisa-clarao" aria-hidden />}

        <div className="coisa-sangue" aria-hidden>
          {respingos.map(r => (
            <div key={r.id} className="coisa-respingo" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
              <Mancha semente={r.semente} tam={r.tam} />
            </div>
          ))}
        </div>

        {fase === 'dancando' && (
          <div className="coisa-apresenta">
            <p className="coisa-selo">Hoje na toca de Derry</p>
            <p className="coisa-nome">A Coisa</p>
            <p className="coisa-frase">o Palhaço Dançarino</p>
          </div>
        )}
        {fase === 'perto' && <CloseNoRosto v={vRef} aoAbrir={() => tocar('luzes')} />}
        {(fase === 'perto' || fase === 'fim') && <div key={fase} className="coisa-corte" aria-hidden />}

        <button type="button" className="coisa-fechar" onClick={fecharTela} aria-label="Fechar">
          <X />
        </button>
      </div>

      {puxando && (
        <ACoisaPuxando x={cx} y={cy} px={ESCALA * tela.escala} mural={mural} v={vRef} aoTerminar={aoTerminar} />
      )}
    </>
  );
}
