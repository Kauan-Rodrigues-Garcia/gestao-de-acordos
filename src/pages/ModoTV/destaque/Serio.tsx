/**
 * Serio.tsx — o estilo «Sério» da cena «Destaque»: azul-marinho e dourado,
 * letra serifada, como um quadro de reconhecimento de empresa.
 *
 * A foto em retrato, grande, com moldura dourada fina; ao lado, o nome em
 * serifa, a equipe, o valor e a data. Sem enfeite que brinque — o destaque é
 * a pessoa.
 */
import type { CSSProperties } from 'react';
import { caber, dadosDoDestaque, emPagamentos, iniciais, useFonte, type PropsEstilo } from './comum';
import { Animacoes, FotoDestaque } from './pecas';

const SERIFA = '"Playfair Display", Georgia, "Times New Roman", serif';
const SEM_SERIFA = 'Inter, "Segoe UI", system-ui, sans-serif';
const OURO = '#d4af5a';
const OURO_CLARO = '#f1d78f';
const FUNDO = '#0c1424';
const TEXTO = '#f3f1ea';
const SUAVE = '#93a0b8';

const sobe = (atraso: number): CSSProperties => ({ animation: `serio-sobe 900ms cubic-bezier(.2, .8, .2, 1) ${atraso}ms both` });

export function DestaqueSerio({ v, tela }: PropsEstilo) {
  useFonte('tv-serio-fontes', 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,800;1,500&display=swap');
  const d = dadosDoDestaque(v, tela);
  const p = d.pessoa;

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', color: TEXTO, fontFamily: SEM_SERIFA,
      background: `repeating-linear-gradient(135deg, rgba(255,255,255,.018) 0 2px, transparent 2px 26px),
                   radial-gradient(ellipse 70% 90% at 25% 50%, #1a2a48 0%, ${FUNDO} 70%)`,
    }}>
      {/* Filete dourado em volta da tela inteira. */}
      <div style={{ position: 'absolute', inset: 44, border: `2px solid ${OURO}55` }} />
      <div style={{ position: 'absolute', inset: 56, border: `1px solid ${OURO}30` }} />

      {/* A foto, em retrato. */}
      <div style={{ position: 'absolute', left: 150, top: 150, width: 620, height: 780, ...sobe(0) }}>
        <div style={{ position: 'absolute', inset: -22, border: `2px solid ${OURO}` }} />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#16233d', boxShadow: '0 40px 80px rgba(0,0,0,.55)' }}>
          <FotoDestaque foto={p?.foto ?? null} reserva={
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIFA, fontSize: p ? 260 : 340, color: OURO, fontWeight: 600 }}>
              {p ? iniciais(p.nome) : '?'}
            </div>
          } />
        </div>
        {/* A medalha no canto da moldura. */}
        <div style={{
          position: 'absolute', right: -70, bottom: -70, width: 170, height: 170, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${OURO_CLARO}, ${OURO} 55%, #8a6a22)`,
          boxShadow: `0 0 0 6px ${FUNDO}, 0 0 0 8px ${OURO}, 0 20px 40px rgba(0,0,0,.5)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SERIFA, fontWeight: 800, fontSize: 84, color: FUNDO,
          animation: 'serio-medalha 900ms cubic-bezier(.2, 1.3, .4, 1) 600ms both',
        }}>
          {p ? '1º' : '?'}
        </div>
      </div>

      {/* O texto. */}
      <div style={{ position: 'absolute', left: 920, right: 150, top: 170, bottom: 150, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 34, letterSpacing: 14, textTransform: 'uppercase', color: OURO, fontWeight: 600, ...sobe(150) }}>
          {d.titulo}
        </div>
        <div style={{ width: 140, height: 3, background: OURO, margin: '34px 0 40px', ...sobe(200) }} />

        <div style={{
          fontFamily: SERIFA, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1,
          fontSize: caber(d.nome, 850, 138, 0.52, 64), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          ...sobe(280),
        }}>
          {d.nome}
        </div>
        {d.onde && <div style={{ fontSize: 46, color: SUAVE, marginTop: 22, ...sobe(360) }}>{d.onde}</div>}
        {!p && <div style={{ fontFamily: SERIFA, fontStyle: 'italic', fontSize: 44, color: SUAVE, marginTop: 36, ...sobe(420) }}>{d.motivo}</div>}

        <div style={{ marginTop: 'auto' }}>
          {d.valor && (
            <div style={{ ...sobe(480) }}>
              <div style={{ height: 1, background: `linear-gradient(90deg, ${OURO}, transparent)`, marginBottom: 34 }} />
              <div style={{ fontSize: 28, letterSpacing: 8, textTransform: 'uppercase', color: SUAVE }}>Recebido</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 6 }}>
                <span style={{ fontSize: caber(d.valor, 620, 108, 0.6, 60), fontWeight: 700, color: OURO_CLARO, fontVariantNumeric: 'tabular-nums' }}>{d.valor}</span>
                <span style={{ fontSize: 34, color: SUAVE, whiteSpace: 'nowrap' }}>{emPagamentos(d.pagamentos)}</span>
              </div>
            </div>
          )}
          {d.quandoNaTela && (
            <div style={{ fontFamily: SERIFA, fontStyle: 'italic', fontSize: 44, color: TEXTO, opacity: 0.85, marginTop: 40, ...sobe(560) }}>
              {d.quandoNaTela.charAt(0).toUpperCase() + d.quandoNaTela.slice(1)}
            </div>
          )}
        </div>
      </div>

      <Animacoes css={`
        @keyframes serio-sobe { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes serio-medalha { from { opacity: 0; transform: scale(.3) rotate(-90deg); } to { opacity: 1; transform: none; } }
      `} />
    </div>
  );
}
