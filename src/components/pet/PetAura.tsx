/**
 * PetAura — mascote oficial: coelhinha espiritual lilás que levita.
 * Estilo kawaii: corpo rechonchudo com barriguinha, patinhas e pezinhos,
 * orelhas etéreas em chama (gradiente), rabinho-chama, halo pulsante e
 * brilhinhos ao redor. SVG em camadas: halo → corpo → rosto (humor) →
 * roupa (skin) → efeitos (zzz / videogame).
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { PetHumor, PetRoupa } from './petConfig';

export interface PetSvgProps {
  humor: PetHumor;
  roupa: PetRoupa;
  /** micro-animação ocasional do widget */
  micro?: 'none' | 'pulinho';
  className?: string;
}

/** Brilhinho de 4 pontas (sparkle) centrado em (x, y) com "raio" s. */
const estrela = (x: number, y: number, s: number) =>
  `M ${x} ${y - s} L ${x + s * 0.28} ${y - s * 0.28} L ${x + s} ${y} ` +
  `L ${x + s * 0.28} ${y + s * 0.28} L ${x} ${y + s} L ${x - s * 0.28} ${y + s * 0.28} ` +
  `L ${x - s} ${y} L ${x - s * 0.28} ${y - s * 0.28} Z`;

export function PetAura({ humor, roupa, micro = 'none', className }: PetSvgProps) {
  // ids únicos por instância (widget + quartinho convivem na mesma página)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `aura-${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;

  const animCorpo =
    humor === 'feliz'      ? 'pet-anim-feliz'
    : humor === 'dormindo' ? 'pet-anim-dormindo'
    : humor === 'jogando'  ? 'pet-anim-breathe' // sentadinha, concentrada
    : micro === 'pulinho'  ? 'pet-anim-pulinho'
    : 'pet-anim-float';

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label="Aura, a mascote">
      <defs>
        <linearGradient id={id('corpo')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ddd8f8" />
          <stop offset="55%"  stopColor="#cfc9f2" />
          <stop offset="100%" stopColor="#b3abe6" />
        </linearGradient>
        <linearGradient id={id('orelha')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#b0a8e6" />
          <stop offset="65%"  stopColor="#cfc9f2" />
          <stop offset="100%" stopColor="#efecfc" />
        </linearGradient>
        <radialGradient id={id('halo')}>
          <stop offset="0%"   stopColor="#b7a8f0" stopOpacity=".45" />
          <stop offset="100%" stopColor="#b7a8f0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sombra no chão (ela levita) */}
      <ellipse className="pet-anim-sombra" cx="100" cy="184" rx="42" ry="7" fill="currentColor" opacity=".14" />

      {/* brilhinhos ao redor (fundo, não acompanham o flutuar) */}
      <g fill="#b9aef0">
        <path className="pet-anim-brilho"   d={estrela(38, 66, 5)} />
        <path className="pet-anim-brilho-2" d={estrela(168, 88, 4)} />
        <path className="pet-anim-brilho-3" d={estrela(160, 150, 3.2)} />
      </g>

      <g className={animCorpo}>
        {/* halo etéreo pulsando atrás dela */}
        <ellipse className="pet-anim-halo" cx="100" cy="112" rx="68" ry="62" fill={url('halo')} />

        {/* rabinho-chama */}
        <path
          className="pet-anim-rabinho"
          d="M 46 132 C 30 128 20 114 28 102 C 32 112 40 118 48 124 Z"
          fill="#b7b0e8"
        />

        {/* orelhas etéreas em chama */}
        <g className="pet-anim-orelha-a">
          <path
            d="M 76 60 C 64 46 58 26 66 10 C 70 17 74 21 77 27 C 79 17 84 11 90 6 C 96 22 95 44 90 60 Z"
            fill={url('orelha')}
          />
          <path d="M 78 52 C 72 40 72 26 78 16" stroke="#f3f1fd" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity=".9" />
        </g>
        <g className="pet-anim-orelha-b">
          <path
            d="M 112 60 C 114 44 120 24 134 8 C 136 16 140 20 141 27 C 146 20 152 16 160 14 C 156 32 142 52 126 62 Z"
            fill={url('orelha')}
          />
          <path d="M 124 50 C 130 38 136 28 144 22" stroke="#f3f1fd" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity=".9" />
        </g>

        {/* corpo rechonchudo */}
        <path
          d="M 100 48
             C 138 48 158 78 158 114
             C 158 148 134 168 100 168
             C 66 168 42 148 42 114
             C 42 78 62 48 100 48 Z"
          fill={url('corpo')}
          stroke="#a79ddd"
          strokeWidth="1.5"
          opacity="1"
        />
        {/* pezinhos */}
        <ellipse cx="84"  cy="167" rx="10" ry="6.5" fill="#aea5e3" />
        <ellipse cx="116" cy="167" rx="10" ry="6.5" fill="#aea5e3" />
        {/* barriguinha clara */}
        <ellipse cx="100" cy="140" rx="30" ry="22" fill="#eeebfb" opacity=".85" />
        {/* patinhas da frente (no jogo, viram as mãos no controle) */}
        {humor !== 'jogando' && (
          <>
            <ellipse cx="78"  cy="150" rx="10" ry="7" fill="#bdb5ea" />
            <ellipse cx="122" cy="150" rx="10" ry="7" fill="#bdb5ea" />
          </>
        )}
        {/* pontinhos de luz no corpo */}
        <circle cx="64"  cy="74" r="2.4" fill="#ffffff" opacity=".85" />
        <circle cx="140" cy="86" r="1.8" fill="#ffffff" opacity=".7" />

        {/* rosto */}
        {humor === 'dormindo' ? (
          <>
            <path d="M 73 98 Q 81 105 89 98"   stroke="#322b47" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M 111 98 Q 119 105 127 98" stroke="#322b47" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="pet-anim-blink" transform={humor === 'jogando' ? 'translate(0 2.5)' : undefined}>
            <circle cx="81"  cy="98" r="8.5" fill="#322b47" />
            <circle cx="84"  cy="95" r="3"   fill="#fff" />
            <circle cx="78.5" cy="101.5" r="1.4" fill="#fff" opacity=".85" />
            <circle cx="119" cy="98" r="8.5" fill="#322b47" />
            <circle cx="122" cy="95" r="3"   fill="#fff" />
            <circle cx="116.5" cy="101.5" r="1.4" fill="#fff" opacity=".85" />
          </g>
        )}
        {humor === 'feliz' ? (
          <path d="M 92 112 Q 100 124 108 112 Z" fill="#322b47" />
        ) : (
          /* boquinha de gatinho */
          <path d="M 93 112 Q 96.5 116.5 100 112 Q 103.5 116.5 107 112" stroke="#322b47" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        )}
        <ellipse cx="66"  cy="110" rx="6.5" ry="4" fill="#f3b8c9" opacity=".75" />
        <ellipse cx="134" cy="110" rx="6.5" ry="4" fill="#f3b8c9" opacity=".75" />

        {/* ── roupas (camadas, estilo kawaii) ─────────────────────────── */}
        {roupa === 'cachecol' && (
          <g>
            <path d="M 56 120 C 80 132 120 132 144 120 L 142 134 C 118 144 82 144 58 134 Z" fill="#e5734f" />
            <path d="M 126 132 L 134 160 L 120 158 L 118 136 Z" fill="#d95f3b" />
            <path d="M 56 125 C 80 136 120 136 144 125" stroke="#f2926f" strokeWidth="3" fill="none" opacity=".8" />
          </g>
        )}
        {roupa === 'chapeu' && (
          <g>
            <path d="M 100 8 L 115 46 L 85 46 Z" fill="#f2c14e" />
            <circle cx="97" cy="30" r="2" fill="#fff" opacity=".8" />
            <circle cx="104" cy="20" r="1.6" fill="#fff" opacity=".8" />
            <circle cx="100" cy="8" r="5" fill="#e5734f" />
            <path d="M 85 46 Q 100 53 115 46" stroke="#d9a832" strokeWidth="4" fill="none" />
          </g>
        )}
        {roupa === 'abobora' && (
          <g>
            {/* abóbora vestindo a metade de baixo */}
            <path d="M 46 120 C 58 106 142 106 154 120 C 162 142 150 165 100 168 C 50 165 38 142 46 120 Z" fill="#e08a3c" />
            <path d="M 46 120 C 58 106 142 106 154 120" stroke="#c9702a" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M 74 112 C 70 130 72 150 80 164"  stroke="#c9702a" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
            <path d="M 100 110 L 100 167"               stroke="#c9702a" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
            <path d="M 126 112 C 130 130 128 150 120 164" stroke="#c9702a" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
            {/* folhinha no aro */}
            <path d="M 140 110 C 146 102 156 102 160 106 C 154 112 146 114 140 112 Z" fill="#6f9e5f" />
          </g>
        )}
        {roupa === 'marinheiro' && (
          <g>
            {/* golinha marinheiro */}
            <path d="M 60 116 C 80 126 120 126 140 116 L 145 134 L 100 152 L 55 134 Z" fill="#2e4a7a" />
            <path d="M 62 121 C 82 130 118 130 138 121" stroke="#fff" strokeWidth="2.2" fill="none" opacity=".9" />
            <path d="M 60 128 L 100 144 L 140 128"      stroke="#fff" strokeWidth="2.2" fill="none" opacity=".9" />
            <circle cx="100" cy="149" r="3.5" fill="#d94f5c" />
            {/* bonezinho */}
            <ellipse cx="100" cy="42" rx="18" ry="8.5" fill="#fdfdfd" />
            <path d="M 82 44 Q 100 52 118 44" stroke="#2e4a7a" strokeWidth="4.5" fill="none" />
          </g>
        )}
        {roupa === 'morango' && (
          <g>
            {/* capuz de morango */}
            <path d="M 100 34 C 140 34 156 66 152 92 C 134 82 66 82 48 92 C 44 66 60 34 100 34 Z" fill="#d94f5c" />
            {/* babadinho */}
            <path d="M 48 92 C 58 85 66 95 76 88 C 84 96 94 87 102 92 C 110 96 118 87 126 92 C 134 96 144 86 152 92"
              stroke="#f2a3b0" strokeWidth="5" fill="none" strokeLinecap="round" />
            {/* sementinhas */}
            <ellipse cx="72"  cy="58" rx="1.7" ry="2.6" fill="#f8e39b" />
            <ellipse cx="97"  cy="48" rx="1.7" ry="2.6" fill="#f8e39b" />
            <ellipse cx="124" cy="58" rx="1.7" ry="2.6" fill="#f8e39b" />
            <ellipse cx="84"  cy="74" rx="1.7" ry="2.6" fill="#f8e39b" />
            <ellipse cx="114" cy="74" rx="1.7" ry="2.6" fill="#f8e39b" />
            {/* folhinhas + talo */}
            <path d="M 100 35 C 92 27 82 25 76 29 C 84 34 92 36 100 37 Z" fill="#5f9e6f" />
            <path d="M 100 35 C 108 27 118 25 124 29 C 116 34 108 36 100 37 Z" fill="#5f9e6f" />
            <path d="M 100 34 C 100 28 102 24 106 21" stroke="#5f9e6f" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}
        {roupa === 'celestial' && (
          <g>
            {/* vestido celestial */}
            <path d="M 54 106 C 72 96 128 96 146 106 L 156 154 C 118 170 82 170 44 154 Z" fill="#2b3a6b" />
            <path d="M 54 106 C 72 96 128 96 146 106" stroke="#d9b356" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M 44 154 C 82 170 118 170 156 154" stroke="#d9b356" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
            {/* céu estrelado */}
            <path d={estrela(108, 136, 5)} fill="#f2e2a0" />
            <circle cx="72"  cy="126" r="1.8" fill="#f2e2a0" />
            <circle cx="124" cy="120" r="1.5" fill="#f2e2a0" />
            <circle cx="90"  cy="150" r="1.6" fill="#f2e2a0" />
            <circle cx="134" cy="148" r="1.4" fill="#f2e2a0" />
            {/* luazinha crescente */}
            <circle cx="66" cy="140" r="5"   fill="#f2e2a0" />
            <circle cx="68.5" cy="138.5" r="4.4" fill="#2b3a6b" />
          </g>
        )}
        {roupa === 'sueter' && (
          <g>
            {/* suéter de tricô */}
            <path d="M 50 116 C 72 106 128 106 150 116 L 150 150 C 150 160 128 166 100 166 C 72 166 50 160 50 150 Z" fill="#cbb391" />
            <path d="M 50 116 C 72 106 128 106 150 116" stroke="#b89b74" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M 52 150 C 76 162 124 162 148 150" stroke="#b89b74" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".9" />
            {/* floco de neve */}
            <g stroke="#fdf7ec" strokeWidth="2" strokeLinecap="round">
              <path d="M 100 126 L 100 142" />
              <path d="M 92 134 L 108 134" />
              <path d="M 94.5 128.5 L 105.5 139.5" />
              <path d="M 105.5 128.5 L 94.5 139.5" />
            </g>
            {/* pontinhos de tricô */}
            <circle cx="68"  cy="132" r="1.4" fill="#b89b74" />
            <circle cx="132" cy="132" r="1.4" fill="#b89b74" />
            <circle cx="74"  cy="146" r="1.4" fill="#b89b74" />
            <circle cx="126" cy="146" r="1.4" fill="#b89b74" />
          </g>
        )}
        {roupa === 'pijama' && (
          <g>
            {/* pijaminha dos sonhos */}
            <path d="M 50 114 C 72 104 128 104 150 114 L 150 150 C 150 160 128 166 100 166 C 72 166 50 160 50 150 Z" fill="#bcd4ee" />
            <path d="M 50 114 C 72 104 128 104 150 114" stroke="#9fbede" strokeWidth="4" fill="none" strokeLinecap="round" />
            {/* nuvenzinhas */}
            <g fill="#fff" opacity=".95">
              <ellipse cx="79" cy="132" rx="7"   ry="4.5" />
              <ellipse cx="86" cy="130" rx="5"   ry="3.5" />
              <ellipse cx="120" cy="148" rx="6.5" ry="4" />
              <ellipse cx="126" cy="146" rx="4.5" ry="3" />
            </g>
            {/* estrelinhas */}
            <path d={estrela(106, 124, 3.4)} fill="#f2e2a0" />
            <circle cx="66"  cy="146" r="1.5" fill="#f2e2a0" />
            <circle cx="136" cy="128" r="1.5" fill="#f2e2a0" />
          </g>
        )}

        {/* zzz */}
        {humor === 'dormindo' && (
          <g fill="#8f86d8" fontFamily="inherit" fontWeight="700">
            <text className="pet-anim-zzz"   x="152" y="72" fontSize="18">z</text>
            <text className="pet-anim-zzz-2" x="164" y="58" fontSize="13">z</text>
          </g>
        )}

        {/* videogame: controle nas patinhas + consolinho no chão */}
        {humor === 'jogando' && (
          <g>
            <path d="M 100 148 C 90 162 72 158 60 168" stroke="#4a4458" strokeWidth="2.5" fill="none" />
            <rect x="38" y="163" width="28" height="13" rx="3" fill="#4a4458" />
            <rect x="42" y="166.5" width="9" height="3.5" rx="1.7" fill="#8f86d8" />
            <circle cx="60" cy="169.5" r="2.2" fill="#e5734f" />
            <g className="pet-anim-controle">
              <rect x="78" y="130" width="44" height="19" rx="9.5" fill="#4a4458" />
              <rect x="85"   y="137"   width="9"   height="3.2" rx="1.6" fill="#cfc9f2" />
              <rect x="87.9" y="134.1" width="3.2" height="9"   rx="1.6" fill="#cfc9f2" />
              <circle cx="111"   cy="136"   r="2.7" fill="#e5734f" />
              <circle cx="116.5" cy="141.5" r="2.7" fill="#f2c14e" />
            </g>
            {/* patinhas segurando */}
            <ellipse cx="81"  cy="142" rx="8" ry="6.5" fill="#b7b0e8" />
            <ellipse cx="121" cy="142" rx="8" ry="6.5" fill="#b7b0e8" />
            {/* efeitos do jogo */}
            <g fontFamily="inherit" fontWeight="700">
              <text className="pet-anim-zzz"   x="142" y="80" fontSize="13" fill="#8f86d8">★</text>
              <text className="pet-anim-zzz-2" x="154" y="66" fontSize="11" fill="#e5734f">♪</text>
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
