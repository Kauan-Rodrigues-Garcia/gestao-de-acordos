/**
 * Gibi.tsx — o estilo «Gibi» da cena «Destaque»: quem mais recebeu no dia (ou
 * no mês), numa página de quadrinho, com a foto ENORME.
 *
 * Pedido do Cleber (29/10/2026): «design de gibi bonito, a foto bem destacada
 * e grande, atrativo para ficar numa TV».
 *
 *   ┌──────────────┬─────────────────────┐
 *   │              │  DESTAQUE DO DIA!   │  título em letra de gibi
 *   │   a FOTO     ├─────────────────────┤
 *   │  (700 px)    │  ( NOME, balão )    │  balão de fala apontando a foto
 *   │    #1        ├─────────────────────┤
 *   │              │  ✷ R$ 12.345,67 ✷   │  a explosão com o valor
 *   └──────────────┴─────────────────────┘
 *
 * Quadros de borda preta grossa e sombra dura, retícula de pontos e raios
 * atrás da foto. Tudo é CSS (gradiente, `clip-path`); só a entrada anima.
 */
import type { CSSProperties } from 'react';
import { caber, dadosDoDestaque, emPagamentos, iniciais, useFonte, type PropsEstilo } from './comum';
import { Animacoes, FotoDestaque } from './pecas';

const TITULO = '"Bangers", Impact, "Arial Black", sans-serif';
const TEXTO = '"Comic Neue", "Comic Sans MS", "Segoe UI", sans-serif';
const TINTA = '#111111';

const COR = {
  papel: '#fff4d6',
  amarelo: '#ffd23f',
  laranja: '#ff8c1a',
  vermelho: '#e63946',
  azul: '#1d6fe8',
  azulEscuro: '#0b3c91',
};

/** Retícula: os pontinhos da impressão de gibi. */
const reticula = (cor: string, passo = 22, raio = 2.6) =>
  `radial-gradient(circle, ${cor} ${raio}px, transparent ${raio + 0.6}px) 0 0 / ${passo}px ${passo}px`;

/** A estrela de explosão, em `clip-path`: pontas alternando longe e perto. */
function estrela(pontas: number, dentro: number): string {
  const pts: string[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const r = i % 2 === 0 ? 50 : dentro;
    const a = (Math.PI * i) / pontas - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}
const EXPLOSAO = estrela(14, 36);
const SELO = estrela(12, 40);

/** Quadro: borda preta grossa e a sombra dura, levemente torto. */
function quadro(x: number, y: number, w: number, h: number, giro: number, fundo: string, atraso: number): CSSProperties {
  return {
    position: 'absolute', left: x, top: y, width: w, height: h,
    border: `10px solid ${TINTA}`, boxShadow: `16px 16px 0 ${TINTA}`,
    background: fundo, overflow: 'hidden',
    ['--giro' as string]: `${giro}deg`,
    transform: `rotate(${giro}deg)`,
    animation: `gibi-entra 700ms cubic-bezier(.2, 1.4, .4, 1) ${atraso}ms both`,
  };
}

/** Letra de gibi com contorno e a sombra «3D» em degraus. */
function letreiro(tam: number, cor: string, contorno = 7): CSSProperties {
  return {
    fontFamily: TITULO, fontSize: tam, lineHeight: 0.95, color: cor, letterSpacing: 2,
    WebkitTextStroke: `${contorno}px ${TINTA}`, paintOrder: 'stroke fill',
    textShadow: `5px 5px 0 ${TINTA}, 9px 9px 0 ${TINTA}`,
    textTransform: 'uppercase', whiteSpace: 'nowrap',
  };
}

function Reserva({ nome }: { nome: string | null }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${reticula('rgba(255,255,255,.18)', 26, 3)}, linear-gradient(160deg, ${COR.azul}, ${COR.azulEscuro})`,
      ...letreiro(nome ? 320 : 460, nome ? COR.amarelo : '#ffffff', 12),
    }}>
      {nome ? iniciais(nome) : '?'}
    </div>
  );
}

export function DestaqueGibi({ v, tela }: PropsEstilo) {
  useFonte('tv-gibi-fontes', 'https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:wght@700&display=swap');

  const d = dadosDoDestaque(v, tela, { dia: 'Destaque do dia!', mes: 'Destaque do mês!' });
  const p = d.pessoa;
  const titulo = d.titulo.toUpperCase();
  const nome = d.nome.toUpperCase();
  const valor = d.valor ?? '';

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      background: `${reticula('rgba(17,17,17,.07)', 18, 2)}, ${COR.papel}`,
      fontFamily: TEXTO, color: TINTA,
    }}>
      {/* ── Quadro 1: a foto ── */}
      <div style={quadro(56, 52, 900, 966, -1.2, COR.amarelo, 0)}>
        <div style={{
          position: 'absolute', inset: -400,
          background: `repeating-conic-gradient(from 0deg at 50% 50%, ${COR.amarelo} 0deg 7deg, ${COR.laranja} 7deg 14deg)`,
        }} />
        <div style={{ position: 'absolute', inset: 0, background: reticula('rgba(230,57,70,.28)', 20, 3) }} />

        <div style={{
          position: 'absolute', left: 90, top: 110, width: 700, height: 700,
          background: '#fff', padding: 18, border: `10px solid ${TINTA}`, boxShadow: `18px 18px 0 ${TINTA}`,
          transform: 'rotate(2.5deg)',
          animation: 'gibi-foto 900ms cubic-bezier(.2, 1.5, .35, 1) 250ms both',
        }}>
          <div style={{ width: '100%', height: '100%', border: `6px solid ${TINTA}`, overflow: 'hidden' }}>
            <FotoDestaque foto={p?.foto ?? null} reserva={<Reserva nome={p?.nome ?? null} />} />
          </div>
        </div>

        {/* O selo «#1» (a letra de gibi não tem «º»). */}
        <div style={{
          position: 'absolute', left: 14, top: 18, width: 270, height: 270,
          animation: 'gibi-selo 800ms cubic-bezier(.2, 1.6, .4, 1) 650ms both',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: TINTA, clipPath: SELO, transform: 'translate(8px, 8px)' }} />
          <div style={{
            position: 'absolute', inset: 0, background: COR.vermelho, clipPath: SELO,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ ...letreiro(p ? 108 : 120, '#fff', 6), transform: 'rotate(-12deg)' }}>{p ? '#1' : '?'}</span>
          </div>
        </div>

        {/* O letreiro de baixo, como recordatório de gibi. */}
        <div style={{
          position: 'absolute', left: 60, right: 60, bottom: 44, padding: '14px 26px',
          background: COR.amarelo, border: `7px solid ${TINTA}`, boxShadow: `9px 9px 0 ${TINTA}`,
          fontFamily: TITULO, fontSize: 54, letterSpacing: 2, textAlign: 'center',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transform: 'rotate(-1.5deg)',
        }}>
          {d.onde || 'O time'}
        </div>
      </div>

      {/* ── Quadro 2: o título ── */}
      <div style={quadro(1000, 52, 864, 318, 1.4, `${reticula('rgba(255,255,255,.16)', 20, 3)}, linear-gradient(135deg, ${COR.azul}, ${COR.azulEscuro})`, 120)}>
        {d.quandoNaTela && (
          <div style={{
            position: 'absolute', left: -10, top: -10, padding: '10px 26px 12px',
            background: COR.amarelo, borderRight: `7px solid ${TINTA}`, borderBottom: `7px solid ${TINTA}`,
            fontFamily: TEXTO, fontWeight: 700, fontSize: 34, textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {d.quandoNaTela}
          </div>
        )}
        <div style={{
          position: 'absolute', inset: '70px 30px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ ...letreiro(caber(titulo, 780, 150, 0.5, 48), COR.amarelo, 8), transform: 'rotate(-3deg)' }}>{titulo}</span>
        </div>
      </div>

      {/* ── Quadro 3: o nome, no balão de fala ── */}
      <div style={quadro(1000, 408, 864, 330, -1, `${reticula('rgba(29,111,232,.16)', 22, 3)}, #ffffff`, 240)}>
        <div style={{
          position: 'absolute', left: 70, top: 40, right: 36, bottom: 50,
          animation: 'gibi-balao 700ms cubic-bezier(.2, 1.5, .4, 1) 900ms both',
        }}>
          {/* O rabinho aponta para a foto, à esquerda. */}
          <div style={{
            position: 'absolute', left: -62, bottom: 34, width: 110, height: 70, background: TINTA,
            clipPath: 'polygon(100% 0, 0 100%, 100% 70%)',
          }} />
          <div style={{
            position: 'absolute', left: -44, bottom: 44, width: 96, height: 52, background: '#fff',
            clipPath: 'polygon(100% 0, 0 100%, 100% 64%)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, background: '#fff', border: `8px solid ${TINTA}`, borderRadius: '50%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
          }}>
            <span style={{ ...letreiro(caber(nome, 640, 128, 0.5, 48), p ? COR.vermelho : COR.azul, 6), textShadow: `5px 5px 0 ${TINTA}` }}>
              {nome}
            </span>
            {!p && (
              <span style={{ fontFamily: TEXTO, fontWeight: 700, fontSize: 32, marginTop: 14, textAlign: 'center', lineHeight: 1.15 }}>
                {d.motivo}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Quadro 4: o valor, na explosão ── */}
      <div style={quadro(1000, 776, 864, 242, 1.2, `${reticula('rgba(17,17,17,.18)', 18, 2.6)}, ${COR.vermelho}`, 360)}>
        {p && d.valor ? (
          <>
            <div style={{
              position: 'absolute', left: 0, top: -150, width: 540, height: 540,
              animation: 'gibi-selo 800ms cubic-bezier(.2, 1.6, .4, 1) 1150ms both',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: TINTA, clipPath: EXPLOSAO, transform: 'translate(10px, 10px)' }} />
              <div style={{ position: 'absolute', inset: 0, background: COR.amarelo, clipPath: EXPLOSAO }} />
            </div>
            <div style={{
              position: 'absolute', left: 0, top: 0, width: 540, height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              animation: 'gibi-selo 800ms cubic-bezier(.2, 1.6, .4, 1) 1150ms both',
            }}>
              <span style={{ ...letreiro(caber(valor, 420, 92, 0.5, 48), '#fff', 6), transform: 'rotate(-4deg)' }}>{valor}</span>
              {d.pagamentos > 0 && (
                <span style={{ fontFamily: TEXTO, fontWeight: 700, fontSize: 30, marginTop: 6 }}>{emPagamentos(d.pagamentos)}</span>
              )}
            </div>
            <span style={{
              position: 'absolute', right: 30, top: '50%', transform: 'translateY(-50%) rotate(8deg)',
              ...letreiro(68, COR.amarelo, 6),
            }}>
              KA-CHING!
            </span>
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...letreiro(p ? 120 : 96, COR.amarelo, 7), transform: 'rotate(-3deg)' }}>
              {p ? 'MANDOU BEM!' : 'BORA, TIME!'}
            </span>
          </div>
        )}
      </div>

      <Animacoes css={`
        @keyframes gibi-entra { from { opacity: 0; transform: rotate(var(--giro)) scale(.82); } to { opacity: 1; transform: rotate(var(--giro)) scale(1); } }
        @keyframes gibi-foto  { from { opacity: 0; transform: rotate(-14deg) scale(.6); } to { opacity: 1; transform: rotate(2.5deg) scale(1); } }
        @keyframes gibi-selo  { from { opacity: 0; transform: scale(.2) rotate(-40deg); } to { opacity: 1; transform: none; } }
        @keyframes gibi-balao { from { opacity: 0; transform: scale(.5); } to { opacity: 1; transform: none; } }
      `} />
    </div>
  );
}
