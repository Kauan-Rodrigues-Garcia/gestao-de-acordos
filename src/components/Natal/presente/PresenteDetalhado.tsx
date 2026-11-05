/**
 * PresenteDetalhado — o presente da abertura do Natal (Cleber, 04/11/2026):
 * «bem detalhado, bem chamativo, que fica piscando bastante».
 *
 * O mesmo papel, a mesma fita e o mesmo laço do fim do vídeo (`arte.tsx`),
 * agora desenhados num SVG só: caixa com sombra nos lados, tampa com aba,
 * laço de duas alças com brilho, etiqueta pendurada, um cordão de luzinhas na
 * beirada da tampa que pisca, o reflexo que corre pelo papel e as estrelinhas
 * em volta. Aberto (`aberto`), a tampa salta e sai a luz de dentro.
 *
 * Desenhado em 160 × 176; o tamanho é o do contêiner. Só `transform` e
 * `opacity` animam (`presente.css`, `np-pd-*`).
 */
import { useId } from 'react';
import { COR_FITA, COR_FITA_SOMBRA, COR_PAPEL, COR_PAPEL_SOMBRA } from './papel';

/** As luzinhas na beirada da tampa: x e cor (alternando, como pisca-pisca). */
const LUZINHAS = [22, 38, 54, 106, 122, 138].map((x, i) => ({ x, cor: ['#ffe066', '#7cf29a', '#ff7aa8'][i % 3] }));
/** As estrelinhas em volta: posição, tamanho e o atraso do piscar. */
const ESTRELAS = [
  { x: 8, y: 44, r: 7, d: 0 }, { x: 150, y: 34, r: 9, d: 0.5 }, { x: 154, y: 118, r: 6, d: 1 },
  { x: 4, y: 132, r: 8, d: 1.4 }, { x: 128, y: 8, r: 5, d: 0.8 }, { x: 30, y: 10, r: 5, d: 1.8 },
];

const estrela = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`;

export function PresenteDetalhado({ aberto = false, className }: { aberto?: boolean; className?: string }) {
  // Ids únicos: o mesmo desenho pode estar duas vezes na tela (o que voa e o pacote).
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `${n}-${id}`;
  return (
    <svg viewBox="0 0 160 176" className={`np-pd${aberto ? ' np-pd-aberto' : ''}${className ? ` ${className}` : ''}`} aria-hidden>
      <defs>
        <pattern id={u('papel')} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill={COR_PAPEL} />
          <path d="M0 16 L16 0" stroke="rgba(255,255,255,.07)" strokeWidth="5" />
          <circle cx="4" cy="4" r="1.7" fill="rgba(255,255,255,.92)" />
          <circle cx="12" cy="12" r="1.2" fill={COR_FITA} />
          <path d="M12 2.2 L12.6 3.4 L13.8 4 L12.6 4.6 L12 5.8 L11.4 4.6 L10.2 4 L11.4 3.4 Z" fill="rgba(255,255,255,.55)" />
        </pattern>
        {/* Os lados da caixa escurecem; o meio pega a luz. */}
        <linearGradient id={u('volume')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a0007" stopOpacity=".55" />
          <stop offset=".18" stopColor="#3a0007" stopOpacity=".08" />
          <stop offset=".45" stopColor="#ffffff" stopOpacity=".12" />
          <stop offset=".8" stopColor="#3a0007" stopOpacity=".12" />
          <stop offset="1" stopColor="#3a0007" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id={u('fundo')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".28" />
          <stop offset=".25" stopColor="#000" stopOpacity="0" />
          <stop offset=".85" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id={u('fita')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={COR_FITA_SOMBRA} />
          <stop offset=".25" stopColor={COR_FITA} />
          <stop offset=".5" stopColor="#fff4c4" />
          <stop offset=".75" stopColor={COR_FITA} />
          <stop offset="1" stopColor={COR_FITA_SOMBRA} />
        </linearGradient>
        <linearGradient id={u('ouro')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c4" />
          <stop offset=".45" stopColor={COR_FITA} />
          <stop offset="1" stopColor={COR_FITA_SOMBRA} />
        </linearGradient>
        <radialGradient id={u('luz')} cx=".5" cy="1" r="1">
          <stop offset="0" stopColor="#fffdf2" />
          <stop offset=".35" stopColor="#fff1c2" stopOpacity=".95" />
          <stop offset=".7" stopColor="#f8d474" stopOpacity=".45" />
          <stop offset="1" stopColor="#eeb23c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('reflexo')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={u('corpo')}>
          <rect x="18" y="80" width="124" height="86" rx="8" />
        </clipPath>
      </defs>

      {/* A sombra no chão */}
      <ellipse cx="80" cy="170" rx="62" ry="5.5" fill="#2b0006" opacity=".28" />

      {/* A luz que sai de dentro (só aberto) */}
      <g className="np-pd-luz">
        <path d="M30 82 L4 -60 L156 -60 L130 82 Z" fill={`url(#${u('luz')})`} />
        <ellipse cx="80" cy="82" rx="58" ry="9" fill="#fffdf2" />
      </g>

      {/* O corpo da caixa */}
      <g>
        <rect x="18" y="80" width="124" height="86" rx="8" fill={`url(#${u('papel')})`} />
        <rect x="18" y="80" width="124" height="86" rx="8" fill={`url(#${u('volume')})`} />
        <rect x="18" y="80" width="124" height="86" rx="8" fill={`url(#${u('fundo')})`} />
        {/* A fita de pé, com a costura */}
        <rect x="70" y="80" width="20" height="86" fill={`url(#${u('fita')})`} />
        <path d="M72.5 82 V164 M87.5 82 V164" stroke={COR_FITA_SOMBRA} strokeWidth=".8" strokeDasharray="2.2 2.4" opacity=".7" />
        {/* O reflexo que corre pelo papel */}
        <g clipPath={`url(#${u('corpo')})`}>
          <rect className="np-pd-reflexo" x="-40" y="70" width="34" height="110" fill={`url(#${u('reflexo')})`} transform="skewX(-18)" />
        </g>
        <rect x="18.75" y="80.75" width="122.5" height="84.5" rx="7.5" fill="none" stroke={COR_PAPEL_SOMBRA} strokeWidth="1.5" />
      </g>

      {/* A etiqueta, pendurada na fita por um barbante */}
      <g className="np-pd-etiqueta">
        <path d="M90 96 C100 98 104 104 106 110" fill="none" stroke="#f6e7c8" strokeWidth="1.2" />
        <g transform="rotate(14 112 120)">
          <path d="M104 110 L122 110 L122 132 L104 132 L100 121 Z" fill="#fdf6e6" stroke="#d9c39a" strokeWidth="1" />
          <circle cx="104.5" cy="121" r="1.8" fill="#d9c39a" />
          <path d={estrela(113, 121, 5.5)} fill="#e0283a" />
        </g>
      </g>

      {/* A tampa: salta quando abre */}
      <g className="np-pd-tampa">
        <rect x="10" y="62" width="140" height="26" rx="7" fill={`url(#${u('papel')})`} />
        <rect x="10" y="62" width="140" height="26" rx="7" fill={`url(#${u('volume')})`} />
        <rect x="10" y="80" width="140" height="8" rx="4" fill="#3a0007" opacity=".28" />
        <rect x="10" y="62" width="140" height="5" rx="3" fill="#fff" opacity=".18" />
        <rect x="68" y="62" width="24" height="26" fill={`url(#${u('fita')})`} />
        <rect x="10.75" y="62.75" width="138.5" height="24.5" rx="6.5" fill="none" stroke={COR_PAPEL_SOMBRA} strokeWidth="1.5" />

        {/* O cordão de luzinhas na beirada da tampa */}
        <path d="M14 86 Q22 92 30 87 Q38 92 46 87 Q54 92 62 87 M98 87 Q106 92 114 87 Q122 92 130 87 Q138 92 146 86" fill="none" stroke="#1d5a32" strokeWidth="1.3" />
        {LUZINHAS.map((l, i) => (
          <g key={i} className="np-pd-luzinha" style={{ ['--i' as string]: i }}>
            <circle cx={l.x} cy="92" r="6" fill={l.cor} opacity=".35" />
            <ellipse cx={l.x} cy="92" rx="2.6" ry="3.4" fill={l.cor} />
            <ellipse cx={l.x - 0.8} cy="91" rx=".9" ry="1.2" fill="#fff" opacity=".8" />
          </g>
        ))}

        {/* O laço */}
        <g transform="translate(20 4)">
          <path d="M56 44 L38 80 L47 75 L51 84 L60 48 Z" fill={COR_FITA_SOMBRA} />
          <path d="M64 44 L82 80 L73 75 L69 84 L60 48 Z" fill={COR_FITA_SOMBRA} />
          <path d="M57 46 L44 74 L50 71 Z" fill="#fff4c4" opacity=".4" />
          <g className="np-pd-alca esq">
            <path d="M60 40 C44 8, 6 10, 8 32 C10 52, 42 52, 60 40 Z" fill={`url(#${u('ouro')})`} stroke={COR_FITA_SOMBRA} strokeWidth="1.5" />
            <path d="M58 38 C46 22, 22 20, 20 32 C24 29, 44 31, 58 40 Z" fill="rgba(140,80,0,.3)" />
            <path d="M18 22 C24 16 34 16 40 20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
          </g>
          <g className="np-pd-alca dir">
            <path d="M60 40 C76 8, 114 10, 112 32 C110 52, 78 52, 60 40 Z" fill={`url(#${u('ouro')})`} stroke={COR_FITA_SOMBRA} strokeWidth="1.5" />
            <path d="M62 38 C74 22, 98 20, 100 32 C96 29, 76 31, 62 40 Z" fill="rgba(140,80,0,.3)" />
            <path d="M82 18 C90 15 98 16 104 21" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
          </g>
          <rect x="50" y="30" width="20" height="18" rx="6.5" fill={`url(#${u('ouro')})`} stroke={COR_FITA_SOMBRA} strokeWidth="1.5" />
          <path d="M54 34 C58 32 62 32 66 34" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
        </g>
      </g>

      {/* As estrelinhas em volta */}
      {ESTRELAS.map((e, i) => (
        <path key={i} className="np-pd-estrela" d={estrela(e.x, e.y, e.r)} fill="#fff6cf" style={{ animationDelay: `${e.d}s` }} />
      ))}
    </svg>
  );
}
