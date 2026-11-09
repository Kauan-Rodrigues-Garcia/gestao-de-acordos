// A Caça aos Zumbis no vídeo de Natal, fiel ao original (arquivo morto,
// `caca-zumbis-bruxas/src/components/CacaAbobora`):
//
//   - o zumbi sai da cova em 17 degraus, com o montinho de terra, e anda
//     devagar para um lado e para o outro, parando de vez em quando;
//   - a mira é a cruz de pixel do app; o primeiro tiro pega na parede;
//   - a morte é a FÍSICA do app (`fisica.ts`): o clarão, o tranco, a cabeça ou
//     o corpo estourando, os pedaços, o sangue e a poça — cada zumbi do seu
//     jeito. Com sorteio de semente fixa, o mesmo quadro sai sempre igual;
//   - os sons são os do app, gravados de `sons.ts` (`scripts/sons-da-caca.mjs`),
//     e os baques, o machado e a pizza tocam quando a física diz;
//   - a faixa de quem matou corre no topo, com o CSS do app.
//
// Os tempos são do vídeo (`T` em VideoNatal); aqui só o que acontece neles.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as fontePixel } from '@remotion/google-fonts/PixelifySans';
import { loadFont as fonteArcade } from '@remotion/google-fonts/PressStart2P';
import {
  ALTURA, LARGURA, MS_POR_PASSO, MS_POR_QUADRO, NUMERO_DA_PARTE, PRIMEIRO_PASSO, TODOS_OS_QUADROS, ZUMBIS,
  centroDaParte, montarQuadro, type Zumbi,
} from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { cabecaDoZumbi, quadrosDoZumbi } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/pixels';
import {
  APAGA_S, DURACAO_S, ORIGEM_X, ORIGEM_Y, PALCO_A, PALCO_L, avancar, criarMorte, desenharChao, desenharResto,
  type Evento, type Tiro,
} from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/fisica';
import '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/caca.css';
import './caca-video.css';
import { NOME } from './nome';
import { ACELERA, entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { Sprite } from './Sprite';

fontePixel('normal', { weights: ['400', '700'], subsets: ['latin', 'latin-ext'] });
fonteArcade('normal', { weights: ['400'], subsets: ['latin'] });

/** Um pixel da arte vira 2 px do app, como no sistema (o vídeo desenha nas coordenadas do app). */
const ESC = 2;
const ZL = LARGURA * ESC;
const ZA = ALTURA * ESC;
const FPS = 60;

/** Sorteio com semente: a mesma morte em todo quadro que for desenhado. */
function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O tempo do placar do app: «0,847 s». */
export const formatarTempo = (msTempo: number) =>
  `${(msTempo / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`;

// ── O roteiro de cada zumbi ─────────────────────────────────────────────────

/** Um trecho depois de sair da cova: parado (`vel` 0) ou andando (art px/s, o sinal é o lado). */
type Trecho = { dur: number; vel: number };

export type Cacada = {
  zumbi: number;
  /** Canto de cima à esquerda do zumbi, ao sair da cova. */
  x: number;
  y: number;
  lado: 1 | -1;
  /** Quadro do vídeo em que ele começa a subir. */
  sobe: number;
  passeio: Trecho[];
  /** Tiro na parede antes do que pega (o furo fica do lado da cabeça). */
  erra?: number;
  tiro: number;
  jeito: Tiro;
  semente: number;
  /** Para a faixa e o placar. */
  quem: string;
  setor: string;
  msTiro: number;
  recordes?: ('rapido' | 'hsRapido')[];
};

const SUBIDA_S = 0.85;

/** Onde o zumbi está e como, num quadro (até o tiro). */
function estadoDoZumbi(c: Cacada, f: number) {
  const t = (Math.min(f, c.tiro) - c.sobe) / FPS;
  const subida = Math.min(1, Math.max(0, t / SUBIDA_S));
  let x = c.x;
  let lado = c.lado;
  let andando = false;
  let tAndou = 0;
  let resto = Math.max(0, t - SUBIDA_S);
  for (const tr of c.passeio) {
    if (resto <= 0) break;
    const d = Math.min(resto, tr.dur);
    if (tr.vel !== 0) {
      lado = tr.vel > 0 ? 1 : -1;
      x += tr.vel * ESC * d;
      if (resto <= tr.dur) andando = true;
      tAndou += d;
    }
    resto -= d;
  }
  // O app anda um pixel da arte por passo; o quadro do passo segue o tempo andado.
  const quadro = andando
    ? PRIMEIRO_PASSO + (Math.floor((tAndou * 1000) / MS_POR_PASSO) % 4)
    : Math.floor((t * 1000) / MS_POR_QUADRO) % 4;
  return { x: Math.round(x / ESC) * ESC, y: c.y, lado, quadro, subida };
}

/** Onde pegou: o centro da cabeça ou do tronco, no quadro do tiro (como o app). */
function impactoDe(c: Cacada) {
  const e = estadoDoZumbi(c, c.tiro);
  const img = montarQuadro(ZUMBIS[c.zumbi], TODOS_OS_QUADROS[e.quadro]);
  const parte = centroDaParte(img, NUMERO_DA_PARTE[c.jeito === 'cabeca' ? 'cabeca' : 'tronco']);
  const xTela = e.x + (e.lado < 0 ? LARGURA - 1 - parte.x : parte.x) * ESC + ESC / 2;
  return { e, parte, xTela, yTela: e.y + parte.y * ESC + ESC / 2 };
}

// ── O zumbi vivo ────────────────────────────────────────────────────────────

const Terra: React.FC<{ f: number; sobe: number }> = ({ f, sobe }) => {
  // `zb-terra`: 1,6 s em 6 degraus; aparece cheia e some nos 30% finais.
  const p = Math.floor(Math.min(1, Math.max(0, (f - sobe) / (1.6 * FPS))) * 6) / 6;
  const op = p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3);
  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 0, width: 4, height: 4, marginLeft: -2, background: '#4a3424', opacity: op,
      transform: `scale(${ESC / 2})`, transformOrigin: '50% 100%',
      boxShadow: '-12px 0 0 #3a281b, -8px 0 0 #5c4330, -4px 0 0 #4a3424, 4px 0 0 #5c4330, 8px 0 0 #3a281b, 12px 0 0 #4a3424, -8px -4px 0 #6b5038, -4px -4px 0 #5c4330, 0 -4px 0 #6b5038, 4px -4px 0 #4a3424, 8px -4px 0 #5c4330, -16px 0 0 #2e2016, 16px 0 0 #2e2016',
    }} />
  );
};

const ZumbiVivo: React.FC<{ c: Cacada }> = ({ c }) => {
  const f = useCurrentFrame();
  const quadros = useMemo(() => quadrosDoZumbi(ZUMBIS[c.zumbi]), [c.zumbi]);
  if (f < c.sobe || f >= c.tiro) return null;
  const e = estadoDoZumbi(c, f);
  // `zb-sobe`: de 100% para 0 em 17 degraus.
  const degrau = Math.floor(e.subida * 17) / 17;
  return (
    <div style={{ position: 'absolute', left: e.x, top: e.y, width: ZL, height: ZA }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ transform: `translateY(${(1 - degrau) * 100}%)` }}>
          <Sprite quadros={quadros} indice={e.quadro} escala={ESC} espelhar={e.lado < 0} style={{ display: 'block' }} />
        </div>
      </div>
      <Terra f={f} sobe={c.sobe} />
    </div>
  );
};

// ── A morte: a física do app, quadro a quadro ───────────────────────────────

function simular(c: Cacada, ate: number) {
  const { e, parte } = impactoDe(c);
  const cena = criarMorte(ZUMBIS[c.zumbi], e.quadro, c.jeito, parte, sorteio(c.semente));
  const eventos: { t: number; e: Evento }[] = [];
  const passos = Math.min(ate, Math.ceil(DURACAO_S * FPS));
  for (let i = 0; i < passos; i++) {
    avancar(cena, 1 / FPS);
    for (const ev of cena.eventos.splice(0)) eventos.push({ t: cena.t, e: ev });
  }
  return { cena, eventos, e };
}

const Morte: React.FC<{ c: Cacada }> = ({ c }) => {
  const f = useCurrentFrame();
  const chao = useRef<HTMLCanvasElement>(null);
  const resto = useRef<HTMLCanvasElement>(null);
  const passou = f - c.tiro;
  const { cena, e } = useMemo(() => simular(c, Math.max(0, passou)), [c, passou]);
  useLayoutEffect(() => {
    const bufChao = new Uint32Array(PALCO_L * PALCO_A);
    const bufResto = new Uint32Array(PALCO_L * PALCO_A);
    desenharChao(cena, bufChao);
    desenharResto(cena, bufResto);
    chao.current?.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(bufChao.buffer), PALCO_L, PALCO_A), 0, 0);
    resto.current?.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(bufResto.buffer), PALCO_L, PALCO_A), 0, 0);
  }, [cena]);
  if (passou < 0) return null;
  const t = passou / FPS;
  // `zb-palco.apagando`: 0,85 s em 5 degraus. `resquicio`: o chão vai a 30% em 1,6 s, 8 degraus.
  const apaga = t < APAGA_S ? 1 : 1 - Math.floor(Math.min(1, (t - APAGA_S) / 0.85) * 5) / 5;
  const chaoOp = t < APAGA_S ? 1 : 1 - 0.7 * (Math.floor(Math.min(1, (t - APAGA_S) / 1.6) * 8) / 8);
  const estilo: React.CSSProperties = {
    position: 'absolute', left: e.x - ORIGEM_X * ESC, top: e.y - ORIGEM_Y * ESC, width: PALCO_L * ESC, height: PALCO_A * ESC,
    imageRendering: 'pixelated', transform: e.lado < 0 ? 'scaleX(-1)' : undefined,
  };
  return (
    <>
      <canvas ref={chao} width={PALCO_L} height={PALCO_A} style={{ ...estilo, opacity: chaoOp }} />
      <canvas ref={resto} width={PALCO_L} height={PALCO_A} style={{ ...estilo, opacity: apaga }} />
    </>
  );
};

/** «HEADSHOT!» subindo da cabeça estourada — `zb-letreiro`, 1,4 s em 14 degraus. */
const Letreiro: React.FC<{ c: Cacada }> = ({ c }) => {
  const f = useCurrentFrame();
  const { xTela, yTela } = useMemo(() => impactoDe(c), [c]);
  if (c.jeito !== 'cabeca' || f < c.tiro || f > c.tiro + s(1.4)) return null;
  const p = Math.floor(((f - c.tiro) / s(1.4)) * 14) / 14;
  const chave = (a: number, b: number, de: number, para: number) => de + ((para - de) * (p - a)) / (b - a);
  let y = -60; let esc = 0.5; let op = 1; let cor = '#fff';
  if (p < 0.12) { y = chave(0, 0.12, -60, -110); esc = chave(0, 0.12, 0.5, 1.25); }
  else if (p < 0.22) { y = -110; esc = chave(0.12, 0.22, 1.25, 1); cor = p < 0.17 ? '#ffd34d' : '#fff'; }
  else if (p < 0.75) { y = chave(0.22, 0.75, -110, -190); esc = 1; }
  else { y = chave(0.75, 1, -190, -230); esc = 1; op = chave(0.75, 1, 1, 0); }
  return (
    <div className="zb-letreiro" style={{
      left: xTela, top: yTela, fontSize: 12, color: cor, opacity: op,
      transform: `translate(-50%, ${y}%) scale(${esc})`,
      textShadow: '2px 0 0 #6e0a12, -2px 0 0 #6e0a12, 0 2px 0 #6e0a12, 0 -2px 0 #6e0a12, 2px 2px 0 #6e0a12, 4px 4px 0 rgb(0 0 0 / .45)',
    }}>HEADSHOT!</div>
  );
};

/** O tiro que pegou na parede: o furo e a poeira (`zb-furo`, 0,7 s em 7 degraus). */
const Furo: React.FC<{ c: Cacada }> = ({ c }) => {
  const f = useCurrentFrame();
  if (c.erra === undefined || f < c.erra || f > c.erra + ms(700)) return null;
  const { xTela, yTela } = impactoDe({ ...c, tiro: c.erra });
  const p = Math.floor(((f - c.erra) / ms(700)) * 7) / 7;
  return (
    <div style={{
      position: 'absolute', left: xTela + (c.lado > 0 ? 30 : -30), top: yTela - 8, width: 4, height: 4, margin: '-2px 0 0 -2px',
      background: '#140c14', opacity: 1 - p, transform: `scale(${1 + 0.5 * p})`,
      boxShadow: '-4px -4px 0 #b9b2a3, 4px -4px 0 #d6d0c2, -4px 4px 0 #d6d0c2, 4px 4px 0 #b9b2a3, 0 -6px 0 #e8e2d4, 6px 0 0 #e8e2d4',
    }} />
  );
};

// ── A mira ──────────────────────────────────────────────────────────────────

const MIRA = (
  <svg width="22" height="22" viewBox="0 0 22 22" shapeRendering="crispEdges">
    <g fill="#140c14"><rect x="9" y="0" width="4" height="8" /><rect x="9" y="14" width="4" height="8" /><rect x="0" y="9" width="8" height="4" /><rect x="14" y="9" width="8" height="4" /><rect x="9" y="9" width="4" height="4" /></g>
    <g fill="#fff"><rect x="10" y="1" width="2" height="6" /><rect x="10" y="15" width="2" height="6" /><rect x="1" y="10" width="6" height="2" /><rect x="15" y="10" width="6" height="2" /></g>
    <rect x="10" y="10" width="2" height="2" fill="#ff3b3b" />
  </svg>
);

/** A mira vai de alvo em alvo: chega, mira um instante, atira. */
export const Mira: React.FC<{ cacadas: Cacada[]; entra: number; sai: number }> = ({ cacadas, entra, sai }) => {
  const f = useCurrentFrame();
  if (f < entra || f > sai) return null;
  const alvos: { f: number; x: number; y: number }[] = [{ f: entra, x: 1480, y: 730 }];
  for (const c of cacadas) {
    const hit = impactoDe(c);
    if (c.erra !== undefined) {
      const er = impactoDe({ ...c, tiro: c.erra });
      alvos.push({ f: c.erra, x: er.xTela + (c.lado > 0 ? 30 : -30), y: er.yTela - 8 });
    }
    alvos.push({ f: c.tiro, x: hit.xTela, y: hit.yTela });
  }
  let x = alvos[0].x; let y = alvos[0].y;
  for (let i = 1; i < alvos.length; i++) {
    const a = alvos[i];
    const ida = Math.min(ms(900), a.f - alvos[i - 1].f - ms(120));
    const p = SUAVE_IDA_VOLTA(Math.min(1, Math.max(0, (f - (a.f - ms(160) - ida)) / ida)));
    x += (a.x - x) * p; y += (a.y - y) * p;
  }
  // Depois do tiro a mão levanta um pouco, para o letreiro sair limpo.
  for (const a of alvos.slice(1)) {
    const lev = entre(f, a.f, a.f + ms(260), 0, 1, SUAVE) * (1 - entre(f, a.f + ms(500), a.f + ms(900), 0, 1));
    x += 30 * lev; y += 24 * lev;
  }
  // A mão treme de leve enquanto mira.
  x += Math.sin(f / 7) * 1.5; y += Math.cos(f / 9) * 1.2;
  const tiro = alvos.find(a => f >= a.f && f < a.f + ms(140));
  const coice = tiro ? 1 - (f - tiro.f) / ms(140) : 0;
  const aparece = entre(f, entra, entra + ms(300), 0, 1);
  return <div style={{ position: 'absolute', left: x - 11, top: y - 11 - coice * 4, opacity: aparece, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))' }}>{MIRA}</div>;
};

// ── Os sons de cada caçada ──────────────────────────────────────────────────

const som = (nome: string) => staticFile(`natal/caca/${nome}.wav`);

/** `enxuto`: só os baques fortes e espaçados (a Arena, 06/11: «muito efeito sonoro»). */
export const SonsDaCaca: React.FC<{ c: Cacada; enxuto?: boolean }> = ({ c, enxuto = false }) => {
  const { eventos } = useMemo(() => simular(c, Math.ceil(DURACAO_S * FPS)), [c]);
  // Vinte peças batendo juntas não viram metralhadora (o app espera 70 ms).
  let ultimo = -1;
  const efeitos = eventos.filter(({ t, e }) => {
    if (e.tipo !== 'baque') return !enxuto;
    if (enxuto && e.forca < 0.6) return false;
    if (t - ultimo < (enxuto ? 0.25 : 0.07)) return false;
    ultimo = t;
    return true;
  });
  const arquivo = (e: Evento) => e.tipo === 'baque' ? (e.forca > 0.7 ? 'baque-forte' : e.forca > 0.35 ? 'baque-medio' : 'baque-fraco') : e.tipo;
  return (
    <>
      <Sequence from={c.sobe} durationInFrames={s(1.5)}><Audio src={som('gemido')} volume={0.32} /></Sequence>
      {c.erra !== undefined && (
        <Sequence from={c.erra} durationInFrames={s(0.8)}>
          <Audio src={som('tiro')} volume={0.5} />
          <Audio src={som('ricochete')} volume={0.3} />
        </Sequence>
      )}
      <Sequence from={c.tiro} durationInFrames={s(1.2)}>
        <Audio src={som('tiro')} volume={0.5} />
        <Audio src={som(c.jeito === 'cabeca' ? 'cerebro' : 'acerto')} volume={0.62} />
      </Sequence>
      {efeitos.map(({ t, e }, i) => (
        <Sequence key={i} from={c.tiro + Math.round(t * FPS)} durationInFrames={s(0.8)}>
          <Audio src={som(arquivo(e))} volume={e.tipo === 'baque' ? 0.22 + 0.2 * e.forca : 0.38} />
        </Sequence>
      ))}
    </>
  );
};

// ── A caçada inteira (zumbi, furo, morte, letreiro) ─────────────────────────

export const Cacadas: React.FC<{ cacadas: Cacada[] }> = ({ cacadas }) => (
  <div className="nt-caca" style={{ position: 'absolute', inset: 0 }}>
    {cacadas.map((c) => <Morte key={`m${c.zumbi}`} c={c} />)}
    {cacadas.map((c) => <ZumbiVivo key={`z${c.zumbi}`} c={c} />)}
    {cacadas.map((c) => <Furo key={`f${c.zumbi}`} c={c} />)}
    {cacadas.map((c) => <Letreiro key={`l${c.zumbi}`} c={c} />)}
  </div>
);

// ── A faixa de quem matou, no topo ──────────────────────────────────────────

const ICONES = {
  caveira: ['.wwwww.', 'wwwwwww', 'wkwwwkw', 'wkwwwkw', 'wwwkwww', '.wwwww.', '.w.w.w.'],
  mira: ['...w...', '.wwwww.', '.w...w.', 'ww.w.ww', '.w...w.', '.wwwww.', '...w...'],
  raio: ['...yy', '..yy.', '.yyyy', '...yy', '..yy.', '.yy..', '.y...'],
} as const;

export const IconePixel: React.FC<{ nome: keyof typeof ICONES; tam?: number; style?: React.CSSProperties }> = ({ nome, tam = 2, style }) => {
  const linhas = ICONES[nome];
  return (
    <svg viewBox={`0 0 ${linhas[0].length} ${linhas.length}`} width={linhas[0].length * tam} height={linhas.length * tam} shapeRendering="crispEdges" style={{ flex: 'none', ...style }}>
      {linhas.flatMap((l, j) => [...l].map((ch, i) => (ch === '.' || ch === 'k' ? null : <rect key={`${i}-${j}`} x={i} y={j} width={1} height={1} fill="currentColor" />)))}
    </svg>
  );
};

/**
 * Só a cabeça, recortada: o desenho dela vem no quadro inteiro do sprite
 * (24×34). No app a faixa corta o resto; aqui a caixa é a da cabeça
 * (`CABECA` em `zumbis.ts`: x 5, y 2, 14 de largura).
 */
export const CabecaZumbi: React.FC<{ zumbi: Zumbi; escala?: number; morta?: boolean }> = ({ zumbi, escala = 2, morta = true }) => {
  const q = useMemo(() => [cabecaDoZumbi(zumbi, morta)], [zumbi, morta]);
  return (
    <span style={{ display: 'inline-block', flex: 'none', width: 15 * escala, height: 15 * escala, overflow: 'hidden', position: 'relative' }}>
      <span style={{ position: 'absolute', left: -4 * escala, top: -2 * escala }}>
        <Sprite quadros={q} indice={0} escala={escala} style={{ display: 'block' }} />
      </span>
    </span>
  );
};

const RecadoDaFaixa: React.FC<{ c: Cacada; piscaHs: boolean }> = ({ c, piscaHs }) => (
  <span className="zb-faixa-recado">
    <CabecaZumbi zumbi={ZUMBIS[c.zumbi]} />
    <span className="zb-faixa-nome" style={NOME}>{c.quem}</span>
    {c.jeito === 'cabeca' && (
      <span className="zb-tag zb-tag-hs" style={{ background: piscaHs ? '#e0262b' : '#c8202a' }}><IconePixel nome="mira" />Headshot</span>
    )}
    <span>matou {ZUMBIS[c.zumbi].nome} em</span>
    <span className="zb-faixa-tempo">{formatarTempo(c.msTiro)}</span>
    {c.recordes?.includes('rapido') && <span className="zb-tag zb-tag-rapido"><IconePixel nome="raio" />Mais rápido do dia</span>}
    {c.recordes?.includes('hsRapido') && <span className="zb-tag zb-tag-hs-rapido"><IconePixel nome="mira" />Headshot mais rápido do dia</span>}
    <IconePixel nome="caveira" style={{ color: '#ece5d0', opacity: 0.55 }} />
  </span>
);

/** A altura da faixa (`.zb-faixa`): é o quanto o conteúdo desce quando ela abre. */
export const ALTURA_FAIXA_ZUMBI = 32;

/** Só a faixa — quem a põe no fluxo, logo abaixo da barra, é o vídeo. */
export const FaixaDaCaca: React.FC<{ cacadas: Cacada[]; abre: number }> = ({ cacadas, abre }) => {
  const f = useCurrentFrame();
  const mortos = cacadas.filter(c => f >= c.tiro + ms(250));
  const correu = ((f - abre) / FPS) * 70;
  const piscaHs = Math.floor((f / FPS) / 0.6) % 2 === 1;
  return (
    <div className="nt-caca">
      <div className="zb-faixa">
        <div className="zb-faixa-trilho" style={{ transform: `translateX(${520 - correu}px)` }}>
          {mortos.map(c => <RecadoDaFaixa key={c.zumbi} c={c} piscaHs={piscaHs} />)}
        </div>
      </div>
    </div>
  );
};
