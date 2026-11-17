// Abertura (16 batidas = 8 s): o anel do desafio fecha e vira um ✓, o título
// («Líderes que bateram o desafio», 05/11/2026) bate palavra por palavra, o
// cupom entra girando e a entrega começa (quem entrega andando com os cupons
// na mão). Sem porcentagem: o vídeo não fala em 93%.

import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Cupom, Flash, FundoNoite, Vinheta } from './efeitos';
import { ACELERA, B, C, entre, F, FPS, LINHA, mola, VAI_VOLTA } from './estilo';

const R = 300;
const VOLTA = 2 * Math.PI * R;

export const Abertura: React.FC = () => {
  const f = useCurrentFrame();
  const a = LINHA.abertura;

  // anel do desafio: fecha a volta nas 4 primeiras batidas, e o ✓ salta quando fecha
  const enche = entre(f, 6, 4 * B - 2, 0, 1, VAI_VOLTA);
  const pCheck = mola(f, 4 * B - 6, { stiffness: 260, damping: 13 });
  // na batida 4 ele sobe e encolhe para o título entrar
  const sobe = mola(f, 4 * B, { stiffness: 120, damping: 16 });
  const medY = 860 - sobe * 470;
  const medEsc = 1 - sobe * 0.5;

  const palavra = (txt: string, batida: number, tam: number, cor: string, top: number, extra: React.CSSProperties = {}) => {
    const ini = batida * B;
    const p = mola(f, ini, { stiffness: 300, damping: 15 });
    if (f < ini) return null;
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top,
          textAlign: 'center',
          fontFamily: F.titulo,
          fontSize: tam,
          lineHeight: 1,
          color: cor,
          transform: `scale(${2.6 - 1.6 * p})`,
          opacity: entre(f, ini, ini + 3, 0, 1),
          textShadow: '0 12px 40px rgba(0,0,0,.6)',
          ...extra,
        }}
      >
        {txt}
      </div>
    );
  };

  // batida 12: corta para quem entrega, andando com os cupons
  const naEntrega = f >= 12 * B;
  const saiTitulo = entre(f, 11 * B, 12 * B, 0, 1, ACELERA);
  const pCupom = mola(f, 9 * B, { stiffness: 120, damping: 12 });

  return (
    <AbsoluteFill style={{ background: C.noite, overflow: 'hidden' }}>
      {!naEntrega ? (
        <AbsoluteFill style={{ transform: `scale(${1 + saiTitulo * 0.25})`, opacity: 1 - saiTitulo * 0.9 }}>
          <FundoNoite />
          {/* medidor */}
          <div style={{ position: 'absolute', left: 540 - R - 40, top: medY - R - 40, width: 2 * R + 80, height: 2 * R + 80, transform: `scale(${medEsc})` }}>
            <svg width={2 * R + 80} height={2 * R + 80}>
              <defs>
                <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fff3c4" />
                  <stop offset="45%" stopColor="#ffc93c" />
                  <stop offset="100%" stopColor="#d48a00" />
                </linearGradient>
              </defs>
              <circle cx={R + 40} cy={R + 40} r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={38} />
              <circle
                cx={R + 40}
                cy={R + 40}
                r={R}
                fill="none"
                stroke="url(#ouro)"
                strokeWidth={38}
                strokeLinecap="round"
                strokeDasharray={`${VOLTA * enche} ${VOLTA}`}
                transform={`rotate(-90 ${R + 40} ${R + 40})`}
                style={{ filter: 'drop-shadow(0 0 18px rgba(255,201,60,.6))' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={270} height={270} viewBox="0 0 100 100" style={{ transform: `scale(${pCheck})`, filter: 'drop-shadow(0 0 18px rgba(255,201,60,.6))' }}>
                <polyline points="20,53 41,74 80,29" fill="none" stroke={C.ouro} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ fontFamily: F.texto, fontWeight: 800, fontSize: 34, letterSpacing: 8, color: C.ouroClaro, opacity: 1 - sobe }}>DESAFIO</div>
            </div>
          </div>

          {palavra('LÍDERES', 4, 210, C.branco, 760)}
          {palavra('QUE BATERAM', 5, 130, C.branco, 975)}
          {palavra('O DESAFIO', 6, 170, C.ouro, 1110, { WebkitTextStroke: `4px ${C.ouroEscuro}` })}

          {f >= 8 * B ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 1340, textAlign: 'center', fontFamily: F.texto, fontWeight: 800, fontSize: 44, color: C.branco, opacity: entre(f, 8 * B, 8 * B + 8, 0, 1), transform: `translateY(${entre(f, 8 * B, 8 * B + 10, 30, 0)}px)` }}>
              e cada um levou para casa um
            </div>
          ) : null}
          {f >= 9 * B ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 1440, display: 'flex', justifyContent: 'center', transform: `translateY(${(1 - pCupom) * 900}px) rotate(${(1 - pCupom) * 40 - 3}deg) scale(${0.5 + pCupom * 0.5})` }}>
              <Cupom largura={860} brilho={entre(f, 10 * B, 11 * B, 0, 1)} />
            </div>
          ) : null}
          <Vinheta forca={0.5} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill>
          <Sequence from={Math.round(12 * B)} layout="none">
            <OffthreadVideo
              src={staticFile(`lideres93/${a.clip}.mp4`)}
              trimBefore={Math.round(a.de * FPS)}
              playbackRate={a.vel}
              muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + (f - 12 * B) * 0.0012})`, filter: 'contrast(1.06) saturate(1.1)' }}
            />
          </Sequence>
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(7,11,31,.7) 0%, transparent 35%, transparent 60%, rgba(7,11,31,.8) 100%)' }} />
          <Letreiro f={f - 12 * B} />
          <Vinheta forca={0.45} />
        </AbsoluteFill>
      )}

      <Flash forca={entre(f, 4 * B, 4 * B + 8, 0.9, 0) * (f >= 4 * B ? 1 : 0)} />
      <Flash forca={entre(f, 12 * B, 12 * B + 6, 1, 0) * (f >= 12 * B ? 1 : 0)} cor={C.ouroClaro} />
    </AbsoluteFill>
  );
};

const Letreiro: React.FC<{ f: number }> = ({ f }) => {
  const p = mola(f, 2, { stiffness: 220, damping: 15 });
  const p2 = mola(f, 10, { stiffness: 220, damping: 15 });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1450, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontFamily: F.texto, fontWeight: 900, fontSize: 40, letterSpacing: 10, color: C.noite, background: C.limao, padding: '10px 26px', borderRadius: 8, transform: `translateX(${(1 - p) * -1100}px) rotate(-2deg)` }}>
        HORA DA
      </div>
      <div style={{ fontFamily: F.titulo, fontSize: 190, lineHeight: 1, color: C.branco, textShadow: '0 10px 40px rgba(0,0,0,.7)', transform: `translateX(${(1 - p2) * 1100}px)` }}>
        ENTREGA
      </div>
    </div>
  );
};
