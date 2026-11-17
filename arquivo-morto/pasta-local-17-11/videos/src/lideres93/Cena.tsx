// Uma entrega: o vídeo do líder em tela cheia; no instante em que o cupom chega
// na mão (`ganhou`, sempre numa batida) vem flash, soco de câmera, confete,
// o grito «GANHOU!» e o cupom dourado.

import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Confete, Cupom, Flash, Vinheta } from './efeitos';
import { ACELERA, C, type Cena as TCena, dois, entre, F, FPS, LINHA, mola, sorte } from './estilo';

const GRITOS = ['GANHOU!', 'MERECIDO!', 'TÁ NA MÃO!', 'É SEU!'];

export const Cena: React.FC<{ cena: TCena }> = ({ cena }) => {
  const f = useCurrentFrame();
  const g = cena.ganhou;
  const dur = cena.dur;

  // câmera: empurrão lento + soco no ganhou + tremidinha
  const soco = f >= g ? mola(f, g, { stiffness: 260, damping: 11 }) : 0;
  const punch = f >= g ? (1 - soco) * 0.16 + 0.04 * entre(f, g, g + 40, 1, 0) : 0;
  const escala = 1.02 + 0.05 * (f / dur) + punch;
  const treme = f >= g && f < g + 10 ? (10 - (f - g)) * 1.6 : 0;
  const tx = treme * (sorte(f * 3.1) - 0.5) * 2;
  const ty = treme * (sorte(f * 7.3) - 0.5) * 2;

  const flash = entre(f, g, g + 7, 0.85, 0) * (f >= g ? 1 : 0);
  const grito = GRITOS[(cena.n - 1) % GRITOS.length];

  // grito: entra grande e assenta; sobe para dar lugar ao cupom
  const pg = mola(f, g, { stiffness: 320, damping: 16 });
  const sai = entre(f, dur - 8, dur, 0, 1, ACELERA);
  const pc = mola(f, g + 6, { stiffness: 140, damping: 13 });
  // depois de ~2,5 s os dois encolhem para baixo e devolvem a cena (o abraço)
  const k = entre(f, g + 58, g + 76, 0, 1);

  return (
    <AbsoluteFill style={{ background: C.noite, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${escala})` }}>
        {cena.cortes.map((c, i) => {
          // sem o som original (pedido de 05/11): só a trilha
          return (
            <Sequence key={i} from={c.ini} durationInFrames={c.dur} layout="none">
              <OffthreadVideo
                src={staticFile(`lideres93/${c.clip}.mp4`)}
                trimBefore={Math.round(c.de * FPS)}
                playbackRate={c.vel}
                muted
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'contrast(1.06) saturate(1.12)' }}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {/* escurece em cima e embaixo para os letreiros */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(7,11,31,.55) 0%, transparent 18%, transparent 58%, rgba(7,11,31,.75) 100%)' }} />
      <Vinheta forca={0.45} />

      {/* selo do número da entrega */}
      <Selo n={cena.n} f={f} sai={sai} />

      {f >= g ? (
        <>
          <Confete ini={g} semente={cena.n} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 1100,
              textAlign: 'center',
              fontFamily: F.titulo,
              fontSize: 210,
              lineHeight: 1,
              color: C.branco,
              letterSpacing: 4,
              WebkitTextStroke: `6px ${C.ouroEscuro}`,
              paintOrder: 'stroke fill',
              textShadow: `0 10px 0 ${C.ouroEscuro}, 0 18px 40px rgba(0,0,0,.6)`,
              transform: `translateY(${-sai * 60 + k * 400}px) scale(${(2.4 - 1.4 * pg) * (1 - sai * 0.2) * (1 - 0.5 * k)}) rotate(${-4 + (1 - pg) * 8}deg)`,
              opacity: entre(f, g, g + 3, 0, 1) * (1 - sai),
            }}
          >
            {grito}
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 1480,
              display: 'flex',
              justifyContent: 'center',
              opacity: (f >= g + 6 ? 1 : 0) * (1 - sai),
              transform: `translateY(${(1 - pc) * 700 + sai * 80 + k * 190}px) rotate(${(1 - pc) * -25 - 3}deg) scale(${(0.6 + 0.4 * pc) * (1 - 0.42 * k)})`,
            }}
          >
            <Cupom largura={800} brilho={entre(f, g + 16, g + 40, 0, 1)} />
          </div>
        </>
      ) : null}

      <Flash forca={flash} />
    </AbsoluteFill>
  );
};

const Selo: React.FC<{ n: number; f: number; sai: number }> = ({ n, f, sai }) => {
  const p = mola(f, 2, { stiffness: 200, damping: 16 });
  const total = LINHA.cenas.length;
  return (
    <div
      style={{
        position: 'absolute',
        top: 96,
        left: 48,
        right: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: 1 - sai,
        transform: `translateX(${(1 - p) * -500}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: F.texto, fontWeight: 800, fontSize: 30, letterSpacing: 6, color: C.ouroClaro }}>LÍDER</span>
        <span style={{ fontFamily: F.titulo, fontSize: 96, lineHeight: 1, color: C.ouro, textShadow: '0 6px 18px rgba(0,0,0,.6)' }}>{dois(n)}</span>
        <span style={{ fontFamily: F.texto, fontWeight: 600, fontSize: 30, color: 'rgba(255,255,255,.7)' }}>/ {dois(total)}</span>
      </div>
      <div
        style={{
          fontFamily: F.texto,
          fontWeight: 900,
          fontSize: 30,
          letterSpacing: 2,
          color: C.noite,
          background: C.limao,
          padding: '12px 22px',
          borderRadius: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}
      >
        ★ BATEU O DESAFIO
      </div>
    </div>
  );
};
