// Transições entre as cenas, em três estilos que se revezam:
//   faixa   — a faixa dourada varre a tela (com leve giro e desfoque)
//   zoom    — mergulho de câmera com desfoque, clarão e raios de luz
//   chicote — chicotada lateral com riscos de velocidade
// Em todas, uma explosão de brilhos dourados no corte.
//
// <Movimento> mexe na própria cena (entrada e saída); <EfeitoCorte> vai por cima.

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Flash, Varredura } from './efeitos';
import { C, entre, sorte, type Transicao } from './estilo';

const M = 10; // quadros de entrada/saída

function estilo(tipo: Transicao, q: number, entrando: boolean): React.CSSProperties {
  const lado = entrando ? 1 : -1;
  if (tipo === 'zoom') {
    const escala = entrando ? 1 + 0.75 * q : 1 + 0.9 * q;
    return { transform: `scale(${escala}) rotate(${lado * -3 * q}deg)`, filter: `blur(${30 * q}px) brightness(${1 + 1.1 * q})` };
  }
  if (tipo === 'chicote') {
    return { transform: `translateX(${lado * 420 * q}px) scale(${1 + 0.45 * q}) skewX(${-lado * 10 * q}deg)`, filter: `blur(${38 * q}px) brightness(${1 + 0.5 * q})` };
  }
  return { transform: `scale(${1 + 0.14 * q}) rotate(${lado * 2.5 * q}deg)`, filter: `blur(${8 * q}px)` };
}

export const Movimento: React.FC<{ dur: number; entra?: Transicao; sai?: Transicao; children: React.ReactNode }> = ({ dur, entra, sai, children }) => {
  const f = useCurrentFrame();
  let css: React.CSSProperties = {};
  if (entra && f < M) css = estilo(entra, Math.pow(1 - f / M, 2), true);
  else if (sai && f >= dur - M) css = estilo(sai, Math.pow((f - (dur - M)) / M, 2), false);
  return <AbsoluteFill style={{ overflow: 'hidden', ...css }}>{children}</AbsoluteFill>;
};

/** Estrelinhas douradas estourando do centro no quadro `meio`. */
const Brilhos: React.FC<{ meio: number; semente: number }> = ({ meio, semente }) => {
  const f = useCurrentFrame();
  const t = f - meio + 2;
  if (t < 0 || t > 26) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 46 }, (_, i) => {
        const s = semente * 97 + i;
        const ang = sorte(s) * Math.PI * 2;
        const vel = 30 + sorte(s + 1) * 70;
        const d = vel * ((1 - Math.pow(0.86, t)) / 0.14);
        const x = 540 + Math.cos(ang) * d;
        const y = 960 + Math.sin(ang) * d * 1.3;
        const tam = (18 + sorte(s + 2) * 34) * entre(t, 0, 4, 0.3, 1) * entre(t, 12, 26, 1, 0);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - tam / 2,
              top: y - tam / 2,
              width: tam,
              height: tam,
              background: i % 4 === 0 ? '#ffffff' : C.ouro,
              clipPath: 'polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)',
              transform: `rotate(${t * 9 + i * 20}deg)`,
              filter: `drop-shadow(0 0 ${tam / 3}px ${C.ouro})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Raios de luz girando, para o zoom. */
const Raios: React.FC<{ meio: number }> = ({ meio }) => {
  const f = useCurrentFrame();
  const forca = entre(f, meio - 6, meio, 0, 1) * entre(f, meio, meio + 10, 1, 0);
  if (forca <= 0.01) return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity: forca,
        transform: `scale(${1 + (f - meio + 6) * 0.06}) rotate(${(f - meio) * 4}deg)`,
        background: `repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,240,190,.9) 0deg 4deg, transparent 4deg 18deg)`,
        WebkitMaskImage: 'radial-gradient(circle at 50% 50%, #000 10%, transparent 70%)',
        maskImage: 'radial-gradient(circle at 50% 50%, #000 10%, transparent 70%)',
      }}
    />
  );
};

/** Riscos de velocidade atravessando a tela, para o chicote. */
const RiscosVelocidade: React.FC<{ meio: number; semente: number }> = ({ meio, semente }) => {
  const f = useCurrentFrame();
  const t = f - meio;
  if (t < -8 || t > 8) return null;
  const forca = 1 - Math.abs(t) / 8;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: 26 }, (_, i) => {
        const s = semente * 31 + i;
        const y = sorte(s) * 1920;
        const w = 300 + sorte(s + 1) * 900;
        const h = 3 + sorte(s + 2) * 12;
        const x = 1300 - ((t + 8) / 16) * (2600 + w) * (0.8 + sorte(s + 3) * 0.5);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              borderRadius: h,
              background: i % 3 === 0 ? C.ouro : '#ffffff',
              opacity: forca * (0.5 + sorte(s + 4) * 0.5),
              filter: 'blur(2px)',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** O que vai por cima do corte. A Sequence começa 12 quadros antes do corte. */
export const EfeitoCorte: React.FC<{ tipo: Transicao; semente: number }> = ({ tipo, semente }) => {
  const f = useCurrentFrame();
  const meio = 12;
  const pico = (forca: number, ida: number, volta: number) => entre(f, meio - ida, meio, 0, forca) * entre(f, meio, meio + volta, 1, 0);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {tipo === 'faixa' ? <Varredura meio={meio} /> : null}
      {tipo === 'zoom' ? (
        <>
          <Raios meio={meio} />
          <Flash forca={pico(0.8, 3, 5)} />
        </>
      ) : null}
      {tipo === 'chicote' ? (
        <>
          <RiscosVelocidade meio={meio} semente={semente} />
          <Flash forca={pico(0.55, 4, 6)} cor={C.ouroClaro} />
        </>
      ) : null}
      <Brilhos meio={meio} semente={semente} />
    </AbsoluteFill>
  );
};
