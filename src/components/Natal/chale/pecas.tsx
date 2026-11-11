/**
 * As peças do palco do chalé (11/11/2026).
 *
 * O chalé era um SVG só, com dezenas de animações de CSS dentro dele — e
 * animação dentro de SVG não vai para a placa de vídeo: cada uma faz a página
 * redesenhar o desenho inteiro a cada quadro (medido no Dashboard em 10/11).
 * Agora é um palco HTML: o que fica parado é desenhado uma vez, e cada pedaço
 * que mexe é uma caixa própria, animada só por `transform` e `opacity`.
 *
 * Tudo aqui usa as coordenadas do QUADRO (600 × 176, o chão em 176):
 *
 *   - `D`  — um desenho: um `<svg>` na posição `x, y`, cujo `viewBox` começa em
 *            `x, y`. O que vai dentro é desenhado nas coordenadas do quadro.
 *   - `Cx` — uma caixa que agrupa outras peças. Dentro dela as coordenadas
 *            continuam sendo as do quadro (a `.ch-o` desfaz o deslocamento).
 *
 * `o` é o ponto, no quadro, em volta do qual a peça gira ou estica.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { L } from './medidas';

interface Caixa {
  x: number; y: number; w: number; h: number;
  /** O ponto de apoio do giro, nas coordenadas do quadro. */
  o?: readonly [number, number];
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const origem = (c: Caixa): CSSProperties =>
  (c.o ? { transformOrigin: `${c.o[0] - c.x}px ${c.o[1] - c.y}px` } : {});

export function D(c: Caixa) {
  return (
    <svg className={cn('ch-d', c.className)} width={c.w} height={c.h} viewBox={`${c.x} ${c.y} ${c.w} ${c.h}`}
      style={{ left: c.x, top: c.y, ...origem(c), ...c.style }}>
      {c.children}
    </svg>
  );
}

export function Cx({ x, y, w, h, o, className, style, children, ...resto }: Caixa & Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>) {
  return (
    <div className={cn('ch-cx', className)} style={{ left: x, top: y, width: w, height: h, ...origem({ x, y, w, h, o }), ...style }} {...resto}>
      <div className="ch-o" style={{ left: -x, top: -y }}>{children}</div>
    </div>
  );
}

/** Degradês e padrões de todas as peças: um SVG vazio, só com as definições. */
export function Defs() {
  return (
    <svg className="ch-defs" width={0} height={0} aria-hidden="true">
      <defs>
        {/* janela */}
        <linearGradient id="nt-ch-noite" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B1830" />
          <stop offset=".55" stopColor="#1D3F6E" />
          <stop offset="1" stopColor="#3B6A9E" />
        </linearGradient>
        <radialGradient id="nt-ch-lua" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFF6D6" stopOpacity=".6" />
          <stop offset="1" stopColor="#FFF6D6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nt-ch-moldura" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7F2EA" />
          <stop offset="1" stopColor="#D6CBBD" />
        </linearGradient>
        <linearGradient id="nt-ch-veludo" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8E1F27" />
          <stop offset=".35" stopColor="#C2343B" />
          <stop offset=".6" stopColor="#A2262E" />
          <stop offset="1" stopColor="#C93A40" />
        </linearGradient>
        {/* madeira */}
        <linearGradient id="nt-ch-madeira" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A6744C" />
          <stop offset="1" stopColor="#6E4529" />
        </linearGradient>
        <linearGradient id="nt-ch-madeira-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7A4E30" />
          <stop offset=".45" stopColor="#A9774F" />
          <stop offset="1" stopColor="#6E4529" />
        </linearGradient>
        <linearGradient id="nt-ch-nogueira" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A5A38" />
          <stop offset=".5" stopColor="#74482A" />
          <stop offset="1" stopColor="#57341E" />
        </linearGradient>
        {/* lareira */}
        <pattern id="nt-ch-tijolo" width={24} height={12} patternUnits="userSpaceOnUse">
          <rect width={24} height={12} fill="#7E3F2D" />
          <rect x={0.8} y={0.8} width={22.4} height={4.8} rx={1.2} fill="#B9614A" />
          <rect x={0.8} y={0.8} width={22.4} height={1.2} rx={0.6} fill="#D07C63" />
          <rect x={0.8} y={4.6} width={22.4} height={1} rx={0.5} fill="#9A4B37" />
          <rect x={-11.2} y={6.8} width={22.4} height={4.8} rx={1.2} fill="#AD5741" />
          <rect x={12.8} y={6.8} width={22.4} height={4.8} rx={1.2} fill="#C06A50" />
          <rect x={12.8} y={6.8} width={22.4} height={1.2} rx={0.6} fill="#D58468" />
          <rect x={12.8} y={10.6} width={22.4} height={1} rx={0.5} fill="#9F513B" />
        </pattern>
        <linearGradient id="nt-ch-sombra-lados" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".3" />
          <stop offset=".14" stopColor="#000" stopOpacity="0" />
          <stop offset=".86" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".34" />
        </linearGradient>
        <linearGradient id="nt-ch-pedra" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EFE9DF" />
          <stop offset="1" stopColor="#C4B9AA" />
        </linearGradient>
        <radialGradient id="nt-ch-boca" cx=".5" cy=".85" r=".8">
          <stop offset="0" stopColor="#6A2C16" />
          <stop offset=".55" stopColor="#24110A" />
          <stop offset="1" stopColor="#0E0705" />
        </radialGradient>
        <radialGradient id="nt-ch-calor" cx="0.5" cy="0.6" r="0.5">
          <stop offset="0" stopColor="#FFB347" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FF7A1A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nt-ch-chama-fora" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F2481B" />
          <stop offset=".6" stopColor="#FF7A1F" />
          <stop offset="1" stopColor="#FFB347" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id="nt-ch-chama-meio" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF8C1F" />
          <stop offset="1" stopColor="#FFD24D" />
        </linearGradient>
        <linearGradient id="nt-ch-chama-miolo" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FFE58A" />
          <stop offset="1" stopColor="#FFFBE6" />
        </linearGradient>
        <radialGradient id="nt-ch-luz-fogo" cx=".5" cy=".9" r=".55">
          <stop offset="0" stopColor="#FFB347" stopOpacity=".4" />
          <stop offset="1" stopColor="#FFB347" stopOpacity="0" />
        </radialGradient>
        {/* árvore */}
        <linearGradient id="nt-ch-pinho" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#46A56D" />
          <stop offset=".55" stopColor="#2C7A4E" />
          <stop offset="1" stopColor="#1B5235" />
        </linearGradient>
        {/* bolas */}
        <radialGradient id="nt-ch-bola-vermelha" cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor="#FF9C9C" />
          <stop offset=".45" stopColor="#D63A3F" />
          <stop offset="1" stopColor="#8E1C22" />
        </radialGradient>
        <radialGradient id="nt-ch-bola-ouro" cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor="#FFF4C8" />
          <stop offset=".45" stopColor="#E7B649" />
          <stop offset="1" stopColor="#9C6C14" />
        </radialGradient>
        <radialGradient id="nt-ch-bola-azul" cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor="#CFEAFF" />
          <stop offset=".45" stopColor="#3E86D1" />
          <stop offset="1" stopColor="#1B4C85" />
        </radialGradient>
        {/* a manta xadrez */}
        <pattern id="nt-ch-xadrez" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <rect width={10} height={10} fill="#2F7D52" />
          <rect x={0} y={3.5} width={10} height={3} fill="#C8353A" opacity=".85" />
          <rect x={3.5} y={0} width={3} height={10} fill="#C8353A" opacity=".7" />
          <rect x={0} y={4.6} width={10} height={0.8} fill="#E2B04A" opacity=".9" />
          <rect x={4.6} y={0} width={0.8} height={10} fill="#E2B04A" opacity=".8" />
        </pattern>
        {/* a parede some nas pontas: não tem borda dura */}
        <linearGradient id="nt-ch-some-lados" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={L} y2={0}>
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.1" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.9" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* sombra de contato, no chão */}
        <radialGradient id="nt-ch-contato" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#000" stopOpacity=".26" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {/* a TV */}
        <radialGradient id="nt-ch-tela" cx=".5" cy=".45" r=".7">
          <stop offset="0" stopColor="#3C6A9A" />
          <stop offset="1" stopColor="#0B1626" />
        </radialGradient>
        <linearGradient id="nt-ch-vidro-tv" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".34" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".28" />
        </linearGradient>
        {/* o Grinch */}
        <linearGradient id="gr-pelo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B4DA4E" />
          <stop offset=".6" stopColor="#8DBE33" />
          <stop offset="1" stopColor="#6A9A22" />
        </linearGradient>
        <linearGradient id="gr-casaco" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EE4B45" />
          <stop offset=".55" stopColor="#D02A2E" />
          <stop offset="1" stopColor="#9C1A22" />
        </linearGradient>
        <linearGradient id="gr-pele-branca" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E2DED6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
