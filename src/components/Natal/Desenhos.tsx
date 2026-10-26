import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { indiceDaPessoa } from '@/components/Halloween/tema';
import { EVENTO_GLOBO, useTemaNatal } from './tema';
import './desenhos.css';

// ── Globo de neve do chat ─────────────────────────────────────────────────────

/*
 * A bolha do chat vira um globo de neve: casinha, dois pinheiros e o chão
 * branco dentro do vidro, numa base de madeira com plaquinha dourada.
 *
 * Sem mensagem: poucos flocos caindo devagar e o reflexo do vidro respirando.
 * Chegou mensagem (`nevando`): o globo chacoalha uma vez, a neve vira
 * redemoinho e a janela da casinha acende — e fica assim até a pessoa ler.
 *
 * Tudo em CSS (`desenhos.css`): nenhum quadro de JavaScript por floco.
 */

/** [x, atraso, duração, deriva, raio] — fixos: o globo é o mesmo em toda tela. */
const FLOCOS_LEVES = [
  [24, 0, 11, 3, 1.2], [33, -4, 13, -2, 0.9], [42, -8, 10, 2, 1.3], [51, -2, 12, -3, 1],
  [60, -6, 14, 2, 1.2], [68, -10, 11, -2, 0.9], [76, -3, 13, 3, 1.1], [46, -12, 15, -1, 0.8],
  [57, -1, 10, 1, 1],
] as const;
const FLOCOS_FORTES = Array.from({ length: 24 }, (_, i) => [
  16 + ((i * 37) % 68),
  -((i * 0.53) % 5),
  3.6 + ((i * 7) % 5) * 0.55,
  0,
  0.8 + ((i * 3) % 4) * 0.22,
] as const);

const ID = 'nt-globo';

export function GloboDeNeve({ nevando: comMensagem }: { nevando: boolean }) {
  // A prévia (`PreviaNatal`) liga e desliga a neve sem precisar de mensagem.
  const [teste, setTeste] = useState(false);
  useEffect(() => {
    const alternar = () => setTeste(t => !t);
    window.addEventListener(EVENTO_GLOBO, alternar);
    return () => window.removeEventListener(EVENTO_GLOBO, alternar);
  }, []);
  const nevando = comMensagem || teste;
  // Chacoalha só na chegada: de «sem mensagem» para «com mensagem».
  const [chacoalha, setChacoalha] = useState(false);
  const antes = useRef(nevando);
  useEffect(() => {
    if (nevando && !antes.current) {
      setChacoalha(true);
      const t = window.setTimeout(() => setChacoalha(false), 1300);
      antes.current = nevando;
      return () => window.clearTimeout(t);
    }
    antes.current = nevando;
  }, [nevando]);

  return (
    <svg viewBox="0 0 100 112" className={cn('nt-globo', nevando && 'nevando', chacoalha && 'chacoalha')} aria-hidden="true">
      <defs>
        <clipPath id={`${ID}-dentro`}><circle cx="50" cy="46" r="36.6" /></clipPath>
        <radialGradient id={`${ID}-ceu`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#F4FCFB" />
          <stop offset=".55" stopColor="#CDEBEA" />
          <stop offset="1" stopColor="#93CBCF" />
        </radialGradient>
        <radialGradient id={`${ID}-luz`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFD56B" stopOpacity=".75" />
          <stop offset="1" stopColor="#FFD56B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${ID}-madeira`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7A4428" />
          <stop offset=".35" stopColor="#A2643D" />
          <stop offset=".7" stopColor="#8B5131" />
          <stop offset="1" stopColor="#6A3A21" />
        </linearGradient>
      </defs>

      <ellipse cx="50" cy="108.5" rx="40" ry="3.2" fill="oklch(0.2 0.03 200 / .28)" />

      <g className="globo-mexe">
        {/* Dentro do vidro */}
        <g clipPath={`url(#${ID}-dentro)`}>
          <rect x="10" y="6" width="80" height="80" fill={`url(#${ID}-ceu)`} />
          <circle className="luz-casa" cx="61" cy="61" r="16" fill={`url(#${ID}-luz)`} />
          <path d="M8 70 C22 62 36 66 50 63 C64 60 78 64 92 67 L92 90 L8 90 Z" fill="#FBFDFF" />
          <Pinheiro x={27} y={68} s={1.05} />
          <Pinheiro x={39} y={66} s={0.72} />
          <Casinha />
          <Pinheiro x={77} y={69} s={0.82} />
          <path d="M8 76 C26 70 44 75 60 72 C74 69 84 72 92 74 L92 90 L8 90 Z" fill="#E6F0F5" />
          <path d="M8 79 C30 75 50 79 70 77 C80 76 88 77 92 78 L92 90 L8 90 Z" fill="#FFFFFF" />

          <g className="neve-leve">
            {FLOCOS_LEVES.map(([x, d, t, dx, r], i) => (
              <circle key={i} className="floco" cx={x} cy="8" r={r}
                style={{ ['--d' as string]: `${d}s`, ['--t' as string]: `${t}s`, ['--dx' as string]: `${dx}px` }} />
            ))}
          </g>
          <g className="neve-forte">
            {FLOCOS_FORTES.map(([x, d, t, , r], i) => (
              <circle key={i} className={cn('floco', i % 2 && 'avesso')} cx={x} cy="8" r={r}
                style={{ ['--d' as string]: `${d}s`, ['--t' as string]: `${t}s` }} />
            ))}
          </g>
        </g>

        {/* O vidro */}
        <circle cx="50" cy="46" r="37.4" fill="none" stroke="#FFFFFF" strokeOpacity=".75" strokeWidth="1.4" />
        <circle cx="50" cy="46" r="38.2" fill="none" stroke="oklch(0.35 0.04 210 / .35)" strokeWidth=".7" />
        <path className="reflexo" d="M20.5 38 A31 31 0 0 1 40 14.5" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
        <ellipse className="reflexo" cx="66" cy="19.5" rx="4.6" ry="2.4" transform="rotate(28 66 19.5)" fill="#FFFFFF" />
        <path d="M24 70 A31 31 0 0 0 76 70" fill="none" stroke="#FFFFFF" strokeOpacity=".35" strokeWidth="1.2" strokeLinecap="round" />

        {/* A base de madeira */}
        <rect x="25" y="79" width="50" height="6.5" rx="2" fill="#8A5233" />
        <rect x="25" y="79" width="50" height="1.6" rx=".8" fill="#B47B52" opacity=".8" />
        <path d="M21 85 H79 L83 101.5 H17 Z" fill={`url(#${ID}-madeira)`} />
        <path d="M21 85 H79 L79.5 87 H20.5 Z" fill="#C08A5F" opacity=".55" />
        <rect x="13" y="101" width="74" height="7" rx="2.6" fill="#673820" />
        <rect x="13" y="101" width="74" height="1.6" rx=".8" fill="#8F5A37" />
        <rect x="39.5" y="90" width="21" height="6.5" rx="1.2" fill="#E8BB4E" stroke="#A97B1E" strokeWidth=".6" />
        <path d="M43 93.2 H57" stroke="#9A6C14" strokeWidth=".8" strokeLinecap="round" strokeDasharray="2.2 1.3" />
      </g>
    </svg>
  );
}

function Pinheiro({ x, y, s }: { x: number; y: number; s: number }) {
  const p = (dx: number, dy: number) => `${x + dx * s},${y + dy * s}`;
  return (
    <g>
      <rect x={x - 1.3 * s} y={y - 1 * s} width={2.6 * s} height={4 * s} fill="#6B4026" />
      <polygon points={`${p(0, -11)} ${p(-10, 1)} ${p(10, 1)}`} fill="#25794A" />
      <polygon points={`${p(0, -16)} ${p(-8, -5)} ${p(8, -5)}`} fill="#2E8C55" />
      <polygon points={`${p(0, -21)} ${p(-6, -11)} ${p(6, -11)}`} fill="#37A062" />
      {/* Neve nos galhos */}
      <path d={`M${p(-6, -11)} Q${p(-3, -12.5)} ${p(0, -11.4)} Q${p(3, -12.5)} ${p(6, -11)}`} fill="none" stroke="#FFFFFF" strokeWidth={1.1 * s} strokeLinecap="round" />
      <path d={`M${p(-8, -5)} Q${p(-4, -6.6)} ${p(0, -5.4)} Q${p(4, -6.6)} ${p(8, -5)}`} fill="none" stroke="#FFFFFF" strokeWidth={1.1 * s} strokeLinecap="round" />
      <path d={`M${p(-2.4, -17.2)} L${p(0, -21)} L${p(2.4, -17.2)}`} fill="#FFFFFF" />
    </g>
  );
}

function Casinha() {
  return (
    <g>
      <rect x="64" y="49" width="3.2" height="6" fill="#7C3A2A" />
      <rect x="52.5" y="56.5" width="16" height="11.5" fill="#B5523B" />
      <rect x="52.5" y="56.5" width="16" height="1.5" fill="#8E3B28" />
      <rect className="janela" x="56" y="59.4" width="4.6" height="4" rx=".4" />
      <path d="M58.3 59.4 V63.4 M56 61.4 H60.6" stroke="#6B2E20" strokeWidth=".5" />
      <rect x="62.6" y="60.5" width="3.6" height="7.5" rx=".5" fill="#6B2E20" />
      <polygon points="50,57.5 60.5,48.6 71,57.5" fill="#7C3A2A" />
      <path d="M49.6 57.8 L60.5 48 L71.4 57.8 L68.2 57.8 L60.5 51 L52.8 57.8 Z" fill="#FFFFFF" />
      <path d="M50 57.6 Q60.5 46 71 57.6" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

// ── Gorro de Papai Noel nas fotos ─────────────────────────────────────────────

/** Vermelho, sombra — duas variações por pessoa, para a lista não ficar chapada. */
const CORES_GORRO = [
  ['#D7322F', '#A8201E'],
  ['#C72A3A', '#951B2A'],
  ['#E0433A', '#B02B24'],
] as const;

export function GorroNoel({ chave, className, style }: { chave: string; className?: string; style?: React.CSSProperties }) {
  const [base, sombra] = CORES_GORRO[indiceDaPessoa(chave, CORES_GORRO.length)];
  return (
    <svg viewBox="0 0 100 80" className={className} style={style} aria-hidden="true">
      <path d="M16 62 C20 38 38 14 64 11 C80 9.5 90 18 93 31 C86 27 78 27 73 31 C71 42 75 53 84 62 Z" fill={base} />
      <path d="M64 11 C80 9.5 90 18 93 31 C86 27 78 27 73 31 C71 42 75 53 84 62 L72 62 C66 50 64 36 66 24 C66 18 65 14 64 11 Z" fill={sombra} />
      <path d="M26 58 C30 40 42 24 58 18" fill="none" stroke="#FFFFFF" strokeOpacity=".22" strokeWidth="3" strokeLinecap="round" />
      <circle cx="91" cy="33" r="8.5" fill="#FAFAFA" />
      <circle cx="93" cy="35" r="5.5" fill="#E4E9EE" />
      <rect x="6" y="56" width="88" height="17" rx="8.5" fill="#FAFAFA" />
      <path d="M8 66 Q50 74 92 66 L92 64.5 A8.5 8.5 0 0 1 85.5 73 H14.5 A8.5 8.5 0 0 1 8 64.5 Z" fill="#E1E6EC" />
    </svg>
  );
}

/**
 * Mesmo jeito do chapéu de bruxa (`Halloween/Desenhos.tsx`): o gorro fica no
 * topo da foto, caído para a esquerda, quando o Natal está ligado. Fora dele,
 * devolve a foto como veio.
 */
export function ComGorro({ chave, tamanho, escala = 1.05, children }: { chave: string; tamanho: number; escala?: number; children: ReactNode }) {
  const natal = useTemaNatal();
  if (!natal || tamanho < 24) return <>{children}</>;
  return (
    <span className="nt-com-gorro" style={{ width: tamanho, height: tamanho }}>
      {children}
      <GorroNoel chave={chave} className="nt-gorro" style={{ width: tamanho * escala, bottom: `${Math.round(60 + escala * 8)}%` }} />
    </span>
  );
}
