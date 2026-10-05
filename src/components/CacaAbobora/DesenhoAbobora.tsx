/**
 * DesenhoAbobora.tsx — a abóbora da caça.
 *
 * Gomos com volume (cada um com o próprio degradê, os de trás mais escuros),
 * brilho de luz no alto à esquerda, talo de madeira com a ponta cortada, folha
 * e gavinha. O rosto é recortado e aceso por dentro: a vela tremula pelo CSS
 * (`.cacab-vela`), e quem pede menos movimento vê a luz parada.
 *
 * Os ids dos degradês saem do `useId`: a abóbora aparece ao mesmo tempo na
 * tela, na faixa e no painel, e um id repetido faria um desenho pegar a cor do
 * outro.
 */
import { useId } from 'react';

export function DesenhoAbobora({ className, acesa = true }: { className?: string; acesa?: boolean }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `cacab-${n}-${id}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={g('frente')} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffc46b" />
          <stop offset=".45" stopColor="#f7902a" />
          <stop offset="1" stopColor="#c4570e" />
        </radialGradient>
        <radialGradient id={g('lado')} cx="50%" cy="35%" r="80%">
          <stop offset="0" stopColor="#f39434" />
          <stop offset=".6" stopColor="#d96a16" />
          <stop offset="1" stopColor="#9c3f08" />
        </radialGradient>
        <radialGradient id={g('fundo')} cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#d9721c" />
          <stop offset="1" stopColor="#7d3006" />
        </radialGradient>
        <linearGradient id={g('talo')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a9a4a" />
          <stop offset=".55" stopColor="#5b6b2a" />
          <stop offset="1" stopColor="#3a4418" />
        </linearGradient>
        <linearGradient id={g('folha')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fb04a" />
          <stop offset="1" stopColor="#3f6b22" />
        </linearGradient>
        <radialGradient id={g('luz')} cx="50%" cy="55%" r="65%">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset=".45" stopColor="#ffd25a" />
          <stop offset="1" stopColor="#ff8a1c" />
        </radialGradient>
        <radialGradient id={g('sombra')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#000" stopOpacity=".32" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Chão */}
      <ellipse cx="32" cy="58.5" rx="21" ry="3.6" fill={`url(#${g('sombra')})`} />

      {/* Gomos de trás, de fora para dentro */}
      <ellipse cx="14.5" cy="37" rx="10.5" ry="16" fill={`url(#${g('fundo')})`} />
      <ellipse cx="49.5" cy="37" rx="10.5" ry="16" fill={`url(#${g('fundo')})`} />
      <ellipse cx="20.5" cy="37.5" rx="11.5" ry="18" fill={`url(#${g('lado')})`} />
      <ellipse cx="43.5" cy="37.5" rx="11.5" ry="18" fill={`url(#${g('lado')})`} />
      {/* Gomo da frente */}
      <ellipse cx="32" cy="38" rx="13.5" ry="19.5" fill={`url(#${g('frente')})`} />

      {/* Vincos entre os gomos */}
      <path d="M23.5 22.5 C19.5 31 19.5 45 23.5 54" stroke="#8f3a07" strokeOpacity=".45" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <path d="M40.5 22.5 C44.5 31 44.5 45 40.5 54" stroke="#8f3a07" strokeOpacity=".45" strokeWidth=".9" fill="none" strokeLinecap="round" />

      {/* Brilho */}
      <ellipse cx="25.5" cy="26" rx="4.2" ry="7.5" fill="#fff" opacity=".26" transform="rotate(-18 25.5 26)" />
      <ellipse cx="12.5" cy="31" rx="1.6" ry="4.5" fill="#fff" opacity=".14" transform="rotate(-10 12.5 31)" />

      {/* Talo, folha e gavinha */}
      <path d="M29.6 20.5 C29.4 15.5 30.2 11.2 33.6 8.2 L37.2 10.1 C34.8 12.6 34.2 16 34.6 20.6 C33 21.4 31.2 21.4 29.6 20.5 Z" fill={`url(#${g('talo')})`} />
      <ellipse cx="35.4" cy="9.1" rx="2.1" ry="1.2" transform="rotate(28 35.4 9.1)" fill="#c9b27a" />
      <path d="M34.8 15.5 C39.5 10.8 46.5 10.6 50 13.6 C46.8 18.6 39.6 19.6 34.8 15.5 Z" fill={`url(#${g('folha')})`} />
      <path d="M36.2 15.4 C40.2 14.6 44.4 14 48.2 13.8" stroke="#2f5218" strokeWidth=".7" fill="none" strokeLinecap="round" />
      <path d="M29.8 17.6 C26.6 16.8 24.6 14.6 25.6 12.4 C26.6 10.4 29.4 11 29 13.2" stroke="#55702a" strokeWidth="1.1" fill="none" strokeLinecap="round" />

      {/* Rosto recortado, aceso por dentro */}
      <g className={acesa ? 'cacab-vela' : undefined}>
        <path d="M21.5 34.2 L25.4 28.2 L29.2 34.2 Z" fill="#4a1c03" />
        <path d="M34.8 34.2 L38.6 28.2 L42.5 34.2 Z" fill="#4a1c03" />
        <path d="M22.4 33.6 L25.4 29.2 L28.3 33.6 Z" fill={`url(#${g('luz')})`} />
        <path d="M35.7 33.6 L38.6 29.2 L41.6 33.6 Z" fill={`url(#${g('luz')})`} />
        <path d="M30.6 38.8 L32 36.4 L33.4 38.8 Z" fill="#4a1c03" />
        <path
          d="M19.8 41.2 C24.5 44 39.5 44 44.2 41.2 C43.4 47.6 38.6 51.6 32 51.6 C25.4 51.6 20.6 47.6 19.8 41.2 Z"
          fill="#4a1c03"
        />
        <path
          d="M21.2 42.6 C25.6 44.8 38.4 44.8 42.8 42.6 C41.6 47.4 37.4 50.4 32 50.4 C26.6 50.4 22.4 47.4 21.2 42.6 Z"
          fill={`url(#${g('luz')})`}
        />
        {/* Dentes: a casca que sobrou do recorte */}
        <path d="M26.2 44.3 L29.6 44.8 L29.4 47.2 C28.6 48 27 48 26.4 47.2 Z" fill="#e5801f" />
        <path d="M34.4 44.8 L37.8 44.3 L37.6 47.2 C37 48 35.4 48 34.6 47.2 Z" fill="#e5801f" />
        <path d="M30.6 50.3 L30.8 48.4 C31.4 47.8 32.6 47.8 33.2 48.4 L33.4 50.3 Z" fill="#e5801f" />
      </g>
    </svg>
  );
}
