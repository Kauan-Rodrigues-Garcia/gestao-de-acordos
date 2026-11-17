// Final (24 batidas = 12 s): o mosaico com todos os líderes segurando o cupom,
// estourando um a um; depois «PARABÉNS, LÍDERES!» por cima, com chuva de confete.

import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Confete, Cupom, Flash, FundoNoite, Vinheta } from './efeitos';
import { B, C, entre, F, LINHA, mola, sorte } from './estilo';

const COLS = 4;
const LINHAS = 5;
const L = 1080 / COLS;
const A = 1920 / LINHAS;

export const Final: React.FC = () => {
  const f = useCurrentFrame();
  const n = LINHA.cenas.length;
  const celulas = COLS * LINHAS;
  // ordem de entrada embaralhada (fixa), um a cada 5 quadros
  const ordem = Array.from({ length: celulas }, (_, i) => i).sort((x, y) => sorte(x + 40) - sorte(y + 40));

  const titulo = 8 * B; // batida 8: o título entra
  const escurece = entre(f, titulo, titulo + 10, 0, 1);
  const zoom = 1 + entre(f, titulo, LINHA.final.dur, 0, 0.08);
  const fim = entre(f, LINHA.final.dur - 20, LINHA.final.dur, 0, 1);

  const pT1 = mola(f, titulo, { stiffness: 260, damping: 14 });
  const pT2 = mola(f, titulo + B, { stiffness: 260, damping: 14 });
  const pT3 = mola(f, titulo + 3 * B, { stiffness: 160, damping: 14 });

  return (
    <AbsoluteFill style={{ background: C.noite, overflow: 'hidden' }}>
      <FundoNoite />
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {Array.from({ length: celulas }, (_, i) => {
          const cena = LINHA.cenas[i % n];
          const ini = 4 + ordem.indexOf(i) * 5;
          const p = mola(f, ini, { stiffness: 220, damping: 13 });
          if (f < ini) return null;
          const col = i % COLS;
          const lin = Math.floor(i / COLS);
          const giro = (sorte(i + 7) - 0.5) * 6;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: col * L + 7,
                top: lin * A + 7,
                width: L - 14,
                height: A - 14,
                borderRadius: 14,
                overflow: 'hidden',
                border: `4px solid ${C.ouro}`,
                boxShadow: '0 10px 30px rgba(0,0,0,.5)',
                transform: `scale(${p}) rotate(${giro * (1 - escurece * 0.6)}deg)`,
                filter: `brightness(${1 - escurece * 0.42 + entre(f, ini, ini + 6, 0.8, 0)}) saturate(${1.1 - escurece * 0.3})`,
              }}
            >
              <Img src={staticFile(`lideres93/fotos/${String(cena.n).padStart(2, '0')}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%' }} />
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 45% at 50% 55%, rgba(7,11,31,${0.72 * escurece}) 30%, rgba(7,11,31,${0.2 * escurece}) 100%)` }} />

      {f >= titulo ? (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 700, textAlign: 'center', fontFamily: F.titulo, fontSize: 190, lineHeight: 1, color: C.branco, transform: `scale(${2.4 - 1.4 * pT1})`, opacity: entre(f, titulo, titulo + 3, 0, 1), textShadow: '0 12px 40px rgba(0,0,0,.7)' }}>
            PARABÉNS,
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 890,
              textAlign: 'center',
              fontFamily: F.titulo,
              fontSize: 230,
              lineHeight: 1,
              color: C.ouro,
              WebkitTextStroke: `5px ${C.ouroEscuro}`,
              paintOrder: 'stroke fill',
              transform: `scale(${f >= titulo + B ? 2.4 - 1.4 * pT2 : 0})`,
              textShadow: `0 10px 0 ${C.ouroEscuro}, 0 20px 50px rgba(0,0,0,.7)`,
            }}
          >
            LÍDERES!
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 1160, textAlign: 'center', fontFamily: F.texto, fontWeight: 800, fontSize: 46, color: C.branco, opacity: entre(f, titulo + 2 * B, titulo + 2 * B + 10, 0, 1) }}>
            {n} entregas · <span style={{ color: C.limao }}>desafio batido</span>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 1270, display: 'flex', justifyContent: 'center', opacity: f >= titulo + 3 * B ? 1 : 0, transform: `translateY(${(1 - pT3) * 800}px) rotate(${(1 - pT3) * 30 - 2}deg) scale(${0.55 + 0.25 * pT3})` }}>
            <Cupom largura={860} brilho={entre(f, titulo + 5 * B, titulo + 7 * B, 0, 1)} />
          </div>
        </>
      ) : null}

      {[0, 1, 2, 3].map((k) => (
        <Confete key={k} ini={titulo + k * 2 * B} chuva quantos={90} semente={50 + k} />
      ))}
      <Vinheta forca={0.5} />
      <Flash forca={entre(f, titulo, titulo + 8, 0.9, 0) * (f >= titulo ? 1 : 0)} />
      <AbsoluteFill style={{ background: C.noite, opacity: fim }} />
    </AbsoluteFill>
  );
};
