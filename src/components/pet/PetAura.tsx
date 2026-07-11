/**
 * PetAura — mascote oficial: coelhinha espiritual lilás que levita.
 * SVG em camadas: halo → corpo → rosto (humor) → roupa (skin) → cena.
 * A silhueta fantasminha é a original; o polimento está nos gradientes,
 * no brilho ao redor e nas cenas de evento (confete, borboleta, moeda).
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { PetHumor, PetRoupa, PetCena, PetMicro, PetPescaFase } from './petConfig';
import type { PetClima } from './usePetClima';

export interface PetSvgProps {
  humor: PetHumor;
  roupa: PetRoupa;
  /** micro-animação ocasional do widget */
  micro?: PetMicro;
  /** cena extra desenhada junto (eventos aleatórios / comemoração) */
  cena?: PetCena;
  /** passeando pelo rodapé: passinhos no corpo (a sombra fica no chão)
   *  e ondinhas da barra mais rapidinhas */
  andando?: boolean;
  /** deslocamento das pupilas (px do viewBox) — olhos seguindo o mouse */
  olhar?: { x: number; y: number };
  /** fase atual da pescaria (humor 'pescando') */
  pescaFase?: PetPescaFase;
  /** clima real lá fora: chuva → guarda-chuva, calor → picolé, frio → cachecol… */
  clima?: PetClima;
  className?: string;
}

/** Brilhinho de 4 pontas centrado em (x, y) com "raio" s. */
const estrela = (x: number, y: number, s: number) =>
  `M ${x} ${y - s} L ${x + s * 0.3} ${y - s * 0.3} L ${x + s} ${y} ` +
  `L ${x + s * 0.3} ${y + s * 0.3} L ${x} ${y + s} L ${x - s * 0.3} ${y + s * 0.3} ` +
  `L ${x - s} ${y} L ${x - s * 0.3} ${y - s * 0.3} Z`;

const CORES_CONFETE = ['#8f86d8', '#e5734f', '#f2c14e', '#7fb08f', '#f3b8c9', '#5b8dd9'];

export function PetAura({
  humor, roupa, micro = 'none', cena = 'nenhuma', andando = false,
  olhar = { x: 0, y: 0 }, pescaFase = 'espera', clima = 'ameno', className,
}: PetSvgProps) {
  // ids únicos por instância (widget + quartinho convivem na mesma página)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `aura-${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;

  const animCorpo =
    humor === 'comemorando' ? 'pet-anim-comemora'
    : humor === 'feliz'      ? 'pet-anim-feliz'
    : humor === 'dormindo'   ? 'pet-anim-dormindo'
    : humor === 'dancando'   ? 'pet-anim-danca'
    : humor === 'surpresa'   ? 'pet-anim-surpresa'
    : humor === 'tonta'      ? 'pet-anim-tonta'
    // sentadinha, concentrada (videogame, pescaria, marshmallow)
    : humor === 'jogando' || humor === 'pescando' || humor === 'assando'
      ? 'pet-anim-breathe'
    : micro === 'pulinho'    ? 'pet-anim-pulinho'
    : micro === 'espreguica' ? 'pet-anim-espreguica'
    : micro === 'bocejo'     ? 'pet-anim-bocejo'
    : micro === 'espirro'    ? 'pet-anim-espirro'
    : 'pet-anim-float';

  const acordada = humor !== 'dormindo';
  const empolgada = humor === 'comemorando';
  // olhos fechados: dormindo, no meio do bocejo ou do espirro
  const olhosFechados = humor === 'dormindo' || micro === 'bocejo' || micro === 'espirro';
  const pescando = humor === 'pescando';
  // clima: patinhas ocupadas (vara, controle, espeto…) → sem guarda-chuva/picolé
  const patasOcupadas =
    humor === 'jogando' || humor === 'pescando' || humor === 'assando' || cena === 'carrinho';
  const chovendo = clima === 'chuva' || clima === 'tempestade';

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

      {/* ── clima: céu ao fundo ── */}
      {clima === 'tempestade' && (
        <g>
          <ellipse cx="34" cy="16" rx="22" ry="10" fill="#8b93a8" />
          <ellipse cx="52" cy="12" rx="15" ry="8" fill="#9aa2b5" />
          <path className="pet-anim-relampago" d="M38 24 L 30 44 L 38 44 L 28 66 L 44 42 L 36 42 L 44 24 Z" fill="#f2c14e" />
        </g>
      )}
      {clima === 'calor' && (
        <g>
          <g className="pet-anim-sol" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round">
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4;
              return (
                <line
                  key={i}
                  x1={172 + Math.cos(a) * 17} y1={26 + Math.sin(a) * 17}
                  x2={172 + Math.cos(a) * 23} y2={26 + Math.sin(a) * 23}
                />
              );
            })}
          </g>
          <circle cx="172" cy="26" r="12" fill="#f2c14e" />
          <circle cx="172" cy="26" r="8" fill="#f6d47c" />
        </g>
      )}

      {/* passinhos do passeio só no corpo — sombra e brilhinhos ficam no chão */}
      <g className={cn(andando && 'pet-anim-anda')}>
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

        {/* corpo fantasminha com barra ondulada (as ondinhas balançam via CSS) */}
        <path
          className={cn('pet-anim-ondinha', andando && 'pet-anim-ondinha-rapida')}
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
        {olhosFechados ? (
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
        ) : humor === 'surpresa' ? (
          /* olhos arregalados */
          <g>
            <circle cx="83" cy="96" r="8.5" fill="#ffffff" stroke="#322b47" strokeWidth="2" />
            <circle cx="83" cy="96" r="3.6" fill="#322b47" />
            <circle cx="119" cy="96" r="8.5" fill="#ffffff" stroke="#322b47" strokeWidth="2" />
            <circle cx="119" cy="96" r="3.6" fill="#322b47" />
          </g>
        ) : humor === 'tonta' ? (
          /* olhinhos de X */
          <g stroke="#322b47" strokeWidth="3.2" strokeLinecap="round">
            <path d="M78 91 L 88 101 M 88 91 L 78 101" />
            <path d="M114 91 L 124 101 M 124 91 L 114 101" />
          </g>
        ) : (
          /* pupilas seguem o mouse (olhar) */
          <g style={{ transform: `translate(${olhar.x}px, ${olhar.y}px)`, transition: 'transform .15s ease-out' }}>
            <g className="pet-anim-blink">
              <circle cx="83" cy="96" r="7" fill="#322b47" />
              <circle cx="85.5" cy="93.5" r="2.4" fill="#fff" />
              <circle cx="80.5" cy="98.5" r="1.1" fill="#fff" opacity=".85" />
              <circle cx="119" cy="96" r="7" fill="#322b47" />
              <circle cx="121.5" cy="93.5" r="2.4" fill="#fff" />
              <circle cx="116.5" cy="98.5" r="1.1" fill="#fff" opacity=".85" />
            </g>
          </g>
        )}
        {micro === 'bocejo' ? (
          /* boca escancarada do bocejo */
          <ellipse cx="101" cy="113" rx="7" ry="9" fill="#322b47" />
        ) : humor === 'surpresa' ? (
          /* boquinha de espanto */
          <ellipse cx="101" cy="113" rx="4.5" ry="6" fill="#322b47" />
        ) : humor === 'tonta' ? (
          /* boquinha ondulada de tonta */
          <path d="M93 112 Q 97 109 101 112 T 109 112" stroke="#322b47" strokeWidth="3" fill="none" strokeLinecap="round" />
        ) : pescando && pescaFase === 'escapou' ? (
          /* bico emburradinho: o peixe escapou… */
          <path d="M96 114 Q 101 109 106 114" stroke="#322b47" strokeWidth="3" fill="none" strokeLinecap="round" />
        ) : humor === 'feliz' || humor === 'dancando' || empolgada || (pescando && pescaFase === 'peixe') ? (
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

        {/* pescaria multi-fase: espera → fisgada! → peixe / escapou / bota */}
        {pescando && (
          <g>
            {/* laguinho */}
            <ellipse cx="164" cy="170" rx="30" ry="9" fill="#9ec3e0" />
            <ellipse cx="164" cy="170" rx="30" ry="9" fill="none" stroke="#7fa8cc" strokeWidth="1.5" opacity=".7" />
            <path d="M150 168 Q 156 166 162 168 M 166 172 Q 172 170 178 172" stroke="#c9dff0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            {/* vara de pescar */}
            <path d="M108 140 L 156 100" stroke="#a8815c" strokeWidth="4" strokeLinecap="round" />
            <path d="M156 100 L 162 95" stroke="#8a6a4a" strokeWidth="3" strokeLinecap="round" />

            {pescaFase === 'espera' && (
              <>
                {/* linha + boia balançando, peixinho pula ao longe */}
                <path d="M162 95 L 163 155" stroke="#7d7595" strokeWidth="1.4" fill="none" />
                <g className="pet-anim-boia">
                  <circle cx="163" cy="159" r="4.5" fill="#e5734f" />
                  <path d="M158.5 159 A 4.5 4.5 0 0 1 167.5 159 Z" fill="#ffffff" />
                </g>
                <g className="pet-anim-peixe">
                  <g transform="translate(180, 165)">
                    <ellipse cx="0" cy="0" rx="7" ry="4" fill="#8fb8d8" />
                    <path d="M5 0 L 11 -4 L 11 4 Z" fill="#8fb8d8" />
                    <circle cx="-3.5" cy="-1" r="0.9" fill="#2b3a4a" />
                  </g>
                </g>
              </>
            )}

            {pescaFase === 'fisgada' && (
              <>
                {/* boia quase afundando + ondas + "!" */}
                <path d="M162 95 L 164 165" stroke="#7d7595" strokeWidth="1.4" fill="none" />
                <path d="M159.5 167 A 4.5 4.5 0 0 1 168.5 167 Z" fill="#e5734f" />
                <circle className="pet-anim-ondas"   cx="164" cy="168" r="8"  fill="none" stroke="#c9dff0" strokeWidth="2" />
                <circle className="pet-anim-ondas-2" cx="164" cy="168" r="12" fill="none" stroke="#c9dff0" strokeWidth="1.6" />
                <text className="pet-anim-pop" x="132" y="62" fontSize="26" fontWeight="800" fill="#e5734f">!</text>
              </>
            )}

            {pescaFase === 'peixe' && (
              <>
                {/* peixe fisgado pendurado na linha + estrelinhas */}
                <path d="M162 95 L 162 120" stroke="#7d7595" strokeWidth="1.4" fill="none" />
                <g className="pet-anim-boia">
                  <g transform="translate(162, 132)">
                    <ellipse cx="0" cy="0" rx="4.5" ry="8" fill="#8fb8d8" />
                    <path d="M0 -7 L -4.5 -13 L 4.5 -13 Z" fill="#8fb8d8" />
                    <circle cx="-1.6" cy="3" r="0.9" fill="#2b3a4a" />
                  </g>
                </g>
                <path className="pet-anim-brilho"   d={estrela(148, 112, 4)} fill="#f2c14e" />
                <path className="pet-anim-brilho-3" d={estrela(176, 124, 3)} fill="#f2c14e" />
              </>
            )}

            {pescaFase === 'bota' && (
              <>
                {/* …uma bota velha?! */}
                <path d="M162 95 L 162 118" stroke="#7d7595" strokeWidth="1.4" fill="none" />
                <g className="pet-anim-boia">
                  <g transform="translate(162, 128)">
                    <path d="M-4 -10 L 4 -10 L 4 4 L 10 8 L 10 12 L -4 12 Z" fill="#8a6a4a" />
                    <rect x="-5.5" y="-13" width="11" height="4" rx="2" fill="#6f543a" />
                  </g>
                </g>
              </>
            )}

            {pescaFase === 'escapou' && (
              <>
                {/* só ondas e gotinhas: o peixe fugiu… */}
                <path d="M162 95 L 163 158" stroke="#7d7595" strokeWidth="1.4" fill="none" opacity=".5" />
                <circle className="pet-anim-ondas"   cx="164" cy="168" r="9"  fill="none" stroke="#c9dff0" strokeWidth="2" />
                <circle className="pet-anim-ondas-2" cx="164" cy="168" r="13" fill="none" stroke="#c9dff0" strokeWidth="1.6" />
                <circle cx="152" cy="156" r="2" fill="#9ec3e0" />
                <circle cx="176" cy="152" r="1.6" fill="#9ec3e0" />
              </>
            )}

            {/* patinhas segurando a vara */}
            <ellipse cx="104" cy="143" rx="8" ry="6.5" fill="#b7b0e8" />
            <ellipse cx="115" cy="136" rx="7" ry="6" fill="#b7b0e8" />
          </g>
        )}

        {/* "!" da surpresa */}
        {humor === 'surpresa' && (
          <text className="pet-anim-pop" x="136" y="56" fontSize="26" fontWeight="800" fill="#e5734f">!</text>
        )}

        {/* estrelinhas rodando da tontura */}
        {humor === 'tonta' && (
          <g fontWeight="700">
            <text className="pet-anim-zzz" x="140" y="60" fontSize="14" fill="#8f86d8">✶</text>
            <text className="pet-anim-zzz-2" x="52" y="56" fontSize="12" fill="#e5734f">✶</text>
          </g>
        )}

        {/* ── clima: coisinhas presas nela ── */}

        {/* chuva/tempestade: guarda-chuva lilás (se as patinhas estão livres) */}
        {chovendo && !patasOcupadas && (
          <g>
            {/* cabo curvado pro lado, para não cruzar o rostinho */}
            <path d="M106 30 C 134 62 126 112 116 138" stroke="#8a6a4a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path
              d="M46 36 C 50 4 162 4 166 36 L 166 37
                 C 156 30 146 30 136 37 C 126 30 116 30 106 37
                 C 96 30 86 30 76 37 C 66 30 56 30 46 37 Z"
              fill="#8f86d8"
            />
            <path d="M46 36 C 50 4 162 4 166 36" fill="none" stroke="#7a70c9" strokeWidth="2" />
            <path d="M60 26 C 70 14 90 8 106 8" stroke="#a89fe6" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
            <circle cx="106" cy="7" r="3" fill="#7a70c9" />
            <ellipse cx="116" cy="138" rx="7.5" ry="6" fill="#b7b0e8" />
          </g>
        )}

        {/* calor: gotinha de suor + picolé de uva (se as patinhas estão livres) */}
        {clima === 'calor' && acordada && (
          <path className="pet-anim-suor" d="M137 64 C 133.5 70 133.5 74 137 76.5 C 140.5 74 140.5 70 137 64 Z" fill="#9ec3e0" />
        )}
        {clima === 'calor' && !patasOcupadas && acordada && (
          <g>
            <rect x="53" y="98" width="14" height="27" rx="7" fill="#a86ad1" />
            <path d="M56 104 L 56 118" stroke="#c39ae3" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="58" y="124" width="4" height="16" rx="2" fill="#c9a97b" />
            <ellipse cx="60" cy="140" rx="7.5" ry="6" fill="#b7b0e8" />
          </g>
        )}

        {/* frio: cachecol azul emprestado (se estiver sem roupa) + bafinho */}
        {clima === 'frio' && roupa === 'nenhuma' && (
          <g>
            <path d="M62 128 C 84 140 118 140 140 128 L 138 142 C 116 152 86 152 64 142 Z" fill="#5b8dd9" />
            <path d="M124 138 L 132 164 L 118 162 L 116 142 Z" fill="#4a76bd" />
            <path d="M62 133 C 84 144 118 144 140 133" stroke="#7dabe8" strokeWidth="3" fill="none" opacity=".8" />
          </g>
        )}
        {clima === 'frio' && acordada && (
          <g fill="#dfe9f5">
            <ellipse className="pet-anim-bafinho" cx="113" cy="112" rx="5" ry="3.5" />
            <ellipse className="pet-anim-bafinho-2" cx="113" cy="112" rx="4" ry="3" />
          </g>
        )}

        {/* assando marshmallow: fogueirinha crepitando + espetinho nas patinhas */}
        {humor === 'assando' && (
          <g>
            {/* lenha + pedrinhas */}
            <path d="M144 172 L 178 164 M 148 164 L 176 172" stroke="#8a6a4a" strokeWidth="5" strokeLinecap="round" />
            <circle cx="136" cy="174" r="3" fill="#b9b2a6" />
            <circle cx="185" cy="172" r="2.6" fill="#b9b2a6" />
            {/* chamas tremulando */}
            <g className="pet-anim-chama">
              <path d="M161 164 C 152 155 154 144 161 135 C 162 144 168 147 169 153 C 170 159 166 163 161 164 Z" fill="#f2a13c" />
            </g>
            <g className="pet-anim-chama-2">
              <path d="M161 162 C 156 156 157 149 161 144 C 162 149 165 150 165.5 154 C 166 158 164 161 161 162 Z" fill="#f2c14e" />
            </g>
            {/* espetinho com marshmallow na ponta */}
            <g className="pet-anim-espeto">
              <path d="M112 138 L 152 145" stroke="#8a6a4a" strokeWidth="3" strokeLinecap="round" />
              <rect x="148" y="137" width="14" height="13" rx="4.5" fill="#fdf6ec" stroke="#e8cfa8" strokeWidth="1.2" />
            </g>
            {/* patinhas segurando o espeto */}
            <ellipse cx="106" cy="139" rx="8" ry="6.5" fill="#b7b0e8" />
            <ellipse cx="118" cy="141" rx="7" ry="6" fill="#b7b0e8" />
            {/* faisquinhas subindo */}
            <g fontFamily="inherit" fontWeight="700">
              <text className="pet-anim-zzz" x="170" y="138" fontSize="11" fill="#f2a13c">✦</text>
              <text className="pet-anim-zzz-2" x="148" y="130" fontSize="9" fill="#f2c14e">✦</text>
            </g>
          </g>
        )}

        {/* dançando: notas musicais subindo ao redor */}
        {humor === 'dancando' && (
          <g fontFamily="inherit" fontWeight="700">
            <text className="pet-anim-zzz" x="146" y="66" fontSize="15" fill="#8f86d8">♪</text>
            <text className="pet-anim-zzz-2" x="158" y="50" fontSize="13" fill="#e5734f">♫</text>
            <text className="pet-anim-zzz" x="40" y="72" fontSize="12" fill="#5b8dd9" style={{ animationDelay: '0.8s' }}>♩</text>
          </g>
        )}

        {/* carrinho de controle remoto: controle nas patinhas (carro é cena) */}
        {cena === 'carrinho' && (
          <g>
            <g className="pet-anim-controle">
              <rect x="86" y="128" width="26" height="17" rx="5.5" fill="#4a4458" />
              <path d="M108 128 L 114 116" stroke="#4a4458" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="114.5" cy="114.5" r="2" fill="#e5734f" />
              <circle cx="94" cy="136.5" r="3" fill="#cfc9f2" />
              <circle cx="104" cy="136.5" r="3" fill="#e5734f" />
            </g>
            <ellipse cx="84" cy="139" rx="7.5" ry="6" fill="#b7b0e8" />
            <ellipse cx="114" cy="139" rx="7.5" ry="6" fill="#b7b0e8" />
          </g>
        )}
      </g>
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

      {/* carrinho de controle remoto zanzando pra lá e pra cá */}
      {cena === 'carrinho' && (
        <g className="pet-anim-carrinho">
          <g transform="translate(148, 156)">
            {/* cabine + carroceria */}
            <path d="M4 10 L 8 2 C 10 -2 24 -2 26 2 L 30 10 Z" fill="#d94f4f" />
            <rect x="-2" y="8" width="38" height="11" rx="5.5" fill="#e5734f" />
            <rect x="10" y="1.5" width="8" height="6.5" rx="2" fill="#bfd7e8" />
            {/* antena do controle remoto */}
            <path d="M30 1 L 34 -8" stroke="#4a4458" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="34.5" cy="-9" r="1.7" fill="#f2c14e" />
            {/* rodinhas girando */}
            <g className="pet-anim-roda">
              <circle cx="6" cy="20" r="5.5" fill="#322b47" />
              <path d="M6 16.5 L 6 23.5 M 2.5 20 L 9.5 20" stroke="#8f86d8" strokeWidth="1.4" />
            </g>
            <g className="pet-anim-roda">
              <circle cx="28" cy="20" r="5.5" fill="#322b47" />
              <path d="M28 16.5 L 28 23.5 M 24.5 20 L 31.5 20" stroke="#8f86d8" strokeWidth="1.4" />
            </g>
          </g>
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

      {/* ── clima: primeiro plano ── */}

      {/* gotas de chuva caindo por cima de tudo */}
      {chovendo && (
        <g stroke="#7fa8cc" strokeWidth="2.4" strokeLinecap="round" opacity=".75">
          {[[14, 0], [38, 0.5], [62, 0.2], [88, 0.8], [118, 0.35], [142, 0.65], [168, 0.1], [188, 0.5]].map(([x, atraso], i) => (
            <line
              key={i}
              className="pet-anim-gota"
              x1={x} y1={-6} x2={x - 3} y2={6}
              style={{ animationDelay: `${atraso}s`, animationDuration: `${1 + (i % 3) * 0.25}s` }}
            />
          ))}
        </g>
      )}

      {/* vento: folhinhas voando + linhas de ar */}
      {clima === 'vento' && (
        <g>
          <g className="pet-anim-folha">
            <path d="M0 0 C 5 -6 12 -6 14 0 C 8 5 3 5 0 0 Z" fill="#7fb08f" />
          </g>
          <g className="pet-anim-folha-2">
            <path d="M0 0 C 4 -5 10 -5 12 0 C 7 4 2 4 0 0 Z" fill="#e5a34f" />
          </g>
          <path className="pet-anim-vento-linha" d="M120 58 Q 142 54 168 58" stroke="#b9c6d4" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path className="pet-anim-vento-linha-2" d="M110 88 Q 134 84 162 88" stroke="#b9c6d4" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
