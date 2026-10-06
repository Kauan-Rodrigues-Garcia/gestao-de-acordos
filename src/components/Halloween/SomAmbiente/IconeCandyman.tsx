/**
 * O olho do pôster de Candyman (1992), no lugar do ícone do lucide.
 *
 * Desenhado a partir do pôster que o Cleber mandou em 05/10/2026: o olho
 * arregalado com a íris vermelho-sangue, a silhueta dele no lugar da pupila, o
 * reflexo da janela e a abelha pousada na borda da íris. Cores próprias (não
 * `currentColor`): o chão escuro do ícone vem de `somAmbiente.css`.
 */
import { useId } from 'react';

/** O contorno do olho, arregalado: o mesmo serve de branco, de recorte e de pálpebra. */
const OLHO = 'M0.8 12 C4.5 3.4 19.5 3.4 23.2 12 C19.5 20.6 4.5 20.6 0.8 12 Z';

export function IconeCandyman({ className }: { className?: string }) {
  const id = useId();
  const iris = `${id}-iris`, branco = `${id}-branco`, olho = `${id}-olho`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={iris} cx="0.42" cy="0.38" r="0.65">
          <stop offset="0" stopColor="#a3191d" />
          <stop offset="0.55" stopColor="#5a080c" />
          <stop offset="1" stopColor="#1c0204" />
        </radialGradient>
        <radialGradient id={branco} cx="0.5" cy="0.5" r="0.62">
          <stop offset="0.5" stopColor="#f6e6de" />
          <stop offset="1" stopColor="#d79a90" />
        </radialGradient>
        <clipPath id={olho}>
          <path d={OLHO} />
        </clipPath>
      </defs>
      {/* O branco e a íris, cortada em cima e embaixo pelas pálpebras, como no pôster */}
      <path d={OLHO} fill={`url(#${branco})`} />
      <g clipPath={`url(#${olho})`}>
        <circle cx="11.6" cy="12" r="7" fill={`url(#${iris})`} />
        {/* Ele, no lugar da pupila: cabeça e o casaco */}
        <path d="M11.6 6.9 a1.5 1.65 0 1 1 0 3.3 a1.5 1.65 0 1 1 0 -3.3 Z M8.2 20 C8.4 14 9.3 10.8 11.6 10.8 C13.9 10.8 14.8 14 15 20 Z" fill="#0b0102" />
        {/* O reflexo da janela */}
        <path d="M6.9 8.4 L9 7.6 L9 10.6 L6.9 11.2 Z" fill="#fff" opacity="0.85" />
      </g>
      <path d={OLHO} fill="none" stroke="#e7b3a6" strokeWidth="1.1" strokeLinejoin="round" />
      {/* A abelha, pousada na borda da íris: cabeça para baixo, asas para cima */}
      <g transform="rotate(-40 17.2 15.6)">
        <ellipse cx="16.2" cy="13.1" rx="2.4" ry="1.2" fill="#eef6f8" fillOpacity="0.55" stroke="#fff" strokeOpacity="0.8" strokeWidth="0.45" transform="rotate(-28 16.2 13.1)" />
        <ellipse cx="18.6" cy="13.3" rx="2" ry="1" fill="#eef6f8" fillOpacity="0.45" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.45" transform="rotate(20 18.6 13.3)" />
        <ellipse cx="17.6" cy="15.6" rx="3.6" ry="1.85" fill="#e8a020" />
        <path d="M16.2 13.9 L16.2 17.3 M17.9 13.8 L17.9 17.4 M19.6 14.2 L19.6 17" stroke="#2b1503" strokeWidth="0.85" />
        <circle cx="13.8" cy="15.6" r="1.35" fill="#2b1503" />
      </g>
    </svg>
  );
}
