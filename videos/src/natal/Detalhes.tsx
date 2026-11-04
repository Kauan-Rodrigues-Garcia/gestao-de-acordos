// Os detalhes do tema de Halloween, como eram no sistema (src/components/Halloween):
//
//   - a bolha do chat vira a abóbora (o desenho do app), que respira, mexe o
//     cipó e acende o rosto como vela quando chega mensagem;
//   - as teias nos cantos de cima e a Dona Aranha descendo no fio;
//   - o bando de morcegos cruzando a tela — um leva um clique e cai rodopiando;
//   - a aranha puxada pelo fio até ele ESTOURAR, segurada com peso e jogada
//     longe, com a física do app (`aranhaFisica.ts`) rodando quadro a quadro;
//   - e o morcego que traz o cartaz «Procura-se» e o prende na teia.
//
// O CSS é o do app (`halloween.css`, `cartaz.css`). O que lá é animação CSS
// aqui é escrito pelo quadro — inclusive dentro dos desenhos do app (asas,
// rosto, cipó), por uma folha de estilo do quadro (`<style>` com o id da peça).
// Tudo nas coordenadas do app (1600×874), com os tamanhos de lá.

import { useMemo } from 'react';
import { staticFile, useCurrentFrame } from 'remotion';
import { loadFont as fonteCreepster } from '@remotion/google-fonts/Creepster';
import { loadFont as fonteElite } from '@remotion/google-fonts/SpecialElite';
import { loadFont as fonteCaveat } from '@remotion/google-fonts/Caveat';
import { AboboraChat, ChapeuBruxa, MorcegoSvg } from '@/components/Halloween/Desenhos';
import {
  FISICA, alvoNoFio, anguloNoFio, arremesso, caminhoDoFio, comprimentoAoSoltar, criarFio, distancia, estourou,
  fioQueSolta, passoDoFio, passoLivre, passoNaMao, passoNoFio, saiuDaTela, tremerFio, velocidadeDaMao,
  type Amostra, type Fio, type Ponto,
} from '@/components/Halloween/aranhaFisica';
import '@/components/Halloween/cartaz.css';
import { posicaoCursor, type PontoCursor } from '../componentes/Cursor';
import { APP_L, CABECALHO, SIDEBAR } from '../app/layout';
import { entre, mola, ms, s } from '../movimento';
import './detalhes-video.css';

fonteElite('normal', { weights: ['400'], subsets: ['latin'] });
fonteCaveat('normal', { weights: ['700'], subsets: ['latin'] });
fonteCreepster('normal', { weights: ['400'], subsets: ['latin'] });

const FPS = 60;
/** A altura do app no vídeo de Natal: 1600×900 é 16:9 exato. */
/** 1600 × 780 (×1,2 = 1920 × 936): a proporção da área do navegador, e não 16:9. */
export const ALTURA_NATAL = 780;
const APP_A = ALTURA_NATAL;
/** O `<main>` do app: onde mora a camada do Halloween (teias, aranha, cartaz). */
const MAIN = { x: SIDEBAR, y: CABECALHO, l: APP_L - SIDEBAR };

/** Onda de ida e volta (`alternate`) com `ease-in-out`: 0→1→0 em `periodo` s. */
function vaiVolta(t: number, periodo: number) {
  const u = ((t / periodo) % 2 + 2) % 2;
  const p = u < 1 ? u : 2 - u;
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}
/** Interpolação por chaves, como um @keyframes linear. */
function chaves(t: number, k: [number, number][]) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
    const [a, va] = k[i - 1]; const [b, vb] = k[i];
    return va + ((vb - va) * (t - a)) / (b - a);
  }
  return k[k.length - 1][1];
}

// ── O roteiro (relativo ao começo do trecho, `D`) ───────────────────────────

export function roteiroDosDetalhes(D: number) {
  // Uma coisa de cada vez: o nome, o chat, a teia e a aranha, os chapéus, os
  // morcegos, e a aranha jogada longe — até o morcego trazer o cartaz.
  const r = {
    marca: D + s(0.6),
    viraAbobora: D + s(2.0),
    mensagem: D + s(3.0),
    teias: D + s(4.4),
    chapeus: D + s(6.0),
    morcegos: D + s(7.0),
    cliqueMorcego: D + s(8.8),
    pegaAranha: D + s(10.8),
    // Puxão forte para baixo e para a esquerda: o fio estica e estoura.
    soltaAranha: D + s(12.35),
    perdida: 0,
    cartaz: 0,
    prende: 0,
    fim: 0,
  };
  r.perdida = simularAranha(r, Infinity).perdidaEm ?? r.soltaAranha + s(2);
  r.cartaz = r.perdida + s(0.6);
  r.prende = r.cartaz + s(2.8);
  r.fim = r.prende + s(1.3);
  return r;
}
export type Roteiro = ReturnType<typeof roteiroDosDetalhes>;

// ── O mouse ─────────────────────────────────────────────────────────────────

/** A Dona Aranha na teia: caixa em `top: 36px; right: 23px` do <main>, fio de 110 px. */
const ALTURA_DO_FIO = 110;
const CABECA = 10;
const ANCORA: Ponto = { x: MAIN.x + MAIN.l - 23 - 13, y: MAIN.y + 36 };
/** O centro do corpo na teia, com o fio no ponto mais curto do vai-e-vem (`ociosa`, scaleY .45). */
const CORPO_NA_TEIA: Ponto = { x: ANCORA.x, y: ANCORA.y + ALTURA_DO_FIO - 3 + 13 - ALTURA_DO_FIO * 0.55 };

export function mouseDosDetalhes(r: Roteiro): PontoCursor[] {
  return [
    { f: r.morcegos + s(0.6), x: 1180, y: 580 },
    { f: r.cliqueMorcego, ...posMorcegoClicado(r), viagemMs: 900 },
    { f: r.pegaAranha - s(0.5), x: CORPO_NA_TEIA.x - 30, y: CORPO_NA_TEIA.y + 60, viagemMs: 1600 },
    { f: r.pegaAranha, x: CORPO_NA_TEIA.x, y: CORPO_NA_TEIA.y, viagemMs: 500 },
    { f: r.pegaAranha + ms(420), x: CORPO_NA_TEIA.x - 260, y: CORPO_NA_TEIA.y + 560, viagemMs: 420 },
    { f: r.pegaAranha + ms(980), x: CORPO_NA_TEIA.x - 330, y: CORPO_NA_TEIA.y + 470, viagemMs: 560 },
    { f: r.soltaAranha, x: CORPO_NA_TEIA.x - 520, y: CORPO_NA_TEIA.y + 140, viagemMs: 380 },
    { f: r.soltaAranha + ms(700), x: CORPO_NA_TEIA.x - 560, y: CORPO_NA_TEIA.y + 120, viagemMs: 700 },
    { f: r.fim, x: 1180, y: 520, viagemMs: 1400 },
  ];
}

// ── A aranha: a física do app, quadro a quadro ──────────────────────────────

type Modo = 'esticando' | 'balancando' | 'segura' | 'voando' | 'perdida';
type Estado = {
  modo: Modo; x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  comprimento: number; mao: Ponto; dedo: Ponto; amostras: Amostra[];
  fioPreso: Fio | null; fioCaco: Fio | null; fioToco: Fio | null;
  estourouEm: number | null; perdidaEm: number | null;
};

/** Os pontos do mouse da aranha (os mesmos do cursor, só o trecho dela). */
function maoDaAranha(r: Roteiro, f: number) {
  return posicaoCursor(f, mouseDosDetalhes(r).slice(3, 8));
}

/** Roda a cena da aranha do pegar até `ate` (ou até ela cair da tela). Determinística. */
export function simularAranha(r: Roteiro, ate: number): Estado {
  const a = ANCORA;
  const s0: Estado = {
    modo: 'esticando', x: CORPO_NA_TEIA.x, y: CORPO_NA_TEIA.y - CABECA, vx: 0, vy: 0, rot: 0, vr: 0,
    comprimento: 0, mao: { ...CORPO_NA_TEIA }, dedo: { x: 0, y: 0 }, amostras: [],
    fioPreso: null, fioCaco: null, fioToco: null, estourouEm: null, perdidaEm: null,
  };
  s0.comprimento = Math.max(12, distancia(s0, a));
  s0.fioPreso = criarFio(a, s0, s0.comprimento);
  s0.dedo = { x: s0.mao.x - s0.x, y: s0.mao.y - s0.y };
  const cabeca = (st: Estado): Ponto => {
    const rad = (st.rot * Math.PI) / 180;
    return { x: st.x + CABECA * Math.sin(rad), y: st.y - CABECA * Math.cos(rad) };
  };
  const fim = Math.min(ate, r.soltaAranha + s(6));
  for (let f = r.pegaAranha; f < fim; f++) {
    const st = s0;
    if (st.modo === 'perdida') break;
    const t = (f / FPS) * 1000;
    if (f <= r.soltaAranha) {
      st.mao = maoDaAranha(r, f);
      st.amostras.push({ ...st.mao, t });
      if (st.amostras.length > 8) st.amostras.shift();
    }
    if (f === r.soltaAranha) {
      if (st.modo === 'esticando') { st.modo = 'balancando'; st.comprimento = comprimentoAoSoltar(st, a, st.comprimento); }
      else if (st.modo === 'segura') {
        st.modo = 'voando';
        const v = arremesso(st);
        st.vx = v.vx; st.vy = v.vy;
        const mao = velocidadeDaMao(st.amostras, t);
        st.vr = Math.max(-12, Math.min(12, (v.vx + mao.vx * 0.3) * 1.1)) - 4.5;
      }
    }
    // O app divide cada quadro em passos de meio quadro (a mola do fio não aguenta passo grande).
    for (let i = 0; i < 2; i++) {
      const dt = 0.5;
      if (st.modo === 'esticando') {
        const mao = { x: st.mao.x - st.dedo.x, y: st.mao.y - st.dedo.y };
        st.comprimento = fioQueSolta(a, mao, st.comprimento, dt);
        passoNaMao(st, alvoNoFio(a, mao, st.comprimento), dt);
      } else if (st.modo === 'balancando') passoNoFio(st, a, st.comprimento, dt);
      else if (st.modo === 'segura') passoNaMao(st, { x: st.mao.x - st.dedo.x, y: st.mao.y - st.dedo.y }, dt);
      else if (st.modo === 'voando') passoLivre(st, APP_L, dt);
      if (st.fioPreso) {
        st.fioPreso.repouso = st.comprimento;
        passoDoFio(st.fioPreso, a, st, dt);
        tremerFio(st.fioPreso, Math.max(0, distancia(a, st) - st.comprimento) / FISICA.limite, t);
      }
      if (st.fioCaco) {
        st.fioCaco.repouso *= Math.pow(0.86, dt);
        passoDoFio(st.fioCaco, a, null, dt);
        if (st.fioCaco.repouso < 3) st.fioCaco = null;
      }
      if (st.fioToco && (st.modo === 'segura' || st.modo === 'voando')) passoDoFio(st.fioToco, cabeca(st), null, dt);
    }
    if (st.modo === 'esticando' && estourou(st, a, st.comprimento)) {
      // O estouro do app: o pedaço de cima recolhe, um toco fica nela, e ela vem para a mão.
      const rad = (st.rot * Math.PI) / 180;
      const cx = st.x - CABECA * Math.sin(rad), cy = st.y + CABECA * Math.cos(rad);
      if (st.fioPreso) {
        st.fioCaco = { nos: st.fioPreso.nos.map(n => ({ ...n })), repouso: st.comprimento };
        const d = distancia(a, st) || 1;
        st.fioToco = criarFio(st, { x: st.x + ((a.x - st.x) / d) * 24, y: st.y + ((a.y - st.y) / d) * 24 }, 24, 7);
      }
      st.fioPreso = null;
      st.dedo = { x: st.dedo.x + (st.x - cx), y: st.dedo.y + (st.y - cy) };
      st.x = cx; st.y = cy;
      st.modo = 'segura';
      st.estourouEm = f;
    } else if (st.modo === 'esticando' || st.modo === 'balancando') {
      st.rot = anguloNoFio(st, a);
    } else if (st.modo === 'segura') {
      st.rot += (Math.max(-35, Math.min(35, st.vx * 3)) - st.rot) * Math.min(1, 0.12);
    } else if (st.modo === 'voando' && saiuDaTela(st, APP_A)) {
      st.modo = 'perdida'; st.perdidaEm = f;
    }
  }
  return s0;
}

/** A Dona Aranha (`AranhaSvg` do app), 26 px. */
const AranhaSvg: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="-13 -13 26 26" style={style}>
    <g className="pernas">
      <path d="M-3 -2 L-9 -8 L-12 -4" /><path d="M-3 0 L-10 -3 L-13 1" /><path d="M-3 2 L-10 3 L-12 8" /><path d="M-2 3 L-7 8 L-8 12" />
      <path d="M3 -2 L9 -8 L12 -4" /><path d="M3 0 L10 -3 L13 1" /><path d="M3 2 L10 3 L12 8" /><path d="M2 3 L7 8 L8 12" />
    </g>
    <ellipse className="corpo" cx="0" cy="3" rx="5" ry="6" />
    <circle className="corpo" cx="0" cy="-4" r="3.4" />
    <circle className="olho" cx="-1.3" cy="-4.3" r=".9" /><circle className="olho" cx="1.3" cy="-4.3" r=".9" />
  </svg>
);

/** A teia do canto (`desenharTeia(100)` do app): 7 raios, 7 voltas, um fio arrebentado. */
const TEIA = (() => {
  const raios = 7, voltas = 7, tam = 100, d: string[] = [];
  const ang = (i: number) => (Math.PI / 2) * (i / (raios - 1));
  const p = (a: number, rr: number) => `${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
  for (let i = 0; i < raios; i++) d.push(`M0 0 L${p(ang(i), tam * (0.92 + 0.08 * Math.sin(i * 2.3)))}`);
  for (let k = 1; k <= voltas; k++) {
    const rr = tam * (k / voltas) * 0.9;
    for (let i = 0; i < raios - 1; i++) {
      if (k === 5 && i === 3) continue;
      const a1 = ang(i), a2 = ang(i + 1);
      d.push(`M${p(a1, rr)} Q${p((a1 + a2) / 2, rr * 0.86)} ${p(a2, rr)}`);
    }
  }
  return d.join(' ');
})();

/** O «pof»: 7 pontinhos saindo em roda (`.hw-pof`, .5 s). */
const Pof: React.FC<{ x: number; y: number; em: number; fio?: boolean }> = ({ x, y, em, fio }) => {
  const f = useCurrentFrame();
  if (f < em || f > em + ms(500)) return null;
  const p = 1 - Math.pow(1 - (f - em) / ms(500), 2);
  return (
    <div className={fio ? 'hw-pof fio' : 'hw-pof'} style={{ left: x, top: y }}>
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 51}deg) translateX(${18 * p}px)`, opacity: 1 - p }} />
      ))}
    </div>
  );
};

const Aranha: React.FC<{ r: Roteiro }> = ({ r }) => {
  const f = useCurrentFrame();
  const st = useMemo(() => (f >= r.pegaAranha ? simularAranha(r, f + 1) : null), [r, f]);
  const desceEm = r.teias + ms(500);
  if (f < desceEm) return null;
  const t = f / FPS;
  // Descendo da teia (3,2 s, ease-in-out) e depois o vai-e-vem `ociosa` (6,5 s).
  const desce = entre(f, desceEm, desceEm + s(1.8), 0, 1, (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2));
  const ociosa = f >= desceEm + s(1.8);
  const fase = ociosa ? vaiVolta((f - desceEm - s(1.8)) / FPS, 6.5) : 0;
  const alturaFio = ociosa ? ALTURA_DO_FIO * (0.45 + 0.55 * fase) : 4 + (ALTURA_DO_FIO * 0.45 - 4) * desce;
  const gira = -8 + 16 * vaiVolta(t, ociosa ? 3 : 1.4);
  const naTeia = !st;
  // Solta: o corpo onde a física diz; presa ao fio, o fio sai do alto da cabeça.
  let solta: { cx: number; cy: number; rot: number } | null = null;
  let tensao = 0;
  if (st && st.modo !== 'perdida') {
    let cx = st.x, cy = st.y;
    if (st.modo === 'esticando' || st.modo === 'balancando') {
      const rad = (st.rot * Math.PI) / 180;
      cx = st.x - CABECA * Math.sin(rad); cy = st.y + CABECA * Math.cos(rad);
      tensao = Math.max(0, distancia(ANCORA, st) - st.comprimento) / FISICA.limite;
    }
    solta = { cx, cy, rot: st.rot };
  }
  const agitada = st && (st.modo === 'segura' || st.modo === 'voando');
  const tremido = agitada ? (Math.floor(f / 5.4) % 2 ? 13 : -13) : 0;
  return (
    <>
      {naTeia && (
        <div className="hw-aranha" style={{ left: ANCORA.x - 13, top: ANCORA.y, right: 'auto', position: 'absolute' }}>
          <div className="fio" style={{ height: alturaFio }} />
          <AranhaSvg style={{ transform: `rotate(${gira}deg)` }} />
        </div>
      )}
      {st && (
        <div className="hw-aranha-palco hw-claro text-foreground" style={{ position: 'absolute' }}>
          <svg className="hw-aranha-fios">
            {st.fioPreso && <path className="fio-livre" d={caminhoDoFio(st.fioPreso.nos)} style={{ strokeWidth: Math.max(0.35, 1 - tensao * 0.6) }} />}
            {st.fioCaco && <path className="fio-livre" d={caminhoDoFio(st.fioCaco.nos)} />}
            {st.fioToco && st.modo !== 'perdida' && <path className="fio-livre toco" d={caminhoDoFio(st.fioToco.nos)} />}
          </svg>
          {solta && (
            <div className="hw-aranha solta ativa" style={{ transform: `translate(${solta.cx - 20}px, ${solta.cy - 20}px) rotate(${solta.rot}deg)` }}>
              <AranhaSvg style={{ transform: `rotate(${tremido}deg) translateX(${tremido > 0 ? 0.5 : -0.5}px)` }} />
            </div>
          )}
          {st.estourouEm !== null && <Pof x={st.x} y={st.y} em={st.estourouEm} fio />}
        </div>
      )}
    </>
  );
};

// ── Os morcegos ─────────────────────────────────────────────────────────────

const BANDO = [
  { top: 120, d: 5.4, atraso: 0, s: 1.1, bater: 0.32 },
  { top: 190, d: 5.0, atraso: 0.22, s: 0.85, bater: 0.29 },
  { top: 160, d: 6.1, atraso: 0.44, s: 1.25, bater: 0.37 },
  { top: 260, d: 5.7, atraso: 0.66, s: 0.75, bater: 0.3 },
  { top: 230, d: 6.4, atraso: 0.88, s: 1.0, bater: 0.34 },
];
const CLICADO = 2;

/** `hw-voa`: da esquerda (-60 px) até passar da direita, ondulando. */
function noVoo(m: (typeof BANDO)[number], t: number) {
  const k = Math.max(0, Math.min(1, t / m.d));
  const w = APP_L;
  const x = chaves(k, [[0, 0], [0.25, w * 0.25], [0.5, w * 0.5], [0.75, w * 0.75], [1, w + 80]]);
  const y = chaves(k, [[0, 0], [0.25, -18], [0.5, 12], [0.75, -14], [1, 4]]);
  return { x: -60 + x, y: m.top + y };
}

export function posMorcegoClicado(r: Roteiro) {
  const m = BANDO[CLICADO];
  const p = noVoo(m, (r.cliqueMorcego - r.morcegos) / FPS - m.atraso);
  return { x: p.x + 25 * m.s, y: p.y + 12 * m.s };
}

/** As asas e o corpo do desenho do app, pelo quadro (`hw-bate-e/d`, `hw-sobe-m`). */
const estiloDoMorcego = (id: string, t: number, bater: number) => {
  const p = vaiVolta(t, bater);
  return `#${id} .asa-e{transform:rotate(${34 - 60 * p}deg) scaleY(${0.9 - 0.15 * p})!important}`
    + `#${id} .asa-d{transform:rotate(${-34 + 60 * p}deg) scaleY(${0.9 - 0.15 * p})!important}`
    + `#${id} .corpo-m{transform:translateY(${1.5 - 3.5 * p}px)!important}`;
};

const Morcegos: React.FC<{ r: Roteiro }> = ({ r }) => {
  const f = useCurrentFrame();
  if (f < r.morcegos || f > r.morcegos + s(8)) return null;
  const t = (f - r.morcegos) / FPS;
  return (
    <div className="hw-revoada" style={{ position: 'absolute', inset: 0 }}>
      {BANDO.map((m, i) => {
        const tm = t - m.atraso;
        if (tm < 0 || tm > m.d) return null;
        const id = `nt-morcego-${i}`;
        let x: number, y: number, rot = 0;
        const caiu = i === CLICADO && f >= r.cliqueMorcego;
        if (caiu) {
          // O `derrubar` do app: perde o controle e cai rodopiando.
          const p0 = noVoo(m, (r.cliqueMorcego - r.morcegos) / FPS - m.atraso);
          x = p0.x; y = p0.y;
          let vx = 2.0, vy = -3.2;
          const vr = 10;
          for (let n = 1; n <= f - r.cliqueMorcego; n++) {
            vy += 0.32; vx *= 0.99;
            x += vx + Math.sin(n / 4) * 1.6; y += vy; rot += vr * (1 - Math.min(n, 40) / 120);
          }
          if (y > APP_A + 40) return null;
        } else ({ x, y } = noVoo(m, tm));
        return (
          <div key={i} id={id} className={caiu ? 'hw-morcego caindo' : 'hw-morcego'}
            style={{ left: 0, top: 0, width: 50 * m.s, height: 25 * m.s, transform: `translate(${x}px, ${y}px) rotate(${rot}deg)` }}>
            <style>{estiloDoMorcego(id, caiu ? tm * 4.6 : tm, m.bater)}</style>
            <MorcegoSvg />
          </div>
        );
      })}
      {f >= r.cliqueMorcego && <Pof {...posMorcegoClicado(r)} em={r.cliqueMorcego} />}
    </div>
  );
};

// ── A bolha do chat ─────────────────────────────────────────────────────────

/** O balão do chat de sempre (`IconeChat`, 26 px). */
const IconeChat = () => (
  <svg viewBox="0 0 32 32" style={{ width: 26, height: 26 }}>
    <path d="M6 4h20a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13.6l-5.3 4.7A1 1 0 0 1 6.6 27v-4H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <circle cx="11" cy="13.5" r="1.9" fill="currentColor" /><circle cx="16" cy="13.5" r="1.9" fill="currentColor" /><circle cx="21" cy="13.5" r="1.9" fill="currentColor" />
  </svg>
);

/** A bolha: `fixed bottom-6 right-6 w-14 h-14`. Antes do tema, o quadrado azul; depois, a abóbora. */
export const BolhaDoChat: React.FC<{ r: Roteiro | null }> = ({ r }) => {
  const f = useCurrentFrame();
  const abobora = r !== null && f >= r.viraAbobora;
  const t = f / FPS;
  const acesa = r !== null && f >= r.mensagem;
  // `hw-respira` e `hw-cipo` (3,6 s) e `hw-vela` (1,4 s, em degraus).
  const resp = vaiVolta(t, 1.8);
  const vela = chaves(((t % 1.4) / 1.4), [[0, 1], [0.349, 1], [0.35, 0.78], [0.549, 0.78], [0.55, 0.95], [0.799, 0.95], [0.8, 0.7], [1, 0.7]]);
  const id = 'nt-abobora-chat';
  const surge = r ? entre(f, r.viraAbobora, r.viraAbobora + ms(420), 0, 1) : 0;
  const badge = r ? entre(f, r.mensagem, r.mensagem + ms(260), 0, 1) : 0;
  return (
    <div style={{ position: 'absolute', right: 24, bottom: 24, width: 56, height: 56 }}>
      {!abobora ? (
        <div className="rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center" style={{ width: 56, height: 56 }}>
          <IconeChat />
        </div>
      ) : (
        <div id={id} className="flex items-center justify-center" style={{ width: 56, height: 56, transform: `scale(${0.6 + 0.4 * surge})`, opacity: surge }}>
          <style>{`#${id} .ab-corpo{transform:scale(${1 + 0.025 * resp},${1 - 0.025 * resp})!important}`
            + `#${id} .ab-cipo{transform:translateY(${1.2 * resp}px) rotate(${-2 + 5 * resp}deg)!important}`
            + (acesa ? `#${id} .rosto{opacity:${vela}!important}` : '')}</style>
          <AboboraChat acesa={acesa} />
        </div>
      )}
      {r && <Pof x={28} y={28} em={r.viraAbobora} />}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center ring-2 ring-background bg-destructive text-destructive-foreground"
          style={{ transform: `scale(${0.4 + 0.6 * badge})`, opacity: badge }}>1</span>
      )}
    </div>
  );
};

// ── O cartaz «Procura-se» ───────────────────────────────────────────────────

const FIO_CARTAZ = 26;
const RASGO = (() => {
  let sem = 13;
  const rr = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
  const p: string[] = [];
  const pt = (x: number, y: number) => p.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  for (let x = 0; x <= 100; x += 3.2) pt(x, rr() * 1.3);
  for (let y = 0; y <= 100; y += 2.6) pt(100 - rr() * 1.6, y);
  for (let x = 100; x >= 0; x -= 3) pt(x, 100 - rr() * 1.3 - (x > 6 && x < 19 ? 2.5 + rr() * 2.2 : 0));
  for (let y = 100; y >= 0; y -= 2.6) pt(rr() * 1.6, y);
  return `polygon(${p.join(',')})`;
})();

/** O retrato do cartaz (`RetratoDaAranha` do app), com o piscar pelo quadro. */
const Retrato: React.FC<{ pisca: boolean }> = ({ pisca }) => {
  const tinta = '#3b2413', escuro = '#2a180b';
  return (
    <svg viewBox="0 0 200 178">
      <defs>
        <pattern id="hw-cartaz-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#6b4a2c" strokeWidth="1.3" opacity=".45" />
        </pattern>
        <radialGradient id="hw-cartaz-moldura" cx="50%" cy="42%" r="62%">
          <stop offset="0" stopColor="#f1dcaa" /><stop offset=".75" stopColor="#ddbb7c" /><stop offset="1" stopColor="#c39a58" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="88" rx="90" ry="82" fill="url(#hw-cartaz-moldura)" stroke={tinta} strokeWidth="4" />
      <ellipse cx="100" cy="88" rx="81" ry="73" fill="none" stroke={tinta} strokeWidth="1.4" strokeDasharray="2 4" />
      <path d="M30 130 Q100 175 170 130 L170 170 L30 170 Z" fill="url(#hw-cartaz-hachura)" style={{ clipPath: 'ellipse(81px 73px at 100px 88px)' }} />
      <line x1="100" y1="6" x2="100" y2="52" stroke={tinta} strokeWidth="2" />
      <g fill="none" stroke={tinta} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M82 80 Q60 44 36 62" /><path d="M80 92 Q48 80 26 98" /><path d="M80 104 Q46 112 34 136" /><path d="M85 114 Q66 140 62 158" />
        <path d="M118 80 Q140 44 164 62" /><path d="M120 92 Q152 80 174 98" /><path d="M120 104 Q154 112 166 136" /><path d="M115 114 Q134 140 138 158" />
      </g>
      <g fill={tinta}>
        <circle cx="36" cy="62" r="4" /><circle cx="26" cy="98" r="4" /><circle cx="34" cy="136" r="4" /><circle cx="62" cy="158" r="4" />
        <circle cx="164" cy="62" r="4" /><circle cx="174" cy="98" r="4" /><circle cx="166" cy="136" r="4" /><circle cx="138" cy="158" r="4" />
      </g>
      <ellipse cx="100" cy="116" rx="31" ry="35" fill="#3f2816" stroke={escuro} strokeWidth="4" />
      <path d="M86 102 Q100 92 114 102 M88 116 Q100 108 112 116 M90 130 Q100 124 110 130" stroke="#7a5534" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="88" cy="104" rx="6" ry="9" fill="#8d6640" opacity=".55" transform="rotate(-20 88 104)" />
      <circle cx="100" cy="72" r="26" fill="#4b301a" stroke={escuro} strokeWidth="4" />
      <path d="M114 50 l14 -9 l-2 15 z M114 50 l-15 -6 l5 13 z" fill="#a8452f" stroke={escuro} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="114" cy="50" r="3.6" fill="#a8452f" stroke={escuro} strokeWidth="2.2" />
      {[89, 111].map(x => (
        <g key={x}>
          <ellipse cx={x} cy="68" rx="9.5" ry="11.5" fill="#fbf1da" stroke={escuro} strokeWidth="2.6" />
          <g><circle cx={x - 1.5} cy="70" r="4.6" fill="#1d1109" /><circle cx={x + 0.1} cy="68.2" r="1.4" fill="#fff" /></g>
          <ellipse cx={x} cy="68" rx="10.4" ry="12.4" fill="#4b301a" stroke={escuro} strokeWidth="2.6"
            style={{ transformBox: 'fill-box', transformOrigin: '50% 0', transform: `scaleY(${pisca ? 1 : 0})` }} />
        </g>
      ))}
      <path d="M80 54 Q88 49 96 54" stroke={escuro} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M104 52 Q113 52 120 57" stroke={escuro} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M91 85 Q100 91 110 83" stroke={escuro} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M96 87.6 l1.6 4 l1.8 -3.6 M103 87.4 l1.6 3.8 l1.6 -3.9" fill="#fbf1da" stroke={escuro} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
};

const Cartaz: React.FC<{ r: Roteiro }> = ({ r }) => {
  const f = useCurrentFrame();
  if (f < r.cartaz) return null;
  // O voo do carteiro (`CartazProcuraSe`): do alto e do meio da tela até a teia,
  // em 8 trechos que afundam e giram com o peso.
  const largura = MAIN.l;
  const x0 = largura / 2 - (largura - 46);
  const y0 = -(36 + FIO_CARTAZ + 120 + 60);
  const durVoo = r.prende - r.cartaz;
  const k = Math.min(1, (f - r.cartaz) / durVoo);
  const eased = (() => { // cubic-bezier(.3,.1,.35,1) aproximado
    const u = k; return 1 - Math.pow(1 - u, 2.4);
  })();
  const passos = 8;
  const pontos = Array.from({ length: passos + 1 }, (_, i) => {
    const kk = i / passos;
    const desce = 1 - (1 - kk) * (1 - kk);
    const afunda = i === 0 || i === passos ? 0 : (i % 2 ? 16 : -2) * (1 - kk * 0.5);
    const giro = i === passos ? 0 : (i % 2 ? 5 : -5) * (1 - kk * 0.5);
    return { x: x0 * (1 - kk), y: y0 + (-FIO_CARTAZ - y0) * desce + afunda, g: giro, k: kk };
  });
  const ix = Math.min(passos - 1, Math.floor(eased * passos));
  const u = eased * passos - ix;
  const a = pontos[ix], b = pontos[ix + 1];
  let vx = a.x + (b.x - a.x) * u, vy = a.y + (b.y - a.y) * u, vg = a.g + (b.g - a.g) * u;
  // Prendeu: o fio desce com mola e o voo vai para o lugar (650 ms, cubic-bezier(.3,1.45,.5,1)).
  const mola = (p: number) => 1 - Math.pow(1 - p, 3) + Math.sin(Math.min(1, p) * Math.PI) * 0.18;
  const prendeu = f >= r.prende;
  const pf = prendeu ? Math.min(1, (f - r.prende) / ms(650)) : 0;
  const fioH = prendeu ? FIO_CARTAZ * mola(pf) : 0;
  if (prendeu) { vx = 0; vy = -FIO_CARTAZ * (1 - mola(pf)); vg = 0; }
  // O tranco: 0, 7, -4,4, 2,6, -1,2, 0,4, 0 graus em 1,7 s, 420 ms depois; e o balanço de sempre.
  const tt = (f - r.prende - ms(420)) / ms(1700);
  const tranco = prendeu && tt > 0 && tt < 1 ? chaves(tt, [[0, 0], [1 / 6, 7], [2 / 6, -4.4], [3 / 6, 2.6], [4 / 6, -1.2], [5 / 6, 0.4], [1, 0]]) : 0;
  const balanca = -2 + 3.8 * vaiVolta(f / FPS, 5.5);
  // Abrir/fechar: a transição de .45 s cubic-bezier(.3,.8,.3,1) do CSS.
  const pa = 0; // o cartaz não abre no vídeo (pedido de 28/10): só chega e balança
  const corpoT = `translate(calc(-50% - ${84 * pa}px), ${FIO_CARTAZ + 60 * pa}px) scale(${1 + 1.9 * pa})`;
  const fioAberto = { h: prendeu ? fioH + 94 * pa : 0, rot: 44.3 * pa };
  // O carteiro: sua e bate rápido carregando; aliviado, sobe e vai embora (1,3 s).
  const tm = (f - r.prende) / ms(1300);
  const morcegoVai = prendeu ? chaves(Math.min(1, tm), [[0, 0], [0.3, 0.3], [1, 1]]) : 0;
  const morcegoT = prendeu ? `translate(${-4 * Math.min(1, morcegoVai / 0.3) + 264 * Math.max(0, (morcegoVai - 0.3) / 0.7)}px, ${-30 * Math.min(1, morcegoVai / 0.3) - 210 * Math.max(0, (morcegoVai - 0.3) / 0.7)}px) rotate(${-6 - 12 * Math.max(0, (morcegoVai - 0.3) / 0.7)}deg)` : 'none';
  const morcegoOp = prendeu ? 1 - Math.max(0, (morcegoVai - 0.3) / 0.7) : 1;
  const pisca = [1.8, 5.1, 5.43, 8.3].some(x => { const d = (f - r.cartaz) / FPS - x; return d > 0 && d < 0.14; });
  const gota = ((f - r.cartaz) / ms(800)) % 1;
  return (
    <div className="hw-cartaz text-foreground" style={{ left: MAIN.x + MAIN.l - 46, top: MAIN.y + 36, right: 'auto', ['--fio' as string]: `${FIO_CARTAZ}px` }}>
      <div className="hw-cartaz-fio" style={{ height: fioAberto.h, transform: `rotate(${fioAberto.rot}deg)`, transition: 'none' }} />
      <div className="hw-cartaz-corpo" style={{ transform: corpoT, transition: 'none' }}>
        <div className="hw-cartaz-voo" style={{ transform: `translate(${vx}px, ${vy}px) rotate(${vg + tranco}deg)` }}>
          <div className="hw-cartaz-balanco" style={{ transform: `rotate(${balanca}deg)` }}>
            <div className="hw-cartaz-papel" style={{ clipPath: RASGO }}>
              <span className="prego" />
              <p className="titulo">PROCURA-SE</p>
              <p className="sub">VIVA OU… VIVA</p>
              <div className="retrato"><Retrato pisca={pisca} /></div>
              <p className="nome">DONA ARANHA</p>
              <p className="fugiu">Fugiu do fio às <b>14:32</b></p>
              <div className="recompensa"><span>RECOMPENSA</span><b>13 balas de abóbora</b></div>
              <p className="aviso">Se avistada, <strong>NÃO puxe o fio</strong>.</p>
              <p className="lapis rabisco">vi ela no Analítico!!</p>
              <p className="lapis volta">ela volta em<br /><b>{`4:${String(59 - Math.floor((f - r.cartaz) / FPS)).padStart(2, '0')}`}</b></p>
            </div>
          </div>
          {morcegoOp > 0 && (
            <div id="nt-carteiro" className={prendeu ? 'hw-morcego hw-carteiro aliviado' : 'hw-morcego hw-carteiro'} style={{ transform: morcegoT, opacity: morcegoOp }}>
              <style>{estiloDoMorcego('nt-carteiro', (f - r.cartaz) / FPS, prendeu ? 0.3 : 0.15)}</style>
              <MorcegoSvg />
              {!prendeu && <i className="gota" style={{ transform: `translate(${3 * gota}px, ${9 * gota}px)`, opacity: 1 - gota }} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Tudo junto ──────────────────────────────────────────────────────────────

/** As teias dos cantos de cima do <main> (`.hw-teia`, opacidade .3). */
const Teias: React.FC<{ r: Roteiro }> = ({ r }) => {
  const f = useCurrentFrame();
  if (f < r.teias) return null;
  const desenha = entre(f, r.teias, r.teias + ms(900), 0, 1);
  return (
    <div className="hw-claro text-foreground" style={{ position: 'absolute', left: MAIN.x, top: MAIN.y, width: MAIN.l, height: 0 }}>
      <div className="hw-teia esq"><svg viewBox="0 0 100 100"><path d={TEIA} pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - desenha }} /></svg></div>
      <div className="hw-teia dir"><svg viewBox="0 0 100 100"><path d={TEIA} pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - desenha }} /></svg></div>
    </div>
  );
};

export const Detalhes: React.FC<{ r: Roteiro }> = ({ r }) => (
  <div className="nt-hw" style={{ position: 'absolute', inset: 0 }}>
    <Teias r={r} />
    <Cartaz r={r} />
    <Aranha r={r} />
    <Morcegos r={r} />
  </div>
);

// ── O nome do sistema e os chapéus ──────────────────────────────────────────

/** `MarcaHalloween`: «Halloween» em Creepster, cor de abóbora, em cima do nome. */
const TITULO_HALLOWEEN: React.CSSProperties = {
  fontFamily: "'Creepster', Georgia, serif",
  fontSize: 22,
  lineHeight: 1,
  letterSpacing: '0.04em',
  color: 'oklch(0.7 0.19 48)',
  textShadow: '0 1px 0 oklch(0.35 0.12 35 / .55), 0 0 8px oklch(0.7 0.19 48 / .25)',
};

/**
 * O bloco do logo no menu (`h-[73px] px-4 py-5`), por cima do da casca: o
 * «Gestão de Acordos / BookPlay» desce e vira «Halloween / Gestão de Acordos»,
 * com as letras do Halloween caindo uma a uma.
 */
export const MarcaDoMenu: React.FC<{ r: Roteiro; marca: string }> = ({ r, marca }) => {
  const f = useCurrentFrame();
  if (f < r.marca) return null;
  const sai = entre(f, r.marca, r.marca + ms(260), 0, 1);
  const letras = 'Halloween'.split('');
  return (
    <div className="absolute left-0 top-0 flex items-center gap-3 px-4 py-5 border-b border-sidebar-border bg-sidebar" style={{ width: SIDEBAR, height: 73 }}>
      <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded">
        <img src={staticFile('marca/logo-bookplay.png')} className="w-8 h-8 object-contain" />
      </span>
      <div style={{ position: 'relative' }}>
        {/* O de antes, saindo para baixo */}
        {sai < 1 && (
          <div style={{ position: 'absolute', top: 0, left: 0, opacity: 1 - sai, transform: `translateY(${sai * 10}px)`, whiteSpace: 'nowrap' }}>
            <p className="font-bold text-sm text-sidebar-foreground leading-none">Gestão de Acordos</p>
            <p className="text-[11px] text-sidebar-foreground/70 leading-none mt-1">{marca}</p>
          </div>
        )}
        <div className="flex flex-col gap-[3px]" style={{ opacity: sai }}>
          <span style={{ ...TITULO_HALLOWEEN, display: 'flex' }}>
            {letras.map((l, i) => {
              const m = mola(f, r.marca + ms(180 + i * 55));
              return <span key={i} style={{ display: 'inline-block', opacity: Math.min(1, m * 1.6), transform: `translateY(${(1 - m) * -14}px) rotate(${(1 - m) * (i % 2 ? 12 : -12)}deg)` }}>{l}</span>;
            })}
          </span>
          <p className="font-bold text-sm text-sidebar-foreground leading-none">Gestão de Acordos</p>
        </div>
      </div>
    </div>
  );
};

/**
 * O chapéu de bruxa nas fotos (`ComChapeu`, escala 1,1): apoiado no topo da
 * foto, caído para a esquerda. Aqui ele cai do alto e assenta com um quique.
 */
export const ChapeuNaFoto: React.FC<{ em: number; x: number; y: number; tamanho: number; chave: string }> = ({ em, x, y, tamanho, chave }) => {
  const f = useCurrentFrame();
  if (f < em) return null;
  const m = mola(f, em);
  const largura = tamanho * 1.1;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: tamanho, height: tamanho, pointerEvents: 'none' }}>
      <ChapeuBruxa chave={chave} className="hw-chapeu" style={{
        width: largura, bottom: `${Math.round(62 + 1.1 * 8)}%`, opacity: Math.min(1, m * 2),
        transform: `translateX(-62%) translateY(${(1 - m) * -46}px) rotate(${-24 - (1 - m) * 40}deg)`,
      }} />
    </div>
  );
};
