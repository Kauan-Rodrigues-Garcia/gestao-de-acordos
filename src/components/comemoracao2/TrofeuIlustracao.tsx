/**
 * TrofeuIlustracao — a imagem do card quando não há GIF.
 *
 * Desenhada em SVG, não baixada: aparece no mesmo quadro que o card, fica
 * nítida em qualquer tamanho e não depende de serviço nenhum — é justamente a
 * peça que segura o card quando a busca de GIFs falha.
 *
 * Taça dourada com estrela, ramos de louro e quatro brilhos que piscam. Os
 * brilhos param para quem pediu menos movimento ao sistema.
 */
import { useId } from 'react';
import { motion } from 'framer-motion';

/** Brilho de quatro pontas centrado em (x, y). */
function caminhoBrilho(x: number, y: number, r: number): string {
  const f = r * 0.28;
  return `M${x} ${y - r} Q${x + f} ${y - f} ${x + r} ${y} Q${x + f} ${y + f} ${x} ${y + r}`
    + ` Q${x - f} ${y + f} ${x - r} ${y} Q${x - f} ${y - f} ${x} ${y - r} Z`;
}

/** Folhas de um ramo de louro, de baixo para cima, espelháveis. */
const FOLHAS: readonly { x: number; y: number; giro: number }[] = [
  { x: 52, y: 150, giro: -20 },
  { x: 42, y: 132, giro: -35 },
  { x: 36, y: 112, giro: -50 },
  { x: 35, y: 91,  giro: -65 },
  { x: 39, y: 71,  giro: -80 },
];

const BRILHOS: readonly { x: number; y: number; r: number; atraso: number }[] = [
  { x: 150, y: 34,  r: 9,  atraso: 0 },
  { x: 48,  y: 44,  r: 6,  atraso: 0.6 },
  { x: 160, y: 96,  r: 5,  atraso: 1.1 },
  { x: 128, y: 18,  r: 4,  atraso: 1.6 },
];

export function TrofeuIlustracao({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const g = (nome: string) => `${nome}-${uid}`;

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Troféu">
      <defs>
        <radialGradient id={g('aura')} cx="50%" cy="42%" r="50%">
          <stop offset="0%" stopColor="#FFE8A3" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#FFE8A3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g('ouro')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF1B8" />
          <stop offset="35%" stopColor="#F8C846" />
          <stop offset="70%" stopColor="#D99A1E" />
          <stop offset="100%" stopColor="#A86A0B" />
        </linearGradient>
        <linearGradient id={g('borda')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF8DA" />
          <stop offset="100%" stopColor="#E7AE2E" />
        </linearGradient>
        <linearGradient id={g('base')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6B4512" />
          <stop offset="100%" stopColor="#2E1C05" />
        </linearGradient>
        <linearGradient id={g('folha')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F4D06F" />
          <stop offset="100%" stopColor="#C8901F" />
        </linearGradient>
      </defs>

      <circle cx="100" cy="94" r="86" fill={`url(#${g('aura')})`} />

      {/* Louro: o mesmo ramo, espelhado. */}
      {[1, -1].map((lado) => (
        <g key={lado} transform={lado === -1 ? 'translate(200 0) scale(-1 1)' : undefined}>
          <path d="M62 160 C38 140 30 104 40 64" fill="none" stroke="#C8901F" strokeWidth="3" strokeLinecap="round" />
          {FOLHAS.map((f, i) => (
            <ellipse key={i} cx={f.x} cy={f.y} rx="11" ry="5"
              transform={`rotate(${f.giro} ${f.x} ${f.y})`} fill={`url(#${g('folha')})`} />
          ))}
        </g>
      ))}

      {/* Alças */}
      <path d="M64 50 C36 48 34 86 70 94" fill="none" stroke={`url(#${g('ouro')})`} strokeWidth="8" strokeLinecap="round" />
      <path d="M136 50 C164 48 166 86 130 94" fill="none" stroke={`url(#${g('ouro')})`} strokeWidth="8" strokeLinecap="round" />

      {/* Taça */}
      <path d="M58 40 H142 V68 C142 104 122 122 100 124 C78 122 58 104 58 68 Z" fill={`url(#${g('ouro')})`} />
      <ellipse cx="100" cy="40" rx="42" ry="7" fill={`url(#${g('borda')})`} />
      <path d="M70 50 C68 78 76 100 90 112" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" />

      {/* Estrela */}
      <path
        d="M100 64 L104.7 74.6 L116.2 75.6 L107.5 83.2 L110.1 94.4 L100 88.5 L89.9 94.4 L92.5 83.2 L83.8 75.6 L95.3 74.6 Z"
        fill="#FFF7D6" stroke="#B87A12" strokeWidth="1.5" strokeLinejoin="round"
      />

      {/* Haste e base */}
      <path d="M92 123 H108 L105 142 H95 Z" fill={`url(#${g('ouro')})`} />
      <ellipse cx="100" cy="143" rx="15" ry="4.5" fill={`url(#${g('borda')})`} />
      <rect x="68" y="148" width="64" height="24" rx="5" fill={`url(#${g('base')})`} />
      <rect x="84" y="154" width="32" height="12" rx="2.5" fill={`url(#${g('ouro')})`} />

      {BRILHOS.map((b, i) => (
        <motion.path
          key={i}
          d={caminhoBrilho(b.x, b.y, b.r)}
          fill="#FFFBE8"
          style={{ transformOrigin: `${b.x}px ${b.y}px` }}
          initial={false}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.6, 1.1, 0.6] }}
          transition={{ duration: 2.2, delay: b.atraso, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </svg>
  );
}
