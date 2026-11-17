// Abertura (20 batidas):
//   0–6   contagem de película 3, 2, 1
//   6–8   «Bookplay + Cofen apresentam»
//   8–16  a cortina abre no letreiro «Entre Metas e Risadas»
//   16–20 «Estrelando…» com rostos piscando no tempo da música

import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { TODAS } from './elenco';
import { ACELERA, C, entre, F, mola, sorte, VAI_VOLTA } from './estilo';
import { Flash, Grao, LuzVazada, Riscos, Vinheta } from './efeitos';
import { Veludo } from './Claquete';
import { B } from './tempo';

const Contagem: React.FC<{ f: number }> = ({ f }) => {
  const num = 3 - Math.floor(f / (B * 2));
  const t = (f % (B * 2)) / (B * 2);
  const brilho = 0.92 + sorte(f) * 0.12;
  return (
    <AbsoluteFill style={{ background: '#b8ae9c', filter: `brightness(${brilho}) sepia(.35)` }}>
      <AbsoluteFill style={{ background: `conic-gradient(from 0deg at 50% 50%, rgba(40,30,20,.55) 0deg ${t * 360}deg, transparent ${t * 360}deg 360deg)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 4, background: '#1b1510', opacity: 0.8 }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 4, background: '#1b1510', opacity: 0.8 }} />
      {[820, 680].map((d, i) => (
        <div key={d} style={{ position: 'absolute', left: 540 - d / 2, top: 960 - d / 2, width: d, height: d, borderRadius: '50%', border: `${i ? 6 : 10}px solid ${i ? '#1b1510' : '#f2ece0'}` }} />
      ))}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.letreiro, fontSize: 560, color: '#1b1510', lineHeight: 1 }}>{Math.max(1, num)}</div>
      <Vinheta forca={0.9} />
    </AbsoluteFill>
  );
};

const Apresentam: React.FC<{ f: number }> = ({ f }) => {
  const a = entre(f, 0, 12, 0, 1) * entre(f, B * 2 - 6, B * 2, 1, 0);
  return (
    <AbsoluteFill style={{ background: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 50% 30% at 50% 50%, rgba(255,210,140,.18), transparent 70%)', opacity: a }} />
      <div style={{ textAlign: 'center', opacity: a, transform: `scale(${0.96 + f * 0.002})` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 84, letterSpacing: 16, color: C.ouro }}>BOOKPLAY + COFEN</div>
        <div style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 72, color: C.creme, marginTop: 6 }}>apresentam</div>
      </div>
    </AbsoluteFill>
  );
};

/** Letreiro com lâmpadas em volta acendendo em fila. */
const Letreiro: React.FC<{ f: number }> = ({ f }) => {
  const L = 940;
  const A = 360;
  const lamps: React.ReactNode[] = [];
  const passo = 52;
  const porL = Math.floor(L / passo);
  const porA = Math.floor(A / passo);
  const pontos: [number, number][] = [];
  for (let i = 0; i <= porL; i++) pontos.push([(i * L) / porL, 0]);
  for (let i = 1; i <= porA; i++) pontos.push([L, (i * A) / porA]);
  for (let i = porL - 1; i >= 0; i--) pontos.push([(i * L) / porL, A]);
  for (let i = porA - 1; i >= 1; i--) pontos.push([0, (i * A) / porA]);
  const chase = Math.floor(f / 3);
  pontos.forEach(([x, y], i) => {
    const acesa = (i + chase) % 3 === 0;
    lamps.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x - 11,
          top: y - 11,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: acesa ? '#fff6d6' : '#b9822e',
          boxShadow: acesa ? '0 0 14px 5px rgba(255,214,120,.9)' : 'none',
        }}
      />,
    );
  });
  const palavras = 'ENTRE METAS'.split('');
  return (
    <div style={{ position: 'relative', width: L, height: A, borderRadius: 26, background: 'linear-gradient(180deg, #2a0b10, #120406)', boxShadow: '0 0 0 10px #c9952e, 0 0 0 16px #5c3a0c, 0 30px 90px rgba(0,0,0,.7)' }}>
      {lamps}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {palavras.map((ch, i) => {
          const q = mola(f, 10 + i * 2, { stiffness: 220, damping: 12 });
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: ch === ' ' ? 40 : undefined,
                fontFamily: F.letreiro,
                fontSize: 162,
                lineHeight: 1,
                color: C.ouro,
                transform: `scale(${q}) translateY(${(1 - q) * 40}px)`,
                textShadow: '0 0 24px rgba(255,190,70,.75), 0 5px 0 #7a4a0e',
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Titulo: React.FC<{ f: number }> = ({ f }) => {
  const abre = entre(f, 0, 30, 0, 1, VAI_VOLTA);
  const risadas = entre(f, 28, 46, 0, 1);
  const risadasMola = mola(f, 28, { stiffness: 140, damping: 11 });
  const marca = entre(f, 46, 58, 0, 1);
  const claq = mola(f, 56, { stiffness: 200, damping: 10 });
  const glitter = Array.from({ length: 40 }, (_, i) => {
    const vel = 3 + sorte(i) * 4;
    const y = ((sorte(i + 50) * 1920 + f * vel) % 2000) - 40;
    const x = sorte(i + 99) * 1080 + Math.sin((f + i * 20) / 20) * 20;
    return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 8, height: 8, background: C.ouro, opacity: 0.4 + sorte(i + f) * 0.6, transform: `rotate(${f * 6 + i * 30}deg)`, boxShadow: '0 0 8px rgba(255,200,80,.8)' }} />;
  });
  const cortina = (esq: boolean) => (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 600,
        [esq ? 'left' : 'right']: 0,
        transform: `translateX(${(esq ? -1 : 1) * abre * 620}px) skewX(${(esq ? -1 : 1) * abre * 4}deg)`,
        background: 'repeating-linear-gradient(90deg, #4a0610 0px, #a3162b 40px, #cf2a40 56px, #7a0d1c 86px, #4a0610 116px)',
        boxShadow: esq ? '20px 0 50px rgba(0,0,0,.6)' : '-20px 0 50px rgba(0,0,0,.6)',
      }}
    >
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.4), transparent 30%, transparent 75%, rgba(0,0,0,.6))' }} />
    </div>
  );
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#140306' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 42%, #5a0d18 0%, #1a0407 70%)' }} />
      {/* canhões de luz */}
      {[-1, 1].map((lado) => (
        <div
          key={lado}
          style={{
            position: 'absolute',
            left: 540 + lado * 380,
            top: -200,
            width: 520,
            height: 2400,
            transformOrigin: '50% 0',
            transform: `translateX(-50%) rotate(${lado * (18 + Math.sin(f / 30) * 10)}deg)`,
            background: 'linear-gradient(180deg, rgba(255,230,170,.32), rgba(255,230,170,0) 75%)',
            clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)',
            mixBlendMode: 'screen',
          }}
        />
      ))}
      {glitter}
      <div style={{ position: 'absolute', left: 540, top: 720, transform: `translate(-50%,-50%) scale(${0.92 + abre * 0.08})` }}>
        <Letreiro f={f} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 930,
          textAlign: 'center',
          fontFamily: F.script,
          fontSize: 190,
          color: '#ffb3c7',
          textShadow: '0 0 30px rgba(255,120,160,.65), 0 6px 0 #7a1838',
          clipPath: `inset(-40% ${(1 - risadas) * 100}% -40% 0)`,
          transform: `rotate(-5deg) scale(${0.7 + risadasMola * 0.3})`,
        }}
      >
        e Risadas
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1300, textAlign: 'center', opacity: marca, transform: `translateY(${(1 - marca) * 30}px)` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 70, letterSpacing: 12, color: C.creme }}>BOOKPLAY + COFEN</div>
        <div style={{ fontFamily: F.letreiro, fontSize: 150, letterSpacing: 18, color: C.ouro, lineHeight: 1, textShadow: '0 0 30px rgba(255,190,70,.6)' }}>2026</div>
      </div>
      <div style={{ position: 'absolute', left: 540, top: 1680, fontSize: 170, transform: `translate(-50%,-50%) scale(${claq}) rotate(${(1 - claq) * -40 + Math.sin(f / 6) * 4}deg)` }}>🎬</div>
      {cortina(true)}
      {cortina(false)}
      {/* bandô da cortina */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110, background: 'repeating-linear-gradient(90deg, #6a0a18 0 60px, #9e1428 60px 120px)', borderBottom: '8px solid #c9952e', boxShadow: '0 12px 30px rgba(0,0,0,.6)' }} />
      <LuzVazada forca={entre(f, 0, 30, 0.6, 0.18)} semente={2} />
    </AbsoluteFill>
  );
};

// Oito rostos piscando, um por meia batida, espalhados pelos setores.
const PISCADAS = [2, 9, 17, 20, 26, 33, 34, 41].map((i) => TODAS[i]);

const Estrelando: React.FC<{ f: number }> = ({ f }) => {
  const meia = B / 2;
  const i = Math.min(PISCADAS.length - 1, Math.floor(f / meia));
  const t = (f - i * meia) / meia;
  const p = PISCADAS[i];
  const texto = mola(f, 0, { stiffness: 200, damping: 12 });
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Img
        src={staticFile(p.foto)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 35%', transform: `scale(${1.25 - t * 0.12}) rotate(${(i % 2 ? 1 : -1) * 3}deg)`, filter: 'contrast(1.1) saturate(1.15)' }}
      />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,.75), ${p.setor.cor}22 28%, transparent 45%, transparent 70%, rgba(0,0,0,.75))` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 130, textAlign: 'center', transform: `scale(${texto})` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 168, letterSpacing: 10, color: C.ouro, WebkitTextStroke: '3px #2a0b10', textShadow: '0 10px 40px rgba(0,0,0,.8)' }}>ESTRELANDO</div>
        <div style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 64, color: C.creme, textShadow: '0 4px 18px rgba(0,0,0,.9)' }}>o time inteiro</div>
      </div>
      <div style={{ position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center', fontFamily: F.mao, fontWeight: 700, fontSize: 70, color: '#fff', textShadow: '0 3px 14px rgba(0,0,0,.9)' }}>
        {p.nome} · {p.setor.nome}
      </div>
      <Flash forca={entre(t, 0, 0.35, 0.55, 0)} />
    </AbsoluteFill>
  );
};

export const Abertura: React.FC = () => {
  const f = useCurrentFrame();
  let cena: React.ReactNode;
  if (f < B * 6) cena = <Contagem f={f} />;
  else if (f < B * 8) cena = <Apresentam f={f - B * 6} />;
  else if (f < B * 16) cena = <Titulo f={f - B * 8} />;
  else cena = <Estrelando f={f - B * 16} />;
  const fimTitulo = f >= B * 16 - 6 && f < B * 16 ? entre(f, B * 16 - 6, B * 16, 0, 1, ACELERA) : 0;
  return (
    <AbsoluteFill>
      {cena}
      <Riscos />
      <Grao forca={f < B * 6 ? 0.3 : 0.15} />
      {f >= B * 8 ? <Vinheta forca={0.55} /> : null}
      <Flash forca={Math.max(entre(f, B * 6 - 4, B * 6, 0, 1) * (f < B * 6 ? 1 : 0), f >= B * 8 ? entre(f, B * 8, B * 8 + 10, 1, 0) : 0, fimTitulo)} />
    </AbsoluteFill>
  );
};

