/**
 * PetAura — mascote do PaguePlay: coelhinha espiritual lilás que levita.
 * SVG em camadas: corpo → rosto (humor) → roupa (skin) → zzz.
 */
import { cn } from '@/lib/utils';
import type { PetHumor, PetRoupa } from './petConfig';

export interface PetSvgProps {
  humor: PetHumor;
  roupa: PetRoupa;
  /** micro-animação ocasional do widget */
  micro?: 'none' | 'pulinho';
  className?: string;
}

export function PetAura({ humor, roupa, micro = 'none', className }: PetSvgProps) {
  const animCorpo =
    humor === 'feliz'    ? 'pet-anim-feliz'
    : humor === 'dormindo' ? 'pet-anim-dormindo'
    : humor === 'jogando'  ? 'pet-anim-breathe' // sentadinha, concentrada
    : micro === 'pulinho' ? 'pet-anim-pulinho'
    : 'pet-anim-float';

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label="Aura, a mascote">
      {/* sombra no chão (ela levita) */}
      <ellipse className="pet-anim-sombra" cx="100" cy="182" rx="44" ry="8" fill="currentColor" opacity=".14" />

      <g className={animCorpo}>
        {/* orelhas etéreas */}
        <g className="pet-anim-wiggle">
          <path d="M78 62 C 62 40 60 18 72 10 C 84 4 90 22 88 40 C 87 50 84 58 82 62 Z" fill="#b7b0e8" />
          <path d="M76 50 C 70 36 70 22 76 16" stroke="#e9e6fb" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
        <path d="M116 58 C 122 34 136 14 150 20 C 162 26 150 50 136 62 C 130 66 122 64 116 58 Z" fill="#b7b0e8" />
        <path d="M128 50 C 134 38 140 30 146 28" stroke="#e9e6fb" strokeWidth="4" fill="none" strokeLinecap="round" />

        {/* corpo fantasminha com barra ondulada */}
        <path
          d="M100 42
             C 138 42 158 72 156 106
             C 155 128 148 142 140 150
             C 135 155 130 147 124 152
             C 118 157 113 149 107 154
             C 101 159 95 151 89 155
             C 83 159 77 151 71 147
             C 56 137 45 122 44 102
             C 42 70 64 42 100 42 Z"
          fill="#cfc9f2"
        />
        {/* faixa de brilho */}
        <path d="M56 118 C 76 106 122 132 148 112" stroke="#e9e6fb" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".9" />
        <circle cx="64" cy="70" r="2.5" fill="#ffffff" opacity=".8" />
        <circle cx="142" cy="86" r="2" fill="#ffffff" opacity=".7" />

        {/* rosto */}
        {humor === 'dormindo' ? (
          <>
            <path d="M76 96 Q 83 102 90 96" stroke="#322b47" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M112 96 Q 119 102 126 96" stroke="#322b47" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="pet-anim-blink">
            <circle cx="83" cy="96" r="7" fill="#322b47" />
            <circle cx="85.5" cy="93.5" r="2.4" fill="#fff" />
            <circle cx="119" cy="96" r="7" fill="#322b47" />
            <circle cx="121.5" cy="93.5" r="2.4" fill="#fff" />
          </g>
        )}
        {humor === 'feliz' ? (
          <path d="M94 112 Q 101 122 108 112 Z" fill="#322b47" />
        ) : (
          <path d="M96 112 Q 101 117 106 112" stroke="#322b47" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        <ellipse cx="70" cy="108" rx="6" ry="4" fill="#f3b8c9" opacity=".7" />
        <ellipse cx="132" cy="108" rx="6" ry="4" fill="#f3b8c9" opacity=".7" />

        {/* roupas (camadas) */}
        {roupa === 'cachecol' && (
          <g>
            <path d="M62 128 C 84 140 118 140 140 128 L 138 142 C 116 152 86 152 64 142 Z" fill="#e5734f" />
            <path d="M124 138 L 132 164 L 118 162 L 116 142 Z" fill="#d95f3b" />
            <path d="M62 133 C 84 144 118 144 140 133" stroke="#f2926f" strokeWidth="3" fill="none" opacity=".8" />
          </g>
        )}
        {roupa === 'chapeu' && (
          <g>
            <path d="M100 4 L 116 40 L 84 40 Z" fill="#f2c14e" />
            <path d="M100 4 L 116 40 L 84 40 Z" fill="#e5734f" opacity=".25" />
            <circle cx="100" cy="4" r="5" fill="#e5734f" />
            <path d="M84 40 Q 100 48 116 40" stroke="#d9a832" strokeWidth="4" fill="none" />
          </g>
        )}

        {/* zzz */}
        {humor === 'dormindo' && (
          <g fill="#8f86d8" fontFamily="inherit" fontWeight="700">
            <text className="pet-anim-zzz" x="146" y="60" fontSize="18">z</text>
            <text className="pet-anim-zzz-2" x="158" y="46" fontSize="13">z</text>
          </g>
        )}

        {/* videogame: controle nas patinhas + consolinho no chão */}
        {humor === 'jogando' && (
          <g>
            <path d="M100 146 C 94 158 74 156 62 164" stroke="#4a4458" strokeWidth="2.5" fill="none" />
            <rect x="42" y="160" width="28" height="13" rx="3" fill="#4a4458" />
            <rect x="46" y="163.5" width="9" height="3.5" rx="1.7" fill="#8f86d8" />
            <circle cx="64" cy="166.5" r="2.2" fill="#e5734f" />
            <g className="pet-anim-controle">
              <rect x="79" y="128" width="44" height="19" rx="9.5" fill="#4a4458" />
              <rect x="86" y="135" width="9" height="3.2" rx="1.6" fill="#cfc9f2" />
              <rect x="88.9" y="132.1" width="3.2" height="9" rx="1.6" fill="#cfc9f2" />
              <circle cx="112" cy="134" r="2.7" fill="#e5734f" />
              <circle cx="117.5" cy="139.5" r="2.7" fill="#f2c14e" />
            </g>
            {/* patinhas segurando */}
            <ellipse cx="82" cy="140" rx="8" ry="6.5" fill="#b7b0e8" />
            <ellipse cx="120" cy="140" rx="8" ry="6.5" fill="#b7b0e8" />
            {/* efeitos do jogo */}
            <g fontFamily="inherit" fontWeight="700">
              <text className="pet-anim-zzz" x="140" y="70" fontSize="13" fill="#8f86d8">★</text>
              <text className="pet-anim-zzz-2" x="152" y="56" fontSize="11" fill="#e5734f">♪</text>
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
