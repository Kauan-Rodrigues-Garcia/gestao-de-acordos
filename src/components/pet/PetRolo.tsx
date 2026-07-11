/**
 * PetRolo — mascote do BookPlay: tanuki redondinho verde-acinzentado com
 * manchas laranja. SVG em camadas: corpo → rosto (humor) → roupa → zzz.
 */
import { cn } from '@/lib/utils';
import type { PetSvgProps } from './PetAura';

export function PetRolo({ humor, roupa, micro = 'none', andando = false, className }: PetSvgProps) {
  const animCorpo =
    humor === 'feliz'    ? 'pet-anim-feliz'
    : humor === 'dormindo' ? 'pet-anim-dormindo'
    : micro === 'pulinho' ? 'pet-anim-pulinho'
    : 'pet-anim-breathe';

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label="Rolo, o mascote">
      <ellipse cx="100" cy="176" rx="56" ry="9" fill="currentColor" opacity=".14" />

      {/* passinhos do passeio só no corpo — a sombra fica no chão */}
      <g className={cn(andando && 'pet-anim-anda')}>
      <g className={animCorpo}>
        {/* rabinho */}
        <g className="pet-anim-wiggle">
          <path d="M158 118 C 178 108 186 124 176 138 C 168 148 154 148 148 140 Z" fill="#64807a" />
          <path d="M170 116 C 180 118 184 128 178 136 C 173 142 164 142 160 136 Z" fill="#eba76e" />
        </g>

        {/* orelhas */}
        <circle cx="66" cy="46" r="15" fill="#3f4a48" />
        <circle cx="134" cy="46" r="15" fill="#3f4a48" />
        <circle cx="66" cy="48" r="7" fill="#eba76e" />
        <circle cx="134" cy="48" r="7" fill="#eba76e" />

        {/* corpo redondo */}
        <circle cx="100" cy="104" r="66" fill="#64807a" />
        {/* manchas laranja */}
        <ellipse cx="58" cy="86" rx="16" ry="20" fill="#eba76e" />
        <ellipse cx="146" cy="120" rx="14" ry="17" fill="#eba76e" />
        <ellipse cx="112" cy="46" rx="15" ry="10" fill="#eba76e" />
        {/* barriga */}
        <ellipse cx="100" cy="130" rx="34" ry="26" fill="#8fa39b" />
        <ellipse cx="90" cy="136" rx="10" ry="8" fill="#eba76e" opacity=".85" />

        {/* patinhas */}
        <ellipse cx="62" cy="160" rx="15" ry="10" fill="#3f4a48" />
        <ellipse cx="138" cy="160" rx="15" ry="10" fill="#3f4a48" />

        {/* máscara do rosto */}
        <ellipse cx="76" cy="88" rx="17" ry="13" fill="#3f4a48" />
        <ellipse cx="124" cy="88" rx="17" ry="13" fill="#3f4a48" />
        <ellipse cx="100" cy="104" rx="22" ry="15" fill="#f2d9bd" />

        {/* olhos */}
        {humor === 'dormindo' ? (
          <>
            <path d="M69 88 Q 76 94 83 88" stroke="#f7f3ea" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M117 88 Q 124 94 131 88" stroke="#f7f3ea" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="pet-anim-blink">
            <circle cx="76" cy="88" r="6.5" fill="#f7f3ea" />
            <circle cx="77.5" cy="89" r="3.6" fill="#2b2b26" />
            <circle cx="124" cy="88" r="6.5" fill="#f7f3ea" />
            <circle cx="125.5" cy="89" r="3.6" fill="#2b2b26" />
          </g>
        )}

        {/* focinho e boca */}
        <ellipse cx="100" cy="100" rx="6" ry="4.5" fill="#3f4a48" />
        {humor === 'feliz' ? (
          <path d="M92 108 Q 100 118 108 108 Z" fill="#3f4a48" />
        ) : (
          <path d="M94 108 Q 100 113 106 108" stroke="#3f4a48" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}

        {/* roupas (camadas) */}
        {roupa === 'cachecol' && (
          <g>
            <path d="M64 120 C 88 132 112 132 136 120 L 134 134 C 112 144 88 144 66 134 Z" fill="#e5734f" />
            <path d="M120 132 L 128 158 L 114 156 L 112 136 Z" fill="#d95f3b" />
            <path d="M64 125 C 88 136 112 136 136 125" stroke="#f2926f" strokeWidth="3" fill="none" opacity=".8" />
          </g>
        )}
        {roupa === 'chapeu' && (
          <g>
            <path d="M100 2 L 117 40 L 83 40 Z" fill="#f2c14e" />
            <path d="M100 2 L 117 40 L 83 40 Z" fill="#5b8dd9" opacity=".25" />
            <circle cx="100" cy="2" r="5" fill="#5b8dd9" />
            <path d="M83 40 Q 100 48 117 40" stroke="#d9a832" strokeWidth="4" fill="none" />
          </g>
        )}

        {/* zzz */}
        {humor === 'dormindo' && (
          <g fill="#8fa39b" fontFamily="inherit" fontWeight="700">
            <text className="pet-anim-zzz" x="150" y="52" fontSize="18">z</text>
            <text className="pet-anim-zzz-2" x="162" y="38" fontSize="13">z</text>
          </g>
        )}
      </g>
      </g>
    </svg>
  );
}
