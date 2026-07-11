/**
 * PetAura — mascote oficial: coelhinha espiritual lilás que levita.
 * SVG em camadas: halo → corpo → rosto (humor) → roupa (skin) → cena.
 * A silhueta fantasminha é a original; o polimento está nos gradientes,
 * no brilho ao redor e nas cenas de evento (confete, borboleta, moeda).
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { PetHumor, PetRoupa, PetCena, PetMicro } from './petConfig';

export interface PetSvgProps {
  humor: PetHumor;
  roupa: PetRoupa;
  /** micro-animação ocasional do widget */
  micro?: PetMicro;
  /** cena extra desenhada junto (eventos aleatórios / comemoração) */
  cena?: PetCena;
  className?: string;
}

/** Brilhinho de 4 pontas centrado em (x, y) com "raio" s. */
const estrela = (x: number, y: number, s: number) =>
  `M ${x} ${y - s} L ${x + s * 0.3} ${y - s * 0.3} L ${x + s} ${y} ` +
  `L ${x + s * 0.3} ${y + s * 0.3} L ${x} ${y + s} L ${x - s * 0.3} ${y + s * 0.3} ` +
  `L ${x - s} ${y} L ${x - s * 0.3} ${y - s * 0.3} Z`;

const CORES_CONFETE = ['#8f86d8', '#e5734f', '#f2c14e', '#7fb08f', '#f3b8c9', '#5b8dd9'];

export function PetAura({ humor, roupa, micro = 'none', cena = 'nenhuma', className }: PetSvgProps) {
  // ids únicos por instância (widget + quartinho convivem na mesma página)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `aura-${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;

  const animCorpo =
    humor === 'comemorando' ? 'pet-anim-comemora'
    : humor === 'feliz'      ? 'pet-anim-feliz'
    : humor === 'dormindo'   ? 'pet-anim-dormindo'
    : humor === 'jogando'    ? 'pet-anim-breathe' // sentadinha, concentrada
    : micro === 'pulinho'    ? 'pet-anim-pulinho'
    : micro === 'espreguica' ? 'pet-anim-espreguica'
    : 'pet-anim-float';

  const acordada = humor !== 'dormindo';
  const empolgada = humor === 'comemorando';

  return (
    <svg viewBox="0 0 200 200" className={cn('select-none', className)} role="img" aria-label="Aura, a mascote">
      <defs>
        <linearGradient id={id('corpo')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#dcd7f8" />
          <stop offset="60%"  stopColor="#cfc9f2" />
          <stop offset="100%" stopColor="#bab2ea" />
        </linearGradient>
        <linearGradient id={id('orelha')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#aca4e4" />
          <stop offset="100%" stopColor="#c8c1f0" />
        </linearGradient>
        <radialGradient id={id('halo')}>
          <stop offset="0%"   stopColor="#b7a8f0" stopOpacity=".4" />
          <stop offset="100%" stopColor="#b7a8f0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sombra no chão (ela levita) */}
      <ellipse className="pet-anim-sombra" cx="100" cy="182" rx="44" ry="8" fill="currentColor" opacity=".14" />

      {/* brilhinhos piscando ao redor (ficam fixos; ela flutua entre eles) */}
      {acordada && (
        <g fill="#b9aef0">
          <path className="pet-anim-brilho"   d={estrela(36, 62, 5)} />
          <path className="pet-anim-brilho-2" d={estrela(168, 84, 4)} />
          <path className="pet-anim-brilho-3" d={estrela(162, 148, 3)} />
        </g>
      )}

      <g className={animCorpo}>
        {/* halo etéreo pulsando atrás dela */}
        <ellipse className="pet-anim-halo" cx="100" cy="104" rx="70" ry="64" fill={url('halo')} />

        {/* orelhas etéreas (as duas ondulam, alternadas) */}
        <g className="pet-anim-orelha-a">
          <path d="M78 62 C 62 40 60 18 72 10 C 84 4 90 22 88 40 C 87 50 84 58 82 62 Z" fill={url('orelha')} />
          <path d="M76 50 C 70 36 70 22 76 16" stroke="#e9e6fb" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
        <g className="pet-anim-orelha-b">
          <path d="M116 58 C 122 34 136 14 150 20 C 162 26 150 50 136 62 C 130 66 122 64 116 58 Z" fill={url('orelha')} />
          <path d="M128 50 C 134 38 140 30 146 28" stroke="#e9e6fb" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>

        {/* corpo fantasminha com barra ondulada (silhueta original) */}
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
          fill={url('corpo')}
        />
        {/* faixa de brilho */}
        <path d="M56 118 C 76 106 122 132 148 112" stroke="#e9e6fb" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".9" />
        {/* luz de contorno no topo (sheen) */}
        <path d="M66 56 C 78 46 96 42 112 46" stroke="#f3f1fd" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".75" />
        <circle cx="64" cy="70" r="2.5" fill="#ffffff" opacity=".8" />
        <circle cx="142" cy="86" r="2" fill="#ffffff" opacity=".7" />
        <circle cx="126" cy="64" r="1.6" fill="#ffffff" opacity=".6" />

        {/* rosto */}
        {humor === 'dormindo' ? (
          <>
            <path d="M76 96 Q 83 102 90 96" stroke="#322b47" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M112 96 Q 119 102 126 96" stroke="#322b47" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : empolgada ? (
          /* olhos de estrelinha na comemoração */
          <g fill="#f2c14e" stroke="#d9a832" strokeWidth="1">
            <path d={estrela(83, 96, 8)} />
            <path d={estrela(119, 96, 8)} />
          </g>
        ) : (
          <g className="pet-anim-blink">
            <circle cx="83" cy="96" r="7" fill="#322b47" />
            <circle cx="85.5" cy="93.5" r="2.4" fill="#fff" />
            <circle cx="80.5" cy="98.5" r="1.1" fill="#fff" opacity=".85" />
            <circle cx="119" cy="96" r="7" fill="#322b47" />
            <circle cx="121.5" cy="93.5" r="2.4" fill="#fff" />
            <circle cx="116.5" cy="98.5" r="1.1" fill="#fff" opacity=".85" />
          </g>
        )}
        {humor === 'feliz' || empolgada ? (
          <path d="M92 110 Q 101 123 110 110 Z" fill="#322b47" />
        ) : (
          <path d="M96 112 Q 101 117 106 112" stroke="#322b47" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        <ellipse cx="70" cy="108" rx="6" ry="4" fill="#f3b8c9" opacity={empolgada ? '.95' : '.7'} />
        <ellipse cx="132" cy="108" rx="6" ry="4" fill="#f3b8c9" opacity={empolgada ? '.95' : '.7'} />

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

        {/* ── itens da loja mensal (julho/2026) ── */}
        {roupa === 'coroa' && (
          <g>
            <path d="M78 46 L 78 26 L 88 36 L 100 20 L 112 36 L 122 26 L 122 46 Z"
              fill="#f2c14e" stroke="#d9a832" strokeWidth="2" strokeLinejoin="round" />
            <rect x="78" y="42" width="44" height="7" rx="3" fill="#d9a832" />
            <circle cx="100" cy="20" r="3" fill="#e5734f" />
            <circle cx="88" cy="45.5" r="2" fill="#e5734f" />
            <circle cx="112" cy="45.5" r="2" fill="#5b8dd9" />
          </g>
        )}
        {roupa === 'oculos_sol' && (
          <g>
            <rect x="70" y="87" width="26" height="18" rx="8" fill="#322b47" />
            <rect x="106" y="87" width="26" height="18" rx="8" fill="#322b47" />
            <path d="M96 94 Q 101 90 106 94" stroke="#322b47" strokeWidth="3.5" fill="none" />
            <path d="M70 93 L 57 88 M 132 93 L 145 88" stroke="#322b47" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M75 92 L 88 92" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity=".35" />
            <path d="M111 92 L 124 92" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity=".35" />
          </g>
        )}
        {roupa === 'laco' && (
          <g transform="rotate(10 132 60)">
            <path d="M132 60 L 115 49 C 111 57 111 65 115 71 Z" fill="#ee8ba1" />
            <path d="M132 60 L 149 49 C 153 57 153 65 149 71 Z" fill="#ee8ba1" />
            <path d="M132 60 L 120 53 C 118 58 118 63 120 67 Z" fill="#f5aebf" />
            <path d="M132 60 L 144 53 C 146 58 146 63 144 67 Z" fill="#f5aebf" />
            <circle cx="132" cy="60" r="5" fill="#d96a83" />
          </g>
        )}
        {roupa === 'bone' && (
          <g>
            <path d="M74 44 C 74 27 126 27 126 44 L 126 49 C 108 43 92 43 74 49 Z" fill="#d94f4f" />
            <path d="M122 44 C 138 42 149 46 153 52 C 141 55 130 53 121 50 Z" fill="#b83e3e" />
            <path d="M100 30 L 100 44" stroke="#b83e3e" strokeWidth="2.5" fill="none" />
            <circle cx="100" cy="29" r="3.5" fill="#b83e3e" />
          </g>
        )}
        {roupa === 'gravata' && (
          <g>
            <path d="M100 130 L 82 122 L 82 138 Z" fill="#5b8dd9" />
            <path d="M100 130 L 118 122 L 118 138 Z" fill="#5b8dd9" />
            <path d="M100 130 L 88 125.5 L 88 134.5 Z" fill="#7dabe8" />
            <path d="M100 130 L 112 125.5 L 112 134.5 Z" fill="#7dabe8" />
            <rect x="95.5" y="124.5" width="9" height="11" rx="3" fill="#3f6cb0" />
          </g>
        )}
        {roupa === 'flor' && (
          <g>
            <circle cx="72" cy="41.5" r="4.5" fill="#ffffff" stroke="#f3b8c9" strokeWidth="1" />
            <circle cx="80" cy="46" r="4.5" fill="#ffffff" stroke="#f3b8c9" strokeWidth="1" />
            <circle cx="80" cy="55" r="4.5" fill="#ffffff" stroke="#f3b8c9" strokeWidth="1" />
            <circle cx="72" cy="59.5" r="4.5" fill="#ffffff" stroke="#f3b8c9" strokeWidth="1" />
            <circle cx="64" cy="55" r="4.5" fill="#ffffff" stroke="#f3b8c9" strokeWidth="1" />
            <circle cx="64" cy="46" r="4.5" fill="#ffffff" stroke="#f3b8c9" strokeWidth="1" />
            <circle cx="72" cy="50.5" r="5" fill="#f2c14e" stroke="#d9a832" strokeWidth="1.5" />
          </g>
        )}
        {roupa === 'capa' && (
          <g>
            {/* pano esvoaçando no lado esquerdo */}
            <path d="M64 122 C 46 132 36 150 40 168 C 52 162 62 150 70 140 Z" fill="#c94f4f" />
            <path d="M64 122 C 50 132 44 146 46 158 C 56 152 64 142 70 136 Z" fill="#d95f5f" opacity=".85" />
            {/* faixa nos ombros + broche */}
            <path d="M62 124 C 84 136 118 136 140 124 L 138 132 C 116 142 86 142 64 132 Z" fill="#d94f4f" />
            <circle cx="100" cy="134" r="4" fill="#f2c14e" stroke="#d9a832" strokeWidth="1.5" />
          </g>
        )}
        {roupa === 'oculos_nerd' && (
          <g stroke="#3a3350" fill="none">
            <circle cx="83" cy="96" r="12" strokeWidth="3.5" />
            <circle cx="119" cy="96" r="12" strokeWidth="3.5" />
            <path d="M95 94 Q 101 90 107 94" strokeWidth="3" />
            <path d="M71 93 L 58 88 M 131 93 L 144 88" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
        {roupa === 'colar' && (
          <g>
            <path d="M70 124 C 86 138 114 138 130 124" stroke="#e9e6fb" strokeWidth="1.5" fill="none" opacity=".6" />
            {[
              [72, 126, 3.4], [80, 130.5, 3.4], [89, 133.5, 3.4], [100, 134.5, 4],
              [111, 133.5, 3.4], [120, 130.5, 3.4], [128, 126, 3.4],
            ].map(([cx, cy, r], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} fill="#f7f4ff" stroke="#cfc6ee" strokeWidth="1" />
            ))}
            <circle cx="98.6" cy="133" r="1.2" fill="#ffffff" />
          </g>
        )}
        {roupa === 'tiara' && (
          <g>
            <path d="M76 46 C 88 38 112 38 124 46" stroke="#f2c14e" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <path d="M78 44.5 C 89 37.5 111 37.5 122 44.5" stroke="#d9a832" strokeWidth="1.4" fill="none" opacity=".7" strokeLinecap="round" />
            <path d={estrela(100, 32, 8)} fill="#f2c14e" stroke="#d9a832" strokeWidth="1.2" />
            <circle cx="86" cy="41.5" r="1.8" fill="#ffffff" opacity=".9" />
            <circle cx="114" cy="41.5" r="1.8" fill="#ffffff" opacity=".9" />
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

      {/* ── cenas de evento (fora do corpo, para não herdarem o pulo) ──── */}

      {/* confete da comemoração */}
      {cena === 'confete' && (
        <g>
          {CORES_CONFETE.map((cor, i) => (
            <rect
              key={`c-${i}`}
              className="pet-anim-confete"
              style={{ animationDelay: `${(i * 0.23) % 1.4}s`, animationDuration: `${1.6 + (i % 3) * 0.4}s` }}
              x={26 + i * 26} y="-10" width="7" height="10" rx="2" fill={cor}
            />
          ))}
          {CORES_CONFETE.map((cor, i) => (
            <circle
              key={`b-${i}`}
              className="pet-anim-confete"
              style={{ animationDelay: `${0.5 + ((i * 0.31) % 1.4)}s`, animationDuration: `${1.8 + (i % 2) * 0.5}s` }}
              cx={40 + i * 24} cy="-8" r="4" fill={cor}
            />
          ))}
        </g>
      )}

      {/* borboleta dando voltas perto dela */}
      {cena === 'borboleta' && (
        <g className="pet-anim-borboleta">
          <g className="pet-anim-asas">
            <ellipse cx="-7" cy="0" rx="8" ry="11" fill="#f2a3b0" transform="rotate(-18)" />
            <ellipse cx="-5" cy="8" rx="5" ry="6.5" fill="#f3b8c9" transform="rotate(-18)" />
          </g>
          <g className="pet-anim-asas-2">
            <ellipse cx="7" cy="0" rx="8" ry="11" fill="#f2a3b0" transform="rotate(18)" />
            <ellipse cx="5" cy="8" rx="5" ry="6.5" fill="#f3b8c9" transform="rotate(18)" />
          </g>
          <ellipse cx="0" cy="3" rx="2.4" ry="9" fill="#4a4458" />
          <path d="M -1 -5 C -4 -10 -7 -12 -9 -13 M 1 -5 C 4 -10 7 -12 9 -13" stroke="#4a4458" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* oizinho: patinha acenando (topo da escada) */}
      {cena === 'aceno' && (
        <g className="pet-anim-acena">
          <ellipse cx="150" cy="98" rx="8" ry="11" fill="#b7b0e8" />
          <ellipse cx="150" cy="93" rx="6" ry="5" fill="#c8c1f0" />
        </g>
      )}

      {/* moedinha dourada quicando na frente dela */}
      {cena === 'moeda' && (
        <g>
          <g className="pet-anim-moeda">
            <circle cx="152" cy="164" r="13" fill="#f2c14e" stroke="#d9a832" strokeWidth="2.5" />
            <circle cx="152" cy="164" r="8.5" fill="none" stroke="#d9a832" strokeWidth="1.5" opacity=".7" />
            <text x="152" y="169" fontSize="13" fontWeight="700" fill="#a8761c" textAnchor="middle">$</text>
          </g>
          <path className="pet-anim-brilho"   d={estrela(168, 146, 4)} fill="#f2c14e" />
          <path className="pet-anim-brilho-3" d={estrela(136, 152, 3)} fill="#f2c14e" />
        </g>
      )}
    </svg>
  );
}
