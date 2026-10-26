import { useEffect, type CSSProperties } from 'react';

/**
 * O nome do sistema no menu, com «Feliz Natal» em cima — Mountains of
 * Christmas (OFL, `public/fonts/`), em vermelho de Natal com um fio dourado.
 *
 * Estilo aqui, e não em `natal.css`: o `Layout` importa este componente
 * direto, e a folha do tema só desce para quem está com ele ligado.
 */
const ID_FONTE = 'nt-fonte-natal';
const FONTE = `@font-face {
  font-family: 'Mountains of Christmas';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/mountains-of-christmas.woff2') format('woff2');
}`;

function carregarFonte() {
  if (typeof document === 'undefined' || document.getElementById(ID_FONTE)) return;
  const estilo = document.createElement('style');
  estilo.id = ID_FONTE;
  estilo.textContent = FONTE;
  document.head.appendChild(estilo);
}

const TITULO: CSSProperties = {
  fontFamily: "'Mountains of Christmas', Georgia, serif",
  fontWeight: 700,
  fontSize: 21,
  lineHeight: 1,
  letterSpacing: '0.02em',
  color: 'oklch(0.6 0.21 27)',
  textShadow: '0 1px 0 oklch(0.82 0.13 85 / .7), 0 0 8px oklch(0.6 0.21 27 / .22)',
  whiteSpace: 'nowrap',
};

export function MarcaNatal({ nome }: { nome: string }) {
  useEffect(carregarFonte, []);
  return (
    <div className="flex flex-col gap-[3px]">
      <span style={TITULO} aria-hidden="true">Feliz Natal</span>
      <p className="font-bold text-sm text-sidebar-foreground leading-none">{nome}</p>
    </div>
  );
}
