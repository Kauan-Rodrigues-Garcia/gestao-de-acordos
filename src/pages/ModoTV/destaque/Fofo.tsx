/**
 * Fofo.tsx — o estilo «Fofo» da cena «Destaque»: tons pastel, bolinhas,
 * corações e brilhinhos, a foto redonda com orelhinhas de gato e coroa.
 *
 * Os enfeites são SVG desenhado aqui (nada baixado); só a entrada anima.
 */
import type { CSSProperties } from 'react';
import { caber, dadosDoDestaque, emPagamentos, iniciais, useFonte, type PropsEstilo } from './comum';
import { Animacoes, FotoDestaque } from './pecas';

const LETRA = '"Fredoka", "Baloo 2", "Segoe UI", system-ui, sans-serif';
const ROSA = '#ff5d9e';
const ROSA_CLARO = '#ffd1e3';
const LILAS = '#8f6bd8';
const MENTA = '#7fd9c4';
const AMARELO = '#ffd36e';
const TINTA = '#5b3a6b';

function Coracao({ x, y, tam, cor, giro = 0, atraso = 0 }: { x: number; y: number; tam: number; cor: string; giro?: number; atraso?: number }) {
  return (
    <svg viewBox="0 0 32 29" width={tam} height={tam * 0.9} aria-hidden style={{
      position: 'absolute', left: x, top: y, transform: `rotate(${giro}deg)`,
      animation: `fofo-pula 700ms cubic-bezier(.2, 1.6, .4, 1) ${atraso}ms both`,
    }}>
      <path d="M16 28.5S1 19.6 1 9.3C1 4.5 4.8 1 9.2 1c3 0 5.3 1.6 6.8 4 1.5-2.4 3.8-4 6.8-4C27.2 1 31 4.5 31 9.3 31 19.6 16 28.5 16 28.5z" fill={cor} />
      <ellipse cx="9" cy="8" rx="3" ry="2" fill="#fff" opacity=".55" transform="rotate(-30 9 8)" />
    </svg>
  );
}

function Brilho({ x, y, tam, cor = '#fff', atraso = 0 }: { x: number; y: number; tam: number; cor?: string; atraso?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={tam} height={tam} aria-hidden style={{
      position: 'absolute', left: x, top: y, animation: `fofo-pula 700ms cubic-bezier(.2, 1.6, .4, 1) ${atraso}ms both`,
    }}>
      <path d="M10 0c.8 5.6 3.6 8.6 10 10-6.4 1.4-9.2 4.4-10 10-.8-5.6-3.6-8.6-10-10C6.4 8.6 9.2 5.6 10 0z" fill={cor} />
    </svg>
  );
}

function Coroa({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 80" aria-hidden style={style}>
      <path d="M8 70 L14 22 L38 46 L60 8 L82 46 L106 22 L112 70 Z" fill={AMARELO} stroke={TINTA} strokeWidth="5" strokeLinejoin="round" />
      <rect x="8" y="64" width="104" height="12" rx="6" fill={AMARELO} stroke={TINTA} strokeWidth="5" />
      <circle cx="60" cy="44" r="7" fill={ROSA} />
      <circle cx="34" cy="56" r="5" fill={MENTA} />
      <circle cx="86" cy="56" r="5" fill={LILAS} />
    </svg>
  );
}

const pula = (atraso: number): CSSProperties => ({ animation: `fofo-pula 800ms cubic-bezier(.2, 1.5, .4, 1) ${atraso}ms both` });

export function DestaqueFofo({ v, tela }: PropsEstilo) {
  useFonte('tv-fofo-fontes', 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap');
  const d = dadosDoDestaque(v, tela, { dia: 'Destaque do dia', mes: 'Destaque do mês' });
  const p = d.pessoa;

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: LETRA, color: TINTA,
      background: `radial-gradient(circle, rgba(255,255,255,.55) 7px, transparent 8px) 0 0 / 64px 64px,
                   linear-gradient(135deg, #ffd6e8 0%, #eadbff 50%, #d2f5ec 100%)`,
    }}>
      {/* Nuvenzinhas no fundo. */}
      {[[60, 820, 1.1], [1500, 60, 0.9], [1640, 880, 0.8]].map(([x, y, e], i) => (
        <div key={i} aria-hidden style={{ position: 'absolute', left: x, top: y, transform: `scale(${e})`, transformOrigin: 'left top', opacity: 0.85 }}>
          <div style={{ position: 'absolute', width: 260, height: 90, top: 50, borderRadius: 60, background: '#fff' }} />
          <div style={{ position: 'absolute', width: 120, height: 120, left: 40, top: 0, borderRadius: '50%', background: '#fff' }} />
          <div style={{ position: 'absolute', width: 90, height: 90, left: 130, top: 22, borderRadius: '50%', background: '#fff' }} />
        </div>
      ))}

      {/* A foto: redonda, borda branca, orelhinhas e coroa. */}
      <div style={{ position: 'absolute', left: 150, top: 200, width: 700, height: 700, ...pula(0) }}>
        {[-1, 1].map(lado => (
          <div key={lado} aria-hidden style={{
            position: 'absolute', top: -95, left: lado < 0 ? 40 : 440, width: 220, height: 250,
            transform: `rotate(${lado * 22}deg)`,
          }}>
            <div style={{ position: 'absolute', inset: 0, background: ROSA, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
            <div style={{ position: 'absolute', inset: '14px 20px 0', background: '#fff', clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
            <div style={{ position: 'absolute', inset: '70px 60px 0', background: ROSA_CLARO, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
          </div>
        ))}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', padding: 26, background: '#fff',
          boxShadow: `0 0 0 14px ${ROSA_CLARO}, 0 0 0 26px #fff, 0 30px 60px rgba(143,107,216,.35)`,
        }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: ROSA_CLARO }}>
            <FotoDestaque foto={p?.foto ?? null} reserva={
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: p ? 240 : 320, fontWeight: 700, color: ROSA }}>
                {p ? iniciais(p.nome) : '?'}
              </div>
            } />
          </div>
        </div>
        <Coroa style={{ position: 'absolute', left: 250, top: -120, width: 200, transform: 'rotate(-8deg)', animation: 'fofo-coroa 900ms cubic-bezier(.2, 1.6, .4, 1) 500ms both' }} />
        {/* Bochechinhas de «parabéns». */}
        <div style={{
          position: 'absolute', right: -40, bottom: 40, padding: '16px 34px', borderRadius: 999,
          background: ROSA, color: '#fff', fontSize: 50, fontWeight: 700, transform: 'rotate(-6deg)',
          boxShadow: '0 10px 0 #d9427f', animation: 'fofo-pula 800ms cubic-bezier(.2, 1.6, .4, 1) 800ms both',
        }}>
          {p ? 'Parabéns!' : 'Bora!'}
        </div>
      </div>

      <Coracao x={110} y={130} tam={90} cor={ROSA} giro={-15} atraso={300} />
      <Coracao x={820} y={210} tam={64} cor={LILAS} giro={12} atraso={420} />
      <Coracao x={760} y={860} tam={80} cor={MENTA} giro={-8} atraso={540} />
      <Brilho x={900} y={500} tam={70} atraso={600} />
      <Brilho x={80} y={560} tam={56} cor={AMARELO} atraso={660} />
      <Brilho x={1760} y={300} tam={60} atraso={720} />

      {/* O cartão do nome. */}
      <div style={{
        position: 'absolute', left: 1000, right: 110, top: 170, bottom: 170, borderRadius: 64, background: 'rgba(255,255,255,.88)',
        boxShadow: '0 24px 0 rgba(143,107,216,.18), 0 30px 60px rgba(143,107,216,.25)', padding: '60px 64px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', ...pula(150),
      }}>
        {d.quandoNaTela && (
          <div style={{ padding: '8px 28px', borderRadius: 999, background: '#efe6ff', color: LILAS, fontSize: 32, fontWeight: 600 }}>
            {d.quandoNaTela}
          </div>
        )}
        <div style={{ fontSize: caber(d.titulo, 680, 78, 0.55, 48), fontWeight: 700, color: LILAS, marginTop: 26 }}>
          {d.titulo}
        </div>
        <div style={{
          fontSize: caber(d.nome, 700, 128, 0.56, 60), fontWeight: 700, color: ROSA, lineHeight: 1.05, marginTop: 18,
          whiteSpace: 'nowrap', textShadow: `0 6px 0 ${ROSA_CLARO}`,
        }}>
          {d.nome}
        </div>
        {d.onde && <div style={{ fontSize: 44, fontWeight: 600, color: TINTA, opacity: 0.75, marginTop: 14 }}>{d.onde}</div>}
        {!p && <div style={{ fontSize: 38, fontWeight: 500, marginTop: 24, maxWidth: 640 }}>{d.motivo}</div>}

        {d.valor && (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              padding: '18px 48px', borderRadius: 999, background: `linear-gradient(135deg, ${MENTA}, #5cc7b0)`,
              color: '#fff', fontSize: caber(d.valor, 560, 86, 0.58, 54), fontWeight: 700, boxShadow: '0 10px 0 #3fa58f',
            }}>
              {d.valor}
            </div>
            {d.pagamentos > 0 && <div style={{ fontSize: 34, fontWeight: 600, marginTop: 22, opacity: 0.75 }}>{emPagamentos(d.pagamentos)}</div>}
          </div>
        )}
      </div>

      <Animacoes css={`
        @keyframes fofo-pula  { from { opacity: 0; transform: scale(.4); } to { opacity: 1; } }
        @keyframes fofo-coroa { from { opacity: 0; transform: translateY(-80px) rotate(-30deg); } to { opacity: 1; transform: rotate(-8deg); } }
      `} />
    </div>
  );
}
