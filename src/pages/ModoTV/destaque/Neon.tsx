/**
 * Neon.tsx — o estilo «Neon» da cena «Destaque»: anos 80, sol listrado no
 * horizonte, chão quadriculado em perspectiva e letreiro de neon.
 *
 * O brilho é `text-shadow`/`box-shadow` parado; o chão é um gradiente com
 * `perspective` — nada se mexe depois da entrada.
 */
import type { CSSProperties } from 'react';
import { caber, dadosDoDestaque, emPagamentos, iniciais, useFonte, type PropsEstilo } from './comum';
import { Animacoes, FotoDestaque } from './pecas';

const LETREIRO = '"Monoton", "Audiowide", Impact, sans-serif';
const FUTURO = '"Orbitron", "Audiowide", "Segoe UI", sans-serif';
const ROSA = '#ff2fd6';
const CIANO = '#22e9ff';
const LARANJA = '#ff9a3c';
const HORIZONTE = 640;

const brilho = (cor: string, forte = 1): CSSProperties => ({
  color: '#fff',
  textShadow: `0 0 ${6 * forte}px #fff, 0 0 ${14 * forte}px ${cor}, 0 0 ${30 * forte}px ${cor}, 0 0 ${60 * forte}px ${cor}`,
});

const acende = (atraso: number): CSSProperties => ({ animation: `neon-acende 1100ms ease-out ${atraso}ms both` });

export function DestaqueNeon({ v, tela }: PropsEstilo) {
  useFonte('tv-neon-fontes', 'https://fonts.googleapis.com/css2?family=Monoton&family=Orbitron:wght@600;800;900&display=swap');
  const d = dadosDoDestaque(v, tela);
  const p = d.pessoa;
  const titulo = d.titulo.toUpperCase();
  const nome = d.nome.toUpperCase();

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: FUTURO, color: '#fff',
      background: `linear-gradient(180deg, #0a0020 0%, #2a0650 ${HORIZONTE - 120}px, #5a0f6e ${HORIZONTE}px, #12001f ${HORIZONTE}px)`,
    }}>
      {/* Estrelinhas. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: HORIZONTE,
        background: `radial-gradient(#fff 0 1.6px, transparent 2px) 0 0 / 140px 110px,
                     radial-gradient(#ffd6fb 0 1.4px, transparent 2px) 60px 40px / 190px 150px`,
        opacity: 0.6,
      }} />

      {/* O sol listrado, atrás da foto. */}
      <div aria-hidden style={{
        position: 'absolute', left: 140, top: HORIZONTE - 560, width: 760, height: 760, borderRadius: '50%',
        background: `linear-gradient(180deg, #ffe66b 0%, ${LARANJA} 45%, ${ROSA} 85%)`,
        WebkitMaskImage: `linear-gradient(180deg, #000 0 52%, transparent 52% 55%, #000 55% 62%, transparent 62% 66%, #000 66% 72%, transparent 72% 77%, #000 77% 82%, transparent 82%)`,
        maskImage: `linear-gradient(180deg, #000 0 52%, transparent 52% 55%, #000 55% 62%, transparent 62% 66%, #000 66% 72%, transparent 72% 77%, #000 77% 82%, transparent 82%)`,
        filter: `drop-shadow(0 0 40px ${ROSA})`,
        ...acende(0),
      }} />

      {/* O chão quadriculado. */}
      <div aria-hidden style={{
        position: 'absolute', left: -600, right: -600, top: HORIZONTE, height: 900,
        transformOrigin: 'top center', transform: 'perspective(520px) rotateX(62deg)',
        background: `linear-gradient(${ROSA} 3px, transparent 3px) 0 0 / 100% 70px,
                     linear-gradient(90deg, ${ROSA} 3px, transparent 3px) 0 0 / 90px 100%`,
        boxShadow: `0 -4px 30px ${ROSA}`, opacity: 0.85,
      }} />
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: HORIZONTE - 2, height: 4, background: '#ffd6fb', boxShadow: `0 0 24px ${ROSA}, 0 0 60px ${ROSA}` }} />

      {/* A foto, num aro de neon na frente do sol. */}
      <div style={{ position: 'absolute', left: 220, top: 150, width: 600, height: 600, ...acende(250) }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', background: '#2a0650',
          boxShadow: `0 0 0 10px #fff, 0 0 0 16px ${CIANO}, 0 0 40px 18px ${CIANO}, 0 0 120px 30px ${ROSA}`,
        }}>
          <FotoDestaque foto={p?.foto ?? null} reserva={
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUTURO, fontWeight: 900, fontSize: p ? 220 : 300, ...brilho(CIANO) }}>
              {p ? iniciais(p.nome) : '?'}
            </div>
          } />
        </div>
      </div>

      {/* O letreiro. */}
      <div style={{ position: 'absolute', left: 960, right: 90, top: 120, display: 'flex', flexDirection: 'column' }}>
        {d.quando && (
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase', ...brilho(CIANO, 0.6), ...acende(300) }}>
            {d.quando}
          </div>
        )}
        <div style={{ fontFamily: LETREIRO, fontSize: caber(titulo, 860, 92, 0.78, 44), lineHeight: 1.15, marginTop: 30, ...brilho(ROSA), ...acende(500) }}>
          {titulo}
        </div>
        <div style={{
          fontWeight: 900, fontSize: caber(nome, 860, 120, 0.82, 52), lineHeight: 1, marginTop: 48, whiteSpace: 'nowrap',
          ...brilho(CIANO, 1.1), ...acende(800),
        }}>
          {nome}
        </div>
        {d.onde && <div style={{ fontSize: 40, fontWeight: 600, marginTop: 26, color: '#ffd6fb', letterSpacing: 2 }}>{d.onde}</div>}
        {!p && <div style={{ fontSize: 34, marginTop: 30, color: '#ffd6fb', lineHeight: 1.3 }}>{d.motivo}</div>}
      </div>

      {/* O valor, como placa de neon sobre o chão. */}
      {d.valor && (
        <div style={{
          position: 'absolute', left: 960, right: 90, top: 760, padding: '30px 44px', borderRadius: 24,
          border: `4px solid ${ROSA}`, background: 'rgba(18,0,31,.72)',
          boxShadow: `0 0 20px ${ROSA}, inset 0 0 24px ${ROSA}88`,
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 30, ...acende(1100),
        }}>
          <span style={{ fontWeight: 900, fontSize: caber(d.valor, 560, 96, 0.78, 54), whiteSpace: 'nowrap', ...brilho(LARANJA) }}>{d.valor}</span>
          <span style={{ fontSize: 30, fontWeight: 600, color: '#ffd6fb', whiteSpace: 'nowrap' }}>{emPagamentos(d.pagamentos)}</span>
        </div>
      )}

      <Animacoes css={`
        @keyframes neon-acende {
          0% { opacity: 0; } 18% { opacity: .9; } 24% { opacity: .2; } 34% { opacity: 1; } 40% { opacity: .4; } 55%, 100% { opacity: 1; }
        }
      `} />
    </div>
  );
}
