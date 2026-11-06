/**
 * Natal.tsx — o estilo «Natal» da cena «Destaque» (06/11/2026): noite verde
 * com neve caindo, varal de luzinhas, a foto numa guirlanda com gorro de
 * Papai Noel, e o nome num cartão com faixa de bengala doce.
 *
 * É de época: fica FORA do sorteio da «Surpresa» (`Destaque.tsx`).
 *
 * Tudo é SVG e CSS desenhado aqui (nada baixado além das duas fontes). Ao
 * contrário dos outros estilos, a neve e as luzinhas animam sem parar — mas só
 * com `transform` e `opacity`, que a GPU faz sozinha, e com poucas peças
 * (40 flocos), para o PC fraco da TV aguentar. Quem pediu menos movimento vê
 * a cena parada (`Animacoes`).
 */
import type { CSSProperties } from 'react';
import { caber, dadosDoDestaque, emPagamentos, iniciais, useFonte, type PropsEstilo } from './comum';
import { Animacoes, FotoDestaque } from './pecas';

const TITULO = '"Mountains of Christmas", "Fraunces", Georgia, serif';
const LETRA = '"Fraunces", Georgia, "Times New Roman", serif';
const VERMELHO = '#c8102e';
const VERMELHO_ESCURO = '#8e0b20';
const VERDE = '#1d6b40';
const VERDE_CLARO = '#2e9e5b';
const DOURADO = '#f2c14e';
const PAPEL = '#fffaf0';
const TINTA = '#4a3a2c';

// ── Neve ─────────────────────────────────────────────────────────────────────

/** Posição, tamanho e ritmo de cada floco: fixos (sem `Math.random`), a TV e a prévia iguais. */
const FLOCOS = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 137) % 1920,
  tam: 6 + ((i * 7) % 11),
  duracao: 10 + ((i * 13) % 9),
  atraso: -((i * 29) % 17),
  deriva: ((i * 31) % 120) - 60,
  opacidade: 0.45 + ((i * 3) % 5) / 10,
}));

function Neve() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {FLOCOS.map((f, i) => (
        <span key={i} style={{
          position: 'absolute', left: f.x, top: -30, width: f.tam, height: f.tam, borderRadius: '50%',
          background: '#fff', opacity: f.opacidade, willChange: 'transform',
          ['--deriva' as string]: `${f.deriva}px`,
          animation: `natal-neve ${f.duracao}s linear ${f.atraso}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Varal de luzinhas ────────────────────────────────────────────────────────

const CORES_LUZ = [VERMELHO, DOURADO, VERDE_CLARO, '#4ea8ff'];

/** Um ponto da curva do fio (cúbica de Bézier atravessando o topo). */
function noFio(t: number): { x: number; y: number } {
  const p = [[0, 20], [640, 180], [1280, -20], [1920, 80]];
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: k.reduce((s, kk, i) => s + kk * p[i][0], 0), y: k.reduce((s, kk, i) => s + kk * p[i][1], 0) };
}

function Luzinhas() {
  const lampadas = Array.from({ length: 21 }, (_, i) => ({ ...noFio((i + 0.5) / 21), cor: CORES_LUZ[i % CORES_LUZ.length], i }));
  return (
    <svg aria-hidden viewBox="0 0 1920 200" width={1920} height={200} style={{ position: 'absolute', left: 0, top: 0 }}>
      <path d="M0 20 C 640 180, 1280 -20, 1920 80" fill="none" stroke="#0c2418" strokeWidth={5} />
      {lampadas.map(l => (
        <g key={l.i} transform={`translate(${l.x} ${l.y + 4}) rotate(${(l.i % 3 - 1) * 12})`}>
          <rect x={-7} y={0} width={14} height={14} rx={3} fill="#3a3a3a" />
          <ellipse cx={0} cy={30} rx={13} ry={20} fill={l.cor}
            style={{ animation: `natal-pisca 2.4s ease-in-out ${(l.i % 4) * 0.6}s infinite` }} />
          <ellipse cx={-4} cy={24} rx={4} ry={7} fill="#fff" opacity={0.55} />
        </g>
      ))}
    </svg>
  );
}

// ── A guirlanda com a foto ───────────────────────────────────────────────────

const VERDES_FOLHA = ['#1e7a46', VERDE_CLARO, '#14603a'];

function Guirlanda() {
  const folhas = Array.from({ length: 54 }, (_, i) => {
    const ang = (i / 54) * Math.PI * 2;
    const r = 318 + ((i % 3) - 1) * 16;
    return { x: 380 + Math.cos(ang) * r, y: 380 + Math.sin(ang) * r, giro: (ang * 180) / Math.PI + 60 + (i % 2) * 40, cor: VERDES_FOLHA[i % 3], i };
  });
  return (
    <svg aria-hidden viewBox="0 0 760 760" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      {folhas.map(f => (
        <ellipse key={f.i} cx={f.x} cy={f.y} rx={50} ry={21} fill={f.cor} transform={`rotate(${f.giro} ${f.x} ${f.y})`} />
      ))}
      {folhas.filter(f => f.i % 5 === 0).map(f => (
        <g key={`b${f.i}`}>
          <circle cx={f.x + 10} cy={f.y - 6} r={11} fill={VERMELHO} />
          <circle cx={f.x - 8} cy={f.y + 8} r={10} fill={VERMELHO} />
          <circle cx={f.x + 7} cy={f.y - 9} r={3.5} fill="#fff" opacity={0.7} />
        </g>
      ))}
      {/* O laço embaixo. */}
      <g transform="translate(380 712)">
        <path d="M0 0 C -40 -60, -150 -50, -120 10 C -100 50, -40 30, 0 0 Z" fill={VERMELHO} stroke={VERMELHO_ESCURO} strokeWidth={5} />
        <path d="M0 0 C 40 -60, 150 -50, 120 10 C 100 50, 40 30, 0 0 Z" fill={VERMELHO} stroke={VERMELHO_ESCURO} strokeWidth={5} />
        <path d="M-10 6 L -60 110 L -30 96 L -18 124 L 4 14 Z" fill={VERMELHO} stroke={VERMELHO_ESCURO} strokeWidth={4} />
        <path d="M10 6 L 60 110 L 30 96 L 18 124 L -4 14 Z" fill={VERMELHO} stroke={VERMELHO_ESCURO} strokeWidth={4} />
        <circle r={22} fill={VERMELHO_ESCURO} />
      </g>
    </svg>
  );
}

function Gorro({ style }: { style: CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 320 250" style={style}>
      <path d="M36 196 C 60 96, 150 22, 268 46 C 236 80, 222 130, 232 196 Z" fill={VERMELHO} stroke={VERMELHO_ESCURO} strokeWidth={6} strokeLinejoin="round" />
      <path d="M70 150 C 110 90, 170 60, 236 64" fill="none" stroke="#fff" strokeWidth={8} opacity={0.18} strokeLinecap="round" />
      <rect x={14} y={176} width={244} height={56} rx={28} fill="#fff" stroke="#e3e8ef" strokeWidth={4} />
      <circle cx={270} cy={46} r={32} fill="#fff" stroke="#e3e8ef" strokeWidth={4} />
    </svg>
  );
}

// ── Presentes e chão de neve ─────────────────────────────────────────────────

function Presente({ x, y, l, a, cor, fita, atraso }: { x: number; y: number; l: number; a: number; cor: string; fita: string; atraso: number }) {
  return (
    <svg aria-hidden viewBox={`0 0 ${l} ${a + 30}`} width={l} height={a + 30} style={{
      position: 'absolute', left: x, top: y - 30, animation: `natal-pula 800ms cubic-bezier(.2, 1.5, .4, 1) ${atraso}ms both`,
    }}>
      <rect x={0} y={30} width={l} height={a} rx={8} fill={cor} />
      <rect x={l / 2 - 9} y={30} width={18} height={a} fill={fita} />
      <rect x={0} y={30 + a * 0.32} width={l} height={14} fill={fita} opacity={0.9} />
      <path d={`M${l / 2} 30 C ${l / 2 - 40} 0, ${l / 2 - 50} 34, ${l / 2} 30 C ${l / 2 + 40} 0, ${l / 2 + 50} 34, ${l / 2} 30`} fill="none" stroke={fita} strokeWidth={9} />
    </svg>
  );
}

const pula = (atraso: number): CSSProperties => ({ animation: `natal-pula 900ms cubic-bezier(.2, 1.4, .4, 1) ${atraso}ms both` });

export function DestaqueNatal({ v, tela }: PropsEstilo) {
  useFonte('tv-natal-fontes', 'https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&family=Fraunces:opsz,wght@9..144,700;9..144,900&display=swap');
  const d = dadosDoDestaque(v, tela, { dia: 'Destaque do dia', mes: 'Destaque do mês' });
  const p = d.pessoa;

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: LETRA, color: TINTA,
      background: 'radial-gradient(ellipse 90% 80% at 30% 40%, #1f5b3a 0%, #123a27 55%, #0a2219 100%)',
    }}>
      <Neve />

      {/* O chão de neve. */}
      <svg aria-hidden viewBox="0 0 1920 160" width={1920} height={160} style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <path d="M0 50 C 300 0, 620 80, 960 34 S 1600 10, 1920 54 L 1920 160 L 0 160 Z" fill="#eef3f8" />
        <path d="M0 78 C 360 40, 700 100, 1040 66 S 1640 50, 1920 84" fill="none" stroke="#fff" strokeWidth={10} opacity={0.8} />
      </svg>

      <Luzinhas />

      {/* A foto na guirlanda, com o gorro. */}
      <div style={{ position: 'absolute', left: 110, top: 190, width: 760, height: 760, ...pula(0) }}>
        <Guirlanda />
        <div style={{
          position: 'absolute', left: 105, top: 105, width: 550, height: 550, borderRadius: '50%', overflow: 'hidden',
          background: '#f6e7c8', boxShadow: `0 0 0 12px ${DOURADO}, 0 0 0 20px ${VERDE}, 0 30px 60px rgba(0,0,0,.45)`,
        }}>
          <FotoDestaque foto={p?.foto ?? null} reserva={
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: TITULO, fontSize: p ? 230 : 300, fontWeight: 700, color: VERMELHO,
            }}>
              {p ? iniciais(p.nome) : '?'}
            </div>
          } />
        </div>
        <Gorro style={{
          position: 'absolute', left: 20, top: -40, width: 330, transform: 'rotate(-22deg)',
          animation: 'natal-gorro 1000ms cubic-bezier(.2, 1.5, .4, 1) 500ms both',
        }} />
        <div style={{
          position: 'absolute', right: -30, top: 120, padding: '14px 34px', borderRadius: 999,
          background: VERMELHO, color: '#fff', fontFamily: TITULO, fontSize: 56, fontWeight: 700,
          transform: 'rotate(8deg)', boxShadow: `0 10px 0 ${VERMELHO_ESCURO}, 0 20px 40px rgba(0,0,0,.35)`,
          animation: 'natal-pula 800ms cubic-bezier(.2, 1.6, .4, 1) 850ms both',
        }}>
          {p ? 'Ho ho ho!' : 'Quem será?'}
        </div>
      </div>

      <Presente x={850} y={900} l={120} a={86} cor={VERDE_CLARO} fita={DOURADO} atraso={700} />
      <Presente x={950} y={928} l={90} a={58} cor={VERMELHO} fita="#fff" atraso={800} />

      {/* O cartão do nome. */}
      <div style={{
        position: 'absolute', left: 1000, right: 120, top: 220, bottom: 200, borderRadius: 44, background: PAPEL,
        boxShadow: `0 0 0 10px ${VERMELHO}, 0 0 0 18px #f6e7c8, 0 36px 80px rgba(0,0,0,.5)`,
        overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '76px 60px 56px', animation: 'natal-cai 900ms cubic-bezier(.2, 1.2, .4, 1) 200ms both',
      }}>
        {/* A faixa de bengala doce. */}
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 30,
          background: `repeating-linear-gradient(45deg, ${VERMELHO} 0 26px, #fff 26px 52px)`,
        }} />
        {d.quandoNaTela && (
          <div style={{ padding: '8px 28px', borderRadius: 999, background: '#e6f2ea', color: VERDE, fontSize: 32, fontWeight: 700 }}>
            {d.quandoNaTela}
          </div>
        )}
        <div style={{ fontFamily: TITULO, fontSize: caber(d.titulo, 700, 100, 0.5, 56), fontWeight: 700, color: VERDE, lineHeight: 1.1, marginTop: 22 }}>
          {d.titulo}
        </div>
        <div style={{
          fontSize: caber(d.nome, 700, 124, 0.6, 58), fontWeight: 900, color: VERMELHO, lineHeight: 1.05, marginTop: 14,
          whiteSpace: 'nowrap',
        }}>
          {d.nome}
        </div>
        {d.onde && <div style={{ fontSize: 42, fontWeight: 700, color: TINTA, opacity: 0.75, marginTop: 14 }}>{d.onde}</div>}
        {!p && <div style={{ fontSize: 38, fontWeight: 700, marginTop: 24, maxWidth: 640, color: TINTA }}>{d.motivo}</div>}

        {d.valor && (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* O valor numa fita dourada, com as pontas cortadas. */}
            <div style={{
              padding: '18px 76px', background: `linear-gradient(180deg, ${DOURADO}, #dba22a)`,
              color: VERMELHO_ESCURO, fontSize: caber(d.valor, 560, 84, 0.6, 52), fontWeight: 900,
              clipPath: 'polygon(0 0, 100% 0, 95% 50%, 100% 100%, 0 100%, 5% 50%)',
            }}>
              {d.valor}
            </div>
            {d.pagamentos > 0 && <div style={{ fontSize: 34, fontWeight: 700, marginTop: 20, opacity: 0.75 }}>{emPagamentos(d.pagamentos)}</div>}
          </div>
        )}
      </div>

      <Animacoes css={`
        @keyframes natal-neve  { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(var(--deriva), 1140px, 0); } }
        @keyframes natal-pisca { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes natal-pula  { from { opacity: 0; transform: scale(.5); } to { opacity: 1; } }
        @keyframes natal-cai   { from { opacity: 0; transform: translateY(-70px) rotate(-2deg); } to { opacity: 1; transform: none; } }
        @keyframes natal-gorro { from { opacity: 0; transform: translateY(-140px) rotate(-60deg); } to { opacity: 1; transform: rotate(-22deg); } }
      `} />
    </div>
  );
}
