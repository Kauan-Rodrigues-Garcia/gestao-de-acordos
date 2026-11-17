// Camadas de película que vão por cima de tudo: grão, vinheta, riscos, a fita
// de 35 mm nas laterais, luz vazada e flash.

import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, entre, F, sorte } from './estilo';
import fotos from './fotos.json';

const DIM = fotos as unknown as Record<string, [number, number]>;

/** Grão de filme: ruído novo a cada 2 quadros. */
export const Grao: React.FC<{ forca?: number }> = ({ forca = 0.14 }) => {
  const f = useCurrentFrame();
  const seed = Math.floor(f / 2) % 24;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity: forca }}>
      <svg width="540" height="960" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <filter id={`grao-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grao-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vinheta: React.FC<{ forca?: number }> = ({ forca = 0.75 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 75% 60% at 50% 48%, transparent 45%, rgba(0,0,0,${forca}) 100%)` }} />
);

/** Riscos finos e pontinhos de poeira, aparecendo de vez em quando. */
export const Riscos: React.FC = () => {
  const f = useCurrentFrame();
  const linhas = [0, 1].map((i) => {
    const r = sorte(Math.floor(f / 3) * 7 + i);
    if (r < 0.55) return null;
    return <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${sorte(f * 3 + i) * 100}%`, width: 1.5, background: 'rgba(255,240,210,0.22)' }} />;
  });
  const poeira = [0, 1, 2].map((i) => {
    const r = sorte(f * 11 + i * 5);
    if (r < 0.8) return null;
    const tam = 3 + sorte(f + i) * 6;
    return <div key={`p${i}`} style={{ position: 'absolute', left: `${sorte(f * 5 + i) * 100}%`, top: `${sorte(f * 9 + i) * 100}%`, width: tam, height: tam * 0.7, borderRadius: '50%', background: 'rgba(20,10,5,0.5)' }} />;
  });
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{linhas}{poeira}</AbsoluteFill>;
};

/** Fita de 35 mm correndo nas duas laterais. */
export const FitaLateral: React.FC<{ velocidade?: number; opacidade?: number }> = ({ velocidade = 3, opacidade = 1 }) => {
  const f = useCurrentFrame();
  const passo = 96;
  const desloc = (f * velocidade) % passo;
  const lado = (esq: boolean) => (
    <div style={{ position: 'absolute', top: 0, bottom: 0, [esq ? 'left' : 'right']: 0, width: 64, background: '#0a0607', overflow: 'hidden', boxShadow: esq ? '6px 0 18px rgba(0,0,0,.5)' : '-6px 0 18px rgba(0,0,0,.5)' }}>
      {Array.from({ length: 23 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: 18, top: i * passo - passo + desloc, width: 28, height: 40, borderRadius: 7, background: 'rgba(255,236,200,0.85)' }} />
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: opacidade }}>
      {lado(true)}
      {lado(false)}
    </AbsoluteFill>
  );
};

/** Luz vazada de película: manchas quentes que passam pela tela. */
export const LuzVazada: React.FC<{ forca: number; semente?: number }> = ({ forca, semente = 0 }) => {
  const f = useCurrentFrame();
  if (forca <= 0.001) return null;
  const x = 20 + 60 * sorte(semente) + Math.sin((f + semente * 13) / 18) * 18;
  const y = 30 + 40 * sorte(semente + 1) + Math.cos((f + semente * 7) / 23) * 14;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity: forca,
        background: `radial-gradient(circle at ${x}% ${y}%, rgba(255,150,60,.95) 0%, rgba(255,80,90,.55) 22%, transparent 55%), radial-gradient(circle at ${100 - x}% ${100 - y}%, rgba(255,210,120,.7) 0%, transparent 40%)`,
      }}
    />
  );
};

export const Flash: React.FC<{ forca: number; cor?: string }> = ({ forca, cor = '#fff8ec' }) =>
  forca > 0.001 ? <AbsoluteFill style={{ pointerEvents: 'none', background: cor, opacity: forca }} /> : null;

/** Fundo com a própria foto ampliada e desfocada (sem cortar ninguém na foto principal). */
export const FundoFoto: React.FC<{ foto: string; cor: string; escala?: number }> = ({ foto, cor, escala = 1.15 }) => (
  <AbsoluteFill style={{ background: C.noite, overflow: 'hidden' }}>
    <Img src={staticFile(foto)} style={{ position: 'absolute', inset: -80, width: 'calc(100% + 160px)', height: 'calc(100% + 160px)', objectFit: 'cover', filter: 'blur(38px) brightness(0.42) saturate(1.3)', transform: `scale(${escala})` }} />
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${cor}33 0%, transparent 35%, transparent 65%, ${cor}2a 100%)` }} />
  </AbsoluteFill>
);

export function medida(foto: string, maxL: number, maxA: number) {
  const [w, h] = DIM[foto] ?? [3, 4];
  const k = Math.min(maxL / w, maxA / h);
  return { l: w * k, a: h * k };
}

/**
 * Polaroid com a foto INTEIRA (proporção original). `revela` de 0 a 1 faz a
 * foto «revelar», do branco leitoso até a cor.
 */
export const Polaroid: React.FC<{
  foto: string;
  maxL: number;
  maxA: number;
  legenda?: string;
  tamLegenda?: number;
  /** 0 → nada escrito, 1 → legenda inteira (efeito de escrever à mão). */
  escrita?: number;
  revela?: number;
  fita?: boolean;
  corFita?: string;
  style?: React.CSSProperties;
}> = ({ foto, maxL, maxA, legenda, tamLegenda = 80, escrita = 1, revela = 1, fita = true, corFita = C.ouro, style }) => {
  const { l, a } = medida(foto, maxL, maxA);
  const borda = Math.max(10, l * 0.045);
  const baixo = legenda ? Math.max(borda * 2.4, tamLegenda * 1.45) : borda * 2.6;
  return (
    <div
      style={{
        position: 'relative',
        width: l + borda * 2,
        padding: borda,
        paddingBottom: baixo,
        background: C.creme,
        borderRadius: 4,
        boxShadow: '0 2px 3px rgba(0,0,0,.25), 0 22px 50px rgba(0,0,0,.45), 0 60px 120px rgba(0,0,0,.35)',
        ...style,
      }}
    >
      <div style={{ position: 'relative', width: l, height: a, overflow: 'hidden', background: '#eee' }}>
        <Img
          src={staticFile(foto)}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            filter: `brightness(${1 + (1 - revela) * 0.9}) saturate(${0.3 + revela * 0.75}) sepia(${(1 - revela) * 0.5}) contrast(${0.75 + revela * 0.27})`,
          }}
        />
        {/* brilho de papel fotográfico */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,.16) 0%, transparent 35%, transparent 70%, rgba(255,255,255,.07) 100%)' }} />
      </div>
      {legenda ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: baixo,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: F.mao,
            fontWeight: 700,
            fontSize: tamLegenda,
            color: C.tinta,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ display: 'inline-block', padding: '0 0.15em', clipPath: `inset(-20% ${(1 - escrita) * 100}% -20% 0)` }}>{legenda}</span>
        </div>
      ) : null}
      {fita ? (
        <div
          style={{
            position: 'absolute',
            top: -borda * 1.1,
            left: '50%',
            width: Math.max(70, l * 0.32),
            height: borda * 2.6,
            transform: 'translateX(-50%) rotate(-3deg)',
            background: `${corFita}b8`,
            boxShadow: '0 2px 6px rgba(0,0,0,.2)',
          }}
        />
      ) : null}
    </div>
  );
};
