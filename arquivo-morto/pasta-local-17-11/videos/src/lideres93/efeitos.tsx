// Peças que se repetem: o cupom dourado, confete, flash, vinheta, poeira de
// ouro e a faixa dourada que passa entre uma cena e outra.

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, entre, F, OURO_GRAD, sorte } from './estilo';

/** O cupom: bilhete dourado com recortes nas laterais. Desenho próprio, sem a marca da loja. */
export const Cupom: React.FC<{ largura?: number; brilho?: number; style?: React.CSSProperties }> = ({ largura = 760, brilho = 0, style }) => {
  const a = largura * 0.4;
  const furo = a * 0.16;
  const mascara = `radial-gradient(circle at 0 50%, transparent ${furo}px, #000 ${furo + 1}px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent ${furo}px, #000 ${furo + 1}px) right / 51% 100% no-repeat`;
  return (
    <div style={{ position: 'relative', width: largura, height: a, filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.55))', ...style }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: a * 0.08,
          background: OURO_GRAD,
          WebkitMask: mascara,
          mask: mascara,
          overflow: 'hidden',
        }}
      >
        {/* moldura interna */}
        <div style={{ position: 'absolute', inset: a * 0.07, border: `${Math.max(2, a * 0.012)}px solid rgba(120,70,0,.45)`, borderRadius: a * 0.05 }} />
        {/* picote */}
        <div style={{ position: 'absolute', top: a * 0.12, bottom: a * 0.12, left: '64%', borderLeft: `${Math.max(2, a * 0.014)}px dashed rgba(110,60,0,.55)` }} />
        <div style={{ position: 'absolute', left: '9%', top: 0, bottom: 0, width: '53%', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#3b2200' }}>
          <div style={{ fontFamily: F.texto, fontWeight: 800, fontSize: a * 0.12, letterSpacing: a * 0.02 }}>VALE COMPRA</div>
          <div style={{ fontFamily: F.titulo, fontSize: a * 0.29, lineHeight: 1, letterSpacing: a * 0.004 }}>BANDEIRANTE</div>
          <div style={{ fontFamily: F.texto, fontWeight: 600, fontSize: a * 0.085, marginTop: a * 0.04, opacity: 0.8 }}>líder que bateu o desafio</div>
        </div>
        <div style={{ position: 'absolute', left: '66%', right: '6%', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#3b2200' }}>
          <div style={{ fontFamily: F.texto, fontWeight: 800, fontSize: a * 0.12 }}>R$</div>
          <div style={{ fontFamily: F.titulo, fontSize: a * 0.42, lineHeight: 0.95 }}>150</div>
        </div>
        {/* reflexo correndo */}
        <div
          style={{
            position: 'absolute',
            top: -a,
            bottom: -a,
            width: a * 0.5,
            left: `${-30 + brilho * 160}%`,
            transform: 'rotate(22deg)',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent)',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    </div>
  );
};

/** Confete saindo de dois canhões nos cantos de baixo, a partir de `ini`. */
export const Confete: React.FC<{ ini: number; quantos?: number; semente?: number; chuva?: boolean }> = ({ ini, quantos = 110, semente = 1, chuva = false }) => {
  const f = useCurrentFrame();
  const t = f - ini;
  if (t < 0 || t > 110) return null;
  const cores = [C.ouro, '#ffffff', C.limao, C.azulClaro, '#ff5a7a', C.ouroClaro];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: quantos }, (_, i) => {
        const s = semente * 1000 + i;
        const esq = i % 2 === 0;
        let x: number;
        let y: number;
        if (chuva) {
          x = sorte(s) * 1080 + Math.sin((t + i * 7) / 9) * 30;
          y = -60 + (t - sorte(s + 9) * 40) * (9 + sorte(s + 1) * 6);
        } else {
          // sai rápido, o ar segura, e cai devagar balançando
          const ang = 0.1 + sorte(s) * 0.55;
          const vel = 46 + sorte(s + 1) * 42;
          const vx = (esq ? 1 : -1) * Math.sin(ang) * vel;
          const vy = -Math.cos(ang) * vel;
          const arrasto = (1 - Math.pow(0.93, t)) / 0.07;
          x = (esq ? 40 : 1040) + vx * arrasto + Math.sin((t + i) / 6) * 14;
          y = 1900 + vy * arrasto + (5 + sorte(s + 5) * 4) * t;
        }
        const giro = (t * (8 + sorte(s + 2) * 14) + i * 40) % 360;
        const w = 12 + sorte(s + 3) * 12;
        const h = w * (0.45 + sorte(s + 4) * 0.3);
        const some = entre(t, 80, 110, 1, 0);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              background: cores[i % cores.length],
              borderRadius: i % 5 === 0 ? '50%' : 2,
              opacity: some,
              transform: `rotate(${giro}deg) scaleY(${Math.cos((t + i) / 3)})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const Flash: React.FC<{ forca: number; cor?: string }> = ({ forca, cor = '#fffaf0' }) =>
  forca > 0.001 ? <AbsoluteFill style={{ pointerEvents: 'none', background: cor, opacity: forca }} /> : null;

export const Vinheta: React.FC<{ forca?: number }> = ({ forca = 0.6 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 80% 62% at 50% 50%, transparent 50%, rgba(0,0,0,${forca}) 100%)` }} />
);

/** Fundo da abertura e do final: azul-noite com brilho e poeira dourada subindo. */
export const FundoNoite: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 60% at 50% 45%, ${C.azul} 0%, ${C.noite} 70%)`, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `conic-gradient(from ${f * 0.4}deg at 50% 42%, transparent 0deg, rgba(255,201,60,.07) 20deg, transparent 40deg, transparent 90deg, rgba(255,201,60,.06) 110deg, transparent 130deg, transparent 180deg, rgba(255,201,60,.07) 200deg, transparent 220deg, transparent 270deg, rgba(255,201,60,.06) 290deg, transparent 310deg)`,
        }}
      />
      {Array.from({ length: 46 }, (_, i) => {
        const vel = 1 + sorte(i + 5) * 2.4;
        const y = 1980 - ((f * vel + sorte(i) * 2000) % 2100);
        const x = sorte(i + 1) * 1080 + Math.sin((f + i * 20) / 30) * 20;
        const tam = 3 + sorte(i + 2) * 7;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: tam, height: tam, borderRadius: '50%', background: C.ouro, opacity: 0.25 + sorte(i + 3) * 0.5, boxShadow: `0 0 ${tam * 3}px ${C.ouro}` }} />;
      })}
    </AbsoluteFill>
  );
};

/** Faixa dourada que varre a tela; cobre tudo no quadro `meio` (onde fica o corte). */
export const Varredura: React.FC<{ meio: number; meia?: number }> = ({ meio, meia = 9 }) => {
  const f = useCurrentFrame();
  if (f < meio - meia || f > meio + meia) return null;
  // rápida na entrada e na saída, devagar no meio (quando cobre a tela)
  const u = ((f - (meio - meia)) / meia) - 1;
  const base = 540 - Math.sign(u) * Math.pow(Math.abs(u), 1.35) * 2900;
  const faixa = (desloc: number, cor: string, largura: number) => {
    const cx = base + desloc;
    return (
      <div
        style={{
          position: 'absolute',
          top: -200,
          bottom: -200,
          left: cx - largura / 2,
          width: largura,
          transform: 'skewX(-14deg)',
          background: cor,
          boxShadow: '0 0 60px rgba(0,0,0,.45)',
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {faixa(-1450, C.azulClaro, 260)}
      {faixa(0, OURO_GRAD, 2300)}
      {faixa(1420, C.ouroClaro, 120)}
      {/* marca d'água: o ✓ do desafio (antes era «93%») */}
      <svg width={300} height={300} viewBox="0 0 100 100" style={{ position: 'absolute', left: base - 150, top: 810 }}>
        <polyline points="20,53 41,74 80,29" fill="none" stroke="rgba(90,50,0,.28)" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};
