import { useId, type CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { useModoLeve } from '@/lib/modoLeve';
import { cn } from '@/lib/utils';
import './arvore.css';

/*
 * A árvore de Natal do «Progresso da meta» (`CardMetaDonut`), no lugar do anel.
 *
 * Quanto mais perto da meta, mais enfeitada:
 *   - as 28 luzinhas acendem de baixo para cima, de 3% a 90%;
 *   - as bolas, as bengalas e os presentes aparecem ao longo do caminho;
 *   - em 100% a estrela do topo acende, e a árvore fica soltando brilho dourado.
 *
 * Ao abrir, o que já foi conquistado acende em sequência — as luzes uma a uma,
 * depois os enfeites, por último a estrela. Tudo CSS (`arvore.css`); nenhum
 * quadro de JavaScript. No modo leve fica tudo aceso e parado.
 */

const CX = 80;

/** Um andar da árvore: lados levemente côncavos e a barra em ondinhas. */
function andar(topo: number, base: number, meia: number, ondas: number) {
  const curvaY = topo + (base - topo) * 0.62;
  let d = `M${CX - 2.4} ${topo + 1.4}Q${CX} ${topo - 1.8} ${CX + 2.4} ${topo + 1.4}`;
  d += `Q${CX + meia * 0.4} ${curvaY} ${CX + meia} ${base}`;
  const passo = (meia * 2) / ondas;
  for (let i = 0; i < ondas; i++) {
    const x0 = CX + meia - i * passo;
    const x1 = x0 - passo;
    d += `Q${(x0 + x1) / 2} ${base + 8} ${x1} ${base}`;
  }
  return `${d}Q${CX - meia * 0.4} ${curvaY} ${CX - 2.4} ${topo + 1.4}Z`;
}

const ANDARES = [
  { d: andar(84, 158, 62, 6), base: 158, meia: 62 },
  { d: andar(52, 118, 47, 5), base: 118, meia: 47 },
  { d: andar(26, 80, 31, 4), base: 80, meia: 31 },
] as const;

type Ponto = readonly [number, number];
/** Os fios de luz, de baixo para cima: início, controle e fim da curva. */
const FIOS: { de: Ponto; ctrl: Ponto; ate: Ponto; n: number }[] = [
  { de: [37, 143], ctrl: [80, 159], ate: [125, 146], n: 9 },
  { de: [110, 134], ctrl: [80, 146], ate: [52, 128], n: 7 },
  { de: [55, 93], ctrl: [80, 114], ate: [106, 99], n: 7 },
  { de: [95, 60], ctrl: [80, 70], ate: [66, 54], n: 5 },
];
const CORES_LUZ = ['#FF5A5A', '#FFC93D', '#4DA8FF', '#5BE38A', '#FF7AD0'] as const;

const naCurva = (de: Ponto, c: Ponto, ate: Ponto, t: number): Ponto => {
  const u = 1 - t;
  return [u * u * de[0] + 2 * u * t * c[0] + t * t * ate[0], u * u * de[1] + 2 * u * t * c[1] + t * t * ate[1]];
};

/** Em sequência de acender: a primeira é a da esquerda, embaixo. */
const LUZES = FIOS.flatMap(({ de, ctrl, ate, n }) =>
  Array.from({ length: n }, (_, i) => naCurva(de, ctrl, ate, (i + 0.5) / n)),
).map(([x, y], k, todas) => ({
  x, y, cor: k % CORES_LUZ.length,
  limiar: 3 + (k * 87) / (todas.length - 1),
}));

type Bola = { x: number; y: number; r: number; cor: string; brilho: string; limiar: number };
const BOLAS: Bola[] = [
  { x: 62, y: 143, r: 4.4, cor: '#E23B3B', brilho: '#FF9C9C', limiar: 8 },
  { x: 100, y: 144, r: 4.2, cor: '#E8A915', brilho: '#FFE28A', limiar: 20 },
  { x: 66, y: 111, r: 4, cor: '#2F7FE0', brilho: '#9CCBFF', limiar: 28 },
  { x: 98, y: 87, r: 3.4, cor: '#E8A915', brilho: '#FFE28A', limiar: 38 },
  { x: 74, y: 72, r: 3.2, cor: '#E0559C', brilho: '#FFB1D8', limiar: 46 },
  { x: 47, y: 156, r: 3.6, cor: '#2F7FE0', brilho: '#9CCBFF', limiar: 52 },
  { x: 118, y: 141, r: 3.8, cor: '#8A4FD8', brilho: '#CDB0FF', limiar: 58 },
  { x: 96, y: 112, r: 3.8, cor: '#E23B3B', brilho: '#FF9C9C', limiar: 66 },
  { x: 88, y: 44, r: 2.8, cor: '#E8A915', brilho: '#FFE28A', limiar: 74 },
  { x: 104, y: 126, r: 3.4, cor: '#E23B3B', brilho: '#FF9C9C', limiar: 82 },
];
const BENGALAS = [
  { x: 49, y: 101, limiar: 42, giro: -8 },
  { x: 86, y: 139, limiar: 86, giro: 10 },
];
type Presente = { x: number; y: number; w: number; h: number; caixa: string; fita: string; limiar: number };
const PRESENTES: Presente[] = [
  { x: 40, y: 159, w: 22, h: 17, caixa: '#D94444', fita: '#F5C542', limiar: 30 },
  { x: 99, y: 162, w: 20, h: 14, caixa: '#3F7FD9', fita: '#F4F7FB', limiar: 60 },
  { x: 64, y: 166, w: 14, h: 11, caixa: '#3BA15F', fita: '#E23B3B', limiar: 92 },
];
/** As faíscas douradas da meta batida: [x, y, atraso, tamanho]. */
const FAISCAS = [
  [42, 120, 0, 1], [118, 112, -0.6, .8], [60, 70, -1.2, .7], [104, 64, -1.8, .9], [30, 150, -2.4, .8],
  [132, 146, -0.3, 1], [76, 100, -0.9, .6], [92, 136, -1.5, .7], [52, 40, -2.1, .6], [110, 36, -2.7, .7],
  [24, 100, -1, .6], [138, 96, -2, .6], [80, 150, -0.5, .5], [66, 128, -1.7, .5],
] as const;

const ESTRELA = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.8 : 11.5;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(CX + r * Math.cos(a)).toFixed(2)},${(19 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
})();

const PASSO_LUZ = 0.07;  // s entre uma luz e a próxima ao abrir

export function ArvoreDaMeta({ pct, rotulo }: { pct: number; rotulo: string }) {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `url(#${id}-${n})`;
  const { resolvedTheme } = useTheme();
  const claro = !ehTemaEscuro(resolvedTheme);
  const leve = useModoLeve();
  const p = Math.max(0, Math.min(100, pct));
  const completa = p >= 100;

  const acesas = LUZES.filter(l => p >= l.limiar).length;
  // A ordem de entrada ao abrir: luzes, depois os enfeites, por último a estrela.
  const fimDasLuzes = acesas * PASSO_LUZ;
  const atraso = (s: number): CSSProperties => ({ '--a': `${s.toFixed(2)}s` } as CSSProperties);

  /*
   * (10/11/2026, PCs fracos) O que anima SEM FIM — as luzes que piscam e, com a
   * meta batida, a aura, as faíscas e o brilho da estrela — mora numa camada
   * HTML em volta do desenho (`.av-por-tras`, `.av-por-cima`): a placa de vídeo
   * anima caixa HTML sozinha; dentro do SVG, cada animação refazia o estilo e
   * repintava o card a cada quadro. O SVG só tem o que acende uma vez e fica.
   */
  const pisca = (k: number) => k % 3 === 0;
  return (
    <div className={cn('nt-arvore-caixa', completa && 'completa', leve && 'quieto')}>
    {completa && <span className="av-por-tras av-aura" aria-hidden="true" />}
    <svg
      viewBox="0 0 160 200" width={160} height={200}
      className={cn('nt-arvore', claro && 'nt-claro', completa && 'completa', leve && 'quieto')}
      role="img" aria-label={`Árvore de Natal: ${rotulo} da meta`}
    >
      <defs>
        <linearGradient id={`${id}-folha`} x1="0" x2="1" y1="0" y2=".35">
          <stop offset="0" stopColor="#4DB87C" />
          <stop offset=".5" stopColor="#2E9259" />
          <stop offset="1" stopColor="#1C6A41" />
        </linearGradient>
        <linearGradient id={`${id}-tronco`} x1="0" x2="1">
          <stop offset="0" stopColor="#6E4128" />
          <stop offset=".45" stopColor="#9A6440" />
          <stop offset="1" stopColor="#5E351F" />
        </linearGradient>
        <linearGradient id={`${id}-chao`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor={claro ? '#D2E1EE' : '#DCE8F3'} />
        </linearGradient>
        <radialGradient id={`${id}-brilho-estrela`}>
          <stop offset="0" stopColor="#FFF4C2" stopOpacity=".95" />
          <stop offset=".4" stopColor="#FFD54F" stopOpacity=".45" />
          <stop offset="1" stopColor="#FFC93D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ouro`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FFF1A8" />
          <stop offset=".5" stopColor="#FFD23F" />
          <stop offset="1" stopColor="#F0A500" />
        </linearGradient>
        {CORES_LUZ.map((c, i) => (
          <radialGradient key={c} id={`${id}-halo-${i}`}>
            <stop offset="0" stopColor={c} stopOpacity=".9" />
            <stop offset=".35" stopColor={c} stopOpacity=".38" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
        {ANDARES.slice(0, 2).map((a, i) => (
          <clipPath key={i} id={`${id}-recorte-${i}`}><path d={a.d} /></clipPath>
        ))}
      </defs>

      {/* Tronco e chão de neve */}
      <rect x="72" y="148" width="16" height="28" rx="3" fill={u('tronco')} />
      <path d="M76 154v18M82.5 152v20" stroke="#4E2C19" strokeWidth=".7" opacity=".5" strokeLinecap="round" />
      <ellipse className="av-chao" cx={CX} cy="179" rx="68" ry="11.5" fill={u('chao')} />
      <ellipse cx="58" cy="174.5" rx="16" ry="2.2" fill="#FFFFFF" opacity=".8" />

      {/* Os três andares, cada um com a sombra do de cima e neve nas pontas */}
      {ANDARES.map((a, i) => (
        <g key={i}>
          {i > 0 && (
            <path d={a.d} transform="translate(0 3.6)" fill="#10432A" opacity=".42" clipPath={u(`recorte-${i - 1}`)} />
          )}
          <path d={a.d} fill={u('folha')} />
          <ellipse cx={CX - a.meia + 4.5} cy={a.base - 1.2} rx="6" ry="2.6" fill="#FFFFFF" transform={`rotate(-24 ${CX - a.meia + 4.5} ${a.base - 1.2})`} />
          <ellipse cx={CX + a.meia - 4.5} cy={a.base - 1.2} rx="6" ry="2.6" fill="#F1F6FA" transform={`rotate(24 ${CX + a.meia - 4.5} ${a.base - 1.2})`} />
          <ellipse cx={CX - a.meia * 0.12} cy={a.base + 1.6} rx="4.2" ry="2" fill="#FFFFFF" opacity=".92" />
        </g>
      ))}

      {/* Os fios das luzinhas */}
      {FIOS.map(({ de, ctrl, ate }, i) => (
        <path key={i} d={`M${de[0]} ${de[1]}Q${ctrl[0]} ${ctrl[1]} ${ate[0]} ${ate[1]}`} className="av-fio" fill="none" />
      ))}

      {/* Bengalas e bolas */}
      {BENGALAS.filter(b => p >= b.limiar).map(b => (
        <g key={b.x} transform={`translate(${b.x} ${b.y}) rotate(${b.giro})`}>
          <g className="av-surge" style={atraso(fimDasLuzes + 0.1)}>
            <path d="M0 10 V2.4 A2.6 2.6 0 0 1 5.2 2.4 V3.4" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M0 10 V2.4 A2.6 2.6 0 0 1 5.2 2.4 V3.4" stroke="#E23B3B" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1.6 1.6" fill="none" />
          </g>
        </g>
      ))}
      {BOLAS.filter(b => p >= b.limiar).map((b, i) => (
        <g key={b.x} transform={`translate(${b.x} ${b.y})`}>
          <g className="av-surge av-balanca" style={atraso(fimDasLuzes * 0.4 + i * 0.12)}>
            <path d={`M0 ${-b.r - 2.6} v1.4`} stroke="#C9A64A" strokeWidth=".6" />
            <rect x="-1.3" y={-b.r - 1.6} width="2.6" height="1.8" rx=".4" fill="#D9B24A" />
            <circle r={b.r} fill={b.cor} />
            <circle r={b.r} fill="none" stroke="#000000" strokeOpacity=".12" strokeWidth=".5" />
            <ellipse cx={-b.r * 0.35} cy={-b.r * 0.38} rx={b.r * 0.34} ry={b.r * 0.22} fill={b.brilho} opacity=".9" transform={`rotate(-35 ${-b.r * 0.35} ${-b.r * 0.38})`} />
            <circle cx={b.r * 0.4} cy={b.r * 0.45} r={b.r * 0.14} fill="#FFFFFF" opacity=".5" />
          </g>
        </g>
      ))}

      {/* As luzinhas: apagadas são vidro escuro; acesas brilham e piscam */}
      {LUZES.map((l, k) => {
        const acesa = k < acesas;
        const estilo = { ...atraso(k * PASSO_LUZ), '--t': `${(2.2 + ((k * 7) % 5) * 0.35).toFixed(2)}s` } as CSSProperties;
        return (
          <g key={k} transform={`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)})`}>
            {/* Uma em cada três pisca (o halo dela é da camada HTML, `.av-por-cima`); as outras acendem e ficam. */}
            {acesa && !pisca(k) && <circle className="av-halo" r="7" fill={u(`halo-${l.cor}`)} style={estilo} />}
            <rect x="-1" y="-.6" width="2" height="1.6" rx=".3" fill="#2B3A31" />
            <ellipse cy="2.6" rx="1.9" ry="2.5" className={cn('av-lampada', acesa && 'acesa')}
              fill={acesa ? CORES_LUZ[l.cor] : '#4A5A51'} style={estilo} />
            <ellipse cx="-.6" cy="1.8" rx=".5" ry=".8" fill="#FFFFFF" opacity={acesa ? 0.8 : 0.25} />
          </g>
        );
      })}

      {/* Presentes embaixo da árvore */}
      {PRESENTES.filter(pr => p >= pr.limiar).map(pr => (
        <g key={pr.x} className="av-presente" style={atraso(fimDasLuzes + 0.25)}>
          <rect x={pr.x} y={pr.y} width={pr.w} height={pr.h} rx="1.6" fill={pr.caixa} />
          <rect x={pr.x - 0.8} y={pr.y - 1.6} width={pr.w + 1.6} height="4" rx="1.2" fill={pr.caixa} />
          <rect x={pr.x - 0.8} y={pr.y - 1.6} width={pr.w + 1.6} height="4" rx="1.2" fill="#FFFFFF" opacity=".15" />
          <rect x={pr.x + pr.w / 2 - 1.5} y={pr.y - 1.6} width="3" height={pr.h + 1.6} fill={pr.fita} />
          <path d={`M${pr.x + pr.w / 2} ${pr.y - 1.6} q-5 -5 -6 -1 q1 3 6 1 q5 -5 6 -1 q-1 3 -6 1Z`} fill={pr.fita} />
          <circle cx={pr.x + pr.w / 2} cy={pr.y - 1.6} r="1.3" fill={pr.fita} />
        </g>
      ))}

      {/* A estrela: apagada até a meta; batida, acende e irradia */}
      {completa && (
        <g className="av-raios" style={atraso(fimDasLuzes + 0.6)}>
          <circle cx={CX} cy="19" r="30" fill={u('brilho-estrela')} />
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d={`M${CX - 1.4} 19 L${CX} -8 L${CX + 1.4} 19Z`} fill="#FFE07A" opacity=".55" transform={`rotate(${i * 45} ${CX} 19)`} />
          ))}
        </g>
      )}
      <polygon points={ESTRELA} className={cn('av-estrela', completa && 'acesa')}
        fill={completa ? u('ouro') : '#CFC4A0'} style={atraso(fimDasLuzes + 0.6)} />
    </svg>
    <div className="av-por-cima" aria-hidden="true">
      {LUZES.map((l, k) => k < acesas && pisca(k) && (
        // A caixa de fora acende na vez dela; a de dentro pisca (uma animação por caixa).
        <span key={k} className="av-halo-html"
          style={{ left: l.x - 7, top: l.y - 7, ...atraso(k * PASSO_LUZ), ['--cor' as string]: CORES_LUZ[l.cor] } as CSSProperties}>
          <i style={{ '--t': `${(2.2 + ((k * 7) % 5) * 0.35).toFixed(2)}s`, ...atraso(k * PASSO_LUZ + 0.5) } as CSSProperties} />
        </span>
      ))}
      {completa && <span className="av-estrela-brilho" style={{ left: CX - 3 - 1.4, top: 15.4 - 1.4 }} />}
      {completa && FAISCAS.map(([x, y, d, s], i) => (
        <span key={i} className="av-faisca"
          style={{ left: x - 3.4 * s, top: y - 3.4 * s, width: 6.8 * s, height: 6.8 * s, '--d': `${d}s` } as CSSProperties}>
          <svg viewBox="-3.4 -3.4 6.8 6.8">
            <path d={i % 3 === 2 ? 'M0-1.4A1.4 1.4 0 1 1 0 1.4 1.4 1.4 0 1 1 0-1.4Z' : 'M0-3.4L.7-.7 3.4 0 .7.7 0 3.4-.7.7-3.4 0-.7-.7Z'} />
          </svg>
        </span>
      ))}
    </div>
    </div>
  );
}
