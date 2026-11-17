// Abertura de cada setor: a claquete sobe, bate na 3ª batida (com flash e
// tremida) e aparece o «gênero do filme». Sai mergulhando para a 1ª pessoa.

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Setor } from './elenco';
import { ACELERA, C, entre, F, mola } from './estilo';
import { Flash, Grao, LuzVazada, Riscos, Vinheta } from './efeitos';
import { B, CLAQUETE } from './tempo';

const dois = (n: number) => String(n).padStart(2, '0');

/** Veludo vermelho com dobras e um canhão de luz de cima. */
export const Veludo: React.FC<{ luz?: number }> = ({ luz = 1 }) => (
  <AbsoluteFill style={{ background: C.veludoEscuro }}>
    <AbsoluteFill
      style={{
        background: `repeating-linear-gradient(90deg, #4a0610 0px, #9c1529 46px, #c21f36 64px, #7a0d1c 98px, #4a0610 132px)`,
        opacity: 0.95,
      }}
    />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.7) 100%)' }} />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 45% at 50% 42%, rgba(255,220,160,${0.42 * luz}) 0%, transparent 70%)`, mixBlendMode: 'screen' }} />
  </AbsoluteFill>
);

export const Claquete: React.FC<{ setor: Setor; cena: number }> = ({ setor, cena }) => {
  const f = useCurrentFrame();
  const dur = CLAQUETE * B;
  const bate = B * 2;

  const sobe = mola(f, 0, { stiffness: 120, damping: 14 });
  // braço aberto até a batida, fecha de uma vez e quica um pouco
  let braco = -26;
  if (f >= bate - 4) braco = entre(f, bate - 4, bate, -26, 0, ACELERA);
  if (f > bate) braco = -4 * Math.exp(-(f - bate) / 3) * Math.abs(Math.sin((f - bate) / 1.6));
  const tremida = f >= bate && f < bate + 8 ? Math.sin(f * 3.1) * (bate + 8 - f) * 2.4 : 0;

  const genero = entre(f, bate + 2, bate + 14, 0, 1);
  const [titulo, resto] = setor.genero.split(':');
  const mergulha = entre(f, dur - 7, dur, 0, 1, ACELERA);

  const listra = 'repeating-linear-gradient(-45deg, #111 0 46px, #f6f0e4 46px 92px)';

  return (
    <AbsoluteFill style={{ overflow: 'hidden', transform: `translate(${tremida}px, ${tremida * 0.6}px)` }}>
      <Veludo luz={1 + (f >= bate && f < bate + 10 ? 0.6 : 0)} />
      <LuzVazada forca={0.25} semente={cena * 5} />

      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: entre(f, 4, 16, 0, 1) * (1 - mergulha) }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 40, letterSpacing: 12, color: C.ouroClaro }}>ENTRE METAS E RISADAS</div>
        <div style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 38, color: C.creme, opacity: 0.8 }}>Bookplay + Cofen · 2026</div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 540,
          top: 860,
          width: 860,
          transform: `translate(-50%, -50%) translateY(${(1 - sobe) * 1400}px) rotate(${(1 - sobe) * -12 - 2}deg) scale(${1 + mergulha * 2.2})`,
          opacity: 1 - mergulha,
          filter: mergulha > 0 ? `blur(${mergulha * 10}px)` : undefined,
        }}
      >
        {/* braço */}
        <div style={{ position: 'relative', height: 120, transformOrigin: '18px 110px', transform: `rotate(${braco}deg)` }}>
          <div style={{ position: 'absolute', inset: '0 0 10px 0', background: listra, borderRadius: 10, boxShadow: '0 8px 20px rgba(0,0,0,.4)' }} />
        </div>
        {/* barra fixa */}
        <div style={{ height: 96, background: listra, backgroundPosition: '46px 0', borderRadius: '10px 10px 0 0' }} />
        {/* lousa */}
        <div style={{ background: '#1b1b1f', borderRadius: '0 0 18px 18px', padding: '26px 40px 36px', boxShadow: '0 30px 80px rgba(0,0,0,.6)', color: '#f4f1ea', fontFamily: F.giz }}>
          <div style={{ display: 'flex', borderBottom: '3px solid rgba(255,255,255,.55)', paddingBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 30, opacity: 0.7 }}>CENA</div>
              <div style={{ fontSize: 96, lineHeight: 1 }}>{dois(cena)}</div>
            </div>
            <div style={{ flex: 1, borderLeft: '3px solid rgba(255,255,255,.55)', paddingLeft: 30 }}>
              <div style={{ fontSize: 30, opacity: 0.7 }}>TOMADA</div>
              <div style={{ fontSize: 96, lineHeight: 1 }}>2026</div>
            </div>
          </div>
          <div style={{ fontSize: setor.nome.length > 12 ? 96 : 124, lineHeight: 1.15, padding: '22px 0 14px', color: setor.cor, textAlign: 'center' }}>{setor.nome}</div>
          <div style={{ display: 'flex', borderTop: '3px solid rgba(255,255,255,.55)', paddingTop: 14, fontSize: 34 }}>
            <div style={{ flex: 1 }}>ELENCO: {setor.pessoas.length} {setor.pessoas.length > 1 ? 'estrelas' : 'estrela'}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>DIREÇÃO: o time</div>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 1430, left: 70, right: 70, textAlign: 'center', opacity: genero * (1 - mergulha), transform: `translateY(${(1 - genero) * 40}px)` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 84, letterSpacing: 4, color: setor.cor, textShadow: '0 4px 18px rgba(0,0,0,.55)' }}>{titulo.toUpperCase()}</div>
        {resto ? <div style={{ fontFamily: F.serifa, fontStyle: 'italic', fontSize: 54, color: C.creme, lineHeight: 1.2 }}>{resto.trim()}</div> : null}
      </div>

      <Riscos />
      <Grao forca={0.16} />
      <Vinheta forca={0.7} />
      <Flash forca={Math.max(entre(f, 0, 7, 0.85, 0), f >= bate ? entre(f, bate, bate + 7, 0.75, 0) : 0, mergulha * 0.5)} />
    </AbsoluteFill>
  );
};
