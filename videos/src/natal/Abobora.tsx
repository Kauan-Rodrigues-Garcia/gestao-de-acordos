// A Caça à Abóbora (05 a 07/10/2026), como era: a abóbora de 34 px num canto
// livre, o halo de vela, o «espiar» de vez em quando, o mouse em cima, o clique
// que a pega com o estouro, e a faixa roxa com o nome de quem achou, logo
// abaixo da barra de cima. Copiado do commit 826b77d2 (`DesenhoAbobora.tsx` e
// `caca.css`, salvo aqui em `abobora-original.css`); só o que lá era animação
// CSS aqui é comandado pelo quadro.

import { useId } from 'react';
import { useCurrentFrame } from 'remotion';
import { loadFont as fonteRye } from '@remotion/google-fonts/Rye';
import { entre, ms } from '../movimento';
import './abobora-original.css';

fonteRye('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] });

/** O desenho original, sem mudar um traço (a vela vem do quadro, por `luz`). */
export function DesenhoAbobora({ className, style, luz = 1 }: { className?: string; style?: React.CSSProperties; luz?: number }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `cacab-${n}-${id}`;
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} aria-hidden="true">
      <defs>
        <radialGradient id={g('frente')} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffc46b" /><stop offset=".45" stopColor="#f7902a" /><stop offset="1" stopColor="#c4570e" />
        </radialGradient>
        <radialGradient id={g('lado')} cx="50%" cy="35%" r="80%">
          <stop offset="0" stopColor="#f39434" /><stop offset=".6" stopColor="#d96a16" /><stop offset="1" stopColor="#9c3f08" />
        </radialGradient>
        <radialGradient id={g('fundo')} cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#d9721c" /><stop offset="1" stopColor="#7d3006" />
        </radialGradient>
        <linearGradient id={g('talo')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a9a4a" /><stop offset=".55" stopColor="#5b6b2a" /><stop offset="1" stopColor="#3a4418" />
        </linearGradient>
        <linearGradient id={g('folha')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fb04a" /><stop offset="1" stopColor="#3f6b22" />
        </linearGradient>
        <radialGradient id={g('luz')} cx="50%" cy="55%" r="65%">
          <stop offset="0" stopColor="#fff6c2" /><stop offset=".45" stopColor="#ffd25a" /><stop offset="1" stopColor="#ff8a1c" />
        </radialGradient>
        <radialGradient id={g('sombra')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#000" stopOpacity=".32" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="58.5" rx="21" ry="3.6" fill={`url(#${g('sombra')})`} />
      <ellipse cx="14.5" cy="37" rx="10.5" ry="16" fill={`url(#${g('fundo')})`} />
      <ellipse cx="49.5" cy="37" rx="10.5" ry="16" fill={`url(#${g('fundo')})`} />
      <ellipse cx="20.5" cy="37.5" rx="11.5" ry="18" fill={`url(#${g('lado')})`} />
      <ellipse cx="43.5" cy="37.5" rx="11.5" ry="18" fill={`url(#${g('lado')})`} />
      <ellipse cx="32" cy="38" rx="13.5" ry="19.5" fill={`url(#${g('frente')})`} />
      <path d="M23.5 22.5 C19.5 31 19.5 45 23.5 54" stroke="#8f3a07" strokeOpacity=".45" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <path d="M40.5 22.5 C44.5 31 44.5 45 40.5 54" stroke="#8f3a07" strokeOpacity=".45" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <ellipse cx="25.5" cy="26" rx="4.2" ry="7.5" fill="#fff" opacity=".26" transform="rotate(-18 25.5 26)" />
      <ellipse cx="12.5" cy="31" rx="1.6" ry="4.5" fill="#fff" opacity=".14" transform="rotate(-10 12.5 31)" />
      <path d="M29.6 20.5 C29.4 15.5 30.2 11.2 33.6 8.2 L37.2 10.1 C34.8 12.6 34.2 16 34.6 20.6 C33 21.4 31.2 21.4 29.6 20.5 Z" fill={`url(#${g('talo')})`} />
      <ellipse cx="35.4" cy="9.1" rx="2.1" ry="1.2" transform="rotate(28 35.4 9.1)" fill="#c9b27a" />
      <path d="M34.8 15.5 C39.5 10.8 46.5 10.6 50 13.6 C46.8 18.6 39.6 19.6 34.8 15.5 Z" fill={`url(#${g('folha')})`} />
      <path d="M36.2 15.4 C40.2 14.6 44.4 14 48.2 13.8" stroke="#2f5218" strokeWidth=".7" fill="none" strokeLinecap="round" />
      <path d="M29.8 17.6 C26.6 16.8 24.6 14.6 25.6 12.4 C26.6 10.4 29.4 11 29 13.2" stroke="#55702a" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <g style={{ opacity: luz }}>
        <path d="M21.5 34.2 L25.4 28.2 L29.2 34.2 Z" fill="#4a1c03" />
        <path d="M34.8 34.2 L38.6 28.2 L42.5 34.2 Z" fill="#4a1c03" />
        <path d="M22.4 33.6 L25.4 29.2 L28.3 33.6 Z" fill={`url(#${g('luz')})`} />
        <path d="M35.7 33.6 L38.6 29.2 L41.6 33.6 Z" fill={`url(#${g('luz')})`} />
        <path d="M30.6 38.8 L32 36.4 L33.4 38.8 Z" fill="#4a1c03" />
        <path d="M19.8 41.2 C24.5 44 39.5 44 44.2 41.2 C43.4 47.6 38.6 51.6 32 51.6 C25.4 51.6 20.6 47.6 19.8 41.2 Z" fill="#4a1c03" />
        <path d="M21.2 42.6 C25.6 44.8 38.4 44.8 42.8 42.6 C41.6 47.4 37.4 50.4 32 50.4 C26.6 50.4 22.4 47.4 21.2 42.6 Z" fill={`url(#${g('luz')})`} />
        <path d="M26.2 44.3 L29.6 44.8 L29.4 47.2 C28.6 48 27 48 26.4 47.2 Z" fill="#e5801f" />
        <path d="M34.4 44.8 L37.8 44.3 L37.6 47.2 C37 48 35.4 48 34.6 47.2 Z" fill="#e5801f" />
        <path d="M30.6 50.3 L30.8 48.4 C31.4 47.8 32.6 47.8 33.2 48.4 L33.4 50.3 Z" fill="#e5801f" />
      </g>
    </svg>
  );
}

/** Interpolação por chaves, como um @keyframes: [instante 0–1, valor]. */
function chaves(t: number, k: [number, number][]) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [a, va] = k[i - 1];
      const [b, vb] = k[i];
      const u = (t - a) / (b - a);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; // ease-in-out
      return va + (vb - va) * e;
    }
  }
  return k[k.length - 1][1];
}
const FPS = 60;
/** `cacab-tremula`: a vela, 2,6 s em volta. */
export const vela = (f: number) => chaves(((f / FPS) % 2.6) / 2.6, [[0, 1], [0.12, 0.86], [0.16, 0.97], [0.38, 0.9], [0.44, 1], [0.71, 0.84], [0.76, 0.96], [1, 1]]);

export type CenaAbobora = { x: number; y: number; chega: number; mouseEmCima: number; clique: number };

/** A abóbora no canto: 40 px de botão, 34 de desenho (padding 3). */
export const AboboraNaTela: React.FC<{ c: CenaAbobora }> = ({ c }) => {
  const f = useCurrentFrame();
  if (f < c.chega || f > c.clique + ms(400)) return null;
  // `cacab-chega`: .7s cubic-bezier(.2,.9,.3,1.35) — a sobra do 1,35 vem da mola.
  const p = Math.min(1, (f - c.chega) / ms(700));
  const sobra = 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.12;
  const chega = { op: Math.min(1, p * 1.6), y: (1 - sobra) * 10, esc: 0.3 + 0.7 * sobra };
  // `cacab-espia`: 4,6 s em volta, começando 1,2 s depois.
  const te = (f - c.chega) / FPS - 1.2;
  const giro = te < 0 ? 0 : chaves((te % 4.6) / 4.6, [[0, 0], [0.72, 0], [0.78, -10], [0.85, 8], [0.91, -4], [0.96, 2], [1, 0]]);
  // `cacab-halo`: 3,2 s, de .55/.92 a 1/1.08.
  const th = (((f - c.chega) / FPS) % 3.2) / 3.2;
  const halo = chaves(th, [[0, 0], [0.5, 1], [1, 0]]);
  // Mouse em cima: `scale(1.16) rotate(-5deg)` com o brilho, transição de .18 s.
  const hover = entre(f, c.mouseEmCima, c.mouseEmCima + ms(180), 0, 1);
  // `cacab-pega`: .38s ease-in — cresce, gira e some.
  const tp = f < c.clique ? -1 : (f - c.clique) / ms(380);
  const pega = tp < 0 ? null : tp < 0.4
    ? { esc: 1 + 0.35 * (tp / 0.4), rot: -8 * (tp / 0.4), op: 1 }
    : { esc: 1.35 - 1.15 * ((tp - 0.4) / 0.6), rot: -8 + 38 * ((tp - 0.4) / 0.6), op: 1 - (tp - 0.4) / 0.6 };
  return (
    <div style={{
      position: 'absolute', left: c.x, top: c.y, width: 40, height: 40, padding: 3,
      opacity: pega ? pega.op : chega.op,
      transform: pega ? `scale(${pega.esc}) rotate(${pega.rot}deg)` : `translateY(${chega.y}px) scale(${chega.esc})`,
    }}>
      <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', transformOrigin: '50% 92%', transform: `rotate(${giro}deg) translateY(${giro < -5 ? -1 : 0}px)` }}>
        <span style={{
          position: 'absolute', inset: -6, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(closest-side, rgb(255 170 60 / .45), rgb(255 140 40 / .12) 60%, transparent)',
          opacity: 0.55 + 0.45 * halo, transform: `scale(${0.92 + 0.16 * halo})`,
        }} />
        <DesenhoAbobora luz={vela(f)} style={{
          position: 'relative', display: 'block', width: '100%', height: '100%',
          transform: `scale(${1 + 0.16 * hover}) rotate(${-5 * hover}deg)`,
          filter: hover > 0
            ? `drop-shadow(0 0 ${7 * hover}px rgb(255 160 40 / ${0.8 * hover})) drop-shadow(0 2px 2px rgb(60 20 0 / .3))`
            : 'drop-shadow(0 2px 2px rgb(60 20 0 / .28))',
        }} />
      </span>
    </div>
  );
};

/** O estouro do clique: 16 bolinhas, uma em cada três dourada (`cacab-voa`, .75 s). */
export const Estouro: React.FC<{ x: number; y: number; em: number }> = ({ x, y, em }) => {
  const f = useCurrentFrame();
  if (f < em || f > em + ms(800)) return null;
  const p = Math.min(1, (f - em) / ms(750));
  const e = 1 - Math.pow(1 - p, 2.6); // cubic-bezier(.2,.7,.3,1)
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
      {Array.from({ length: 16 }, (_, i) => {
        // O app sorteia um pouco o ângulo e a distância; aqui com sorteio fixo.
        const ang = (i / 16) * Math.PI * 2 + (((i * 37) % 10) / 10) * 0.3;
        const d = 26 + (((i * 53) % 30));
        const brilho = i % 3 === 0;
        const tam = brilho ? 6 : 8;
        return (
          <i key={i} style={{
            position: 'absolute', left: -tam / 2, top: -tam / 2, width: tam, height: tam, borderRadius: '50%',
            background: brilho ? '#ffd65a' : '#f7902a', boxShadow: brilho ? '0 0 6px #ffd65a' : undefined,
            transform: `translate(${Math.cos(ang) * d * e}px, ${Math.sin(ang) * d * e}px) scale(${1 - 0.75 * e})`, opacity: 1 - e,
          }} />
        );
      })}
    </div>
  );
};

/** A faixa: 36 px, roxa, a abóbora, o nome em Rye, o tempo e o «a mais rápida do dia». */
export const FaixaAbobora: React.FC<{ abre: number; quem: string; tempo: string; rapida: boolean }> = ({ abre, quem, tempo, rapida }) => {
  const f = useCurrentFrame();
  const correu = ((f - abre) / FPS) * 70; // VELOCIDADE do app, px/s
  return (
    <div className="cacab-faixa">
      <div style={{ position: 'absolute', inset: '0 auto 0 0', display: 'flex', width: 'max-content', transform: `translateX(${560 - correu}px)` }}>
        {[0, 1].map(k => (
          <span key={k} className="cacab-faixa-recado">
            <DesenhoAbobora className="cacab-faixa-abobora" luz={vela(f + k * 40)} />
            <span className="cacab-faixa-nome">{quem}</span>
            <span>achou a abóbora em</span>
            <span className="cacab-faixa-tempo">{tempo}</span>
            {rapida && <span className="cacab-faixa-rapida">⚡ a mais rápida do dia!</span>}
            <span className="cacab-faixa-estrela" aria-hidden="true">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
};
