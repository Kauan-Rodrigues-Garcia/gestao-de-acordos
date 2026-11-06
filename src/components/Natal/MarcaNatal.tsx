import { useEffect, type CSSProperties } from 'react';

/**
 * O nome do sistema no menu, com «Boas Festas» em cima (Cleber, 05/11/2026:
 * era «Feliz Natal»; e «uma fonte mais bonitinha») — Pacifico (OFL,
 * `public/fonts/`), em vermelho de Natal com um fio dourado e uma estrelinha
 * que pisca devagar.
 *
 * Estilo aqui, e não em `natal.css`: o `Layout` importa este componente
 * direto, e a folha do tema só desce para quem está com ele ligado.
 */
const ID_FONTE = 'nt-fonte-natal';
const FONTE = `@font-face {
  font-family: 'Pacifico';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/pacifico.woff2') format('woff2');
}
@keyframes nt-marca-estrela {
  0%, 62%, 100% { opacity: .35; transform: scale(.6) rotate(0deg); }
  78% { opacity: 1; transform: scale(1) rotate(45deg); }
}`;

function carregarFonte() {
  if (typeof document === 'undefined' || document.getElementById(ID_FONTE)) return;
  const estilo = document.createElement('style');
  estilo.id = ID_FONTE;
  estilo.textContent = FONTE;
  document.head.appendChild(estilo);
}

const TITULO: CSSProperties = {
  fontFamily: "'Pacifico', 'Brush Script MT', cursive",
  fontWeight: 400,
  fontSize: 19,
  lineHeight: 1.05,
  letterSpacing: '0.01em',
  // Vermelho com um degradê de leve (mais claro em cima), e o fio dourado embaixo.
  backgroundImage: 'linear-gradient(180deg, oklch(0.66 0.21 27) 15%, oklch(0.52 0.2 27) 90%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 1px 0 oklch(0.82 0.13 85 / .75)) drop-shadow(0 0 6px oklch(0.6 0.21 27 / .18))',
  whiteSpace: 'nowrap',
  paddingRight: 2,
};

const ESTRELA: CSSProperties = {
  display: 'inline-block',
  width: 9,
  height: 9,
  marginLeft: 3,
  verticalAlign: 'top',
  animation: 'nt-marca-estrela 3.6s ease-in-out infinite',
};

export function MarcaNatal({ nome }: { nome: string }) {
  useEffect(carregarFonte, []);
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="flex items-start" aria-hidden="true">
        <span style={TITULO}>Boas Festas</span>
        <svg viewBox="-8 -8 16 16" style={ESTRELA}>
          <path d="M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8 Z" fill="oklch(0.82 0.15 85)" />
        </svg>
      </span>
      <p className="font-bold text-sm text-sidebar-foreground leading-none">{nome}</p>
    </div>
  );
}
