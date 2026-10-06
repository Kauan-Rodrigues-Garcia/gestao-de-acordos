/**
 * O Batmóvel do filme de 2022 passando no rodapé, com o ronco do motor
 * (`ronco.ts`). O ronco segue a regra dos efeitos: só com a música tocando.
 */
import { useEffect, useRef } from 'react';
import { roncar } from './ronco';
import { volumeDosEfeitos } from './regente';

const TRAVESSIA_MS = 4_200;

export function Batmovel({ aoTerminar }: { aoTerminar: () => void }) {
  // O modo estrito monta duas vezes em desenvolvimento: um ronco só.
  const roncou = useRef(false);
  useEffect(() => {
    if (!roncou.current) { roncou.current = true; roncar(TRAVESSIA_MS, Math.min(1, volumeDosEfeitos() * 0.9)); }
    const t = window.setTimeout(aoTerminar, TRAVESSIA_MS + 300);
    return () => window.clearTimeout(t);
  }, [aoTerminar]);
  return (
    <div className="gt-batmovel" aria-hidden="true" style={{ ['--dur' as string]: `${TRAVESSIA_MS}ms` }}>
      <div className="gt-carro"><CarroSvg /></div>
    </div>
  );
}

/**
 * De lado, virado para a esquerda: muscle car comprido e baixo, preto fosco;
 * o bico em cunha com o para-choque de blocos e as presilhas prateadas, o
 * farol numa fenda; o motor saindo do capô com as grades e o brilho laranja
 * nas frestas; teto curto, traseira fastback com aerofólio pequeno, pneus de
 * trás maiores e o propulsor aceso atrás. Luz laranja embaixo, como no filme.
 */
function CarroSvg() {
  return (
    <svg viewBox="0 0 320 100" overflow="visible">
      <defs>
        <linearGradient id="bm-facho" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffe3a6" stopOpacity="0.6" />
          <stop offset="0.6" stopColor="#ffd98c" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffd98c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bm-lataria" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24201f" />
          <stop offset="0.25" stopColor="#0f0d0d" />
          <stop offset="1" stopColor="#050404" />
        </linearGradient>
        <radialGradient id="bm-chama" cx="0.1" cy="0.5" r="0.9">
          <stop offset="0" stopColor="#fff4c4" />
          <stop offset="0.3" stopColor="#ff9a2a" />
          <stop offset="1" stopColor="#c0150f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bm-chao" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff6a1a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff6a1a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bm-painel" cx="0.2" cy="0.8" r="0.7">
          <stop offset="0" stopColor="#ff2a2a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#140808" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Farol: o facho amarelado na frente, rente ao chão, e a poça de luz */}
      <polygon className="gt-facho" points="10,60 10,64 -260,98 -260,40" fill="url(#bm-facho)" />
      <ellipse cx="-90" cy="94" rx="130" ry="6" fill="#ffe0a0" opacity="0.14" />
      {/* Luz laranja embaixo e a sombra */}
      <ellipse cx="160" cy="92" rx="150" ry="6" fill="#000" opacity="0.6" />
      <ellipse cx="150" cy="90" rx="110" ry="9" fill="url(#bm-chao)" />
      {/* O propulsor aceso atrás */}
      <ellipse className="gt-chama" cx="322" cy="56" rx="24" ry="5.5" fill="url(#bm-chama)" />
      <rect x="303" y="51" width="12" height="10" rx="2" fill="#141212" stroke="#3a3433" strokeWidth="0.7" />
      <rect x="312" y="53" width="3" height="6" fill="#ff8a2a" />
      {/* Lataria */}
      <path fill="url(#bm-lataria)" stroke="#2c2826" strokeWidth="0.7"
        d="M10 76 L7 67 L12 58 L40 54 L132 48 L160 33 Q175 30 196 30 L214 31 Q236 34 258 44 L296 47 L303 45 L306 49 L308 66 L302 76 L271 76 A21 21 0 0 0 229 76 L88 76 A19 19 0 0 0 50 76 L16 76 Z" />
      {/* Para-lama traseiro largo e o vinco da lateral */}
      <path d="M216 62 Q248 50 284 58" fill="none" stroke="#3a3533" strokeWidth="0.9" />
      <path d="M20 64 L300 61" fill="none" stroke="#2f2b2a" strokeWidth="0.6" />
      {/* Aerofólio pequeno */}
      <path d="M286 46 L300 41 L304 42 L298 47 Z" fill="#0d0b0b" stroke="#2c2826" strokeWidth="0.5" />
      {/* Vidro, com o vermelho do painel lá dentro */}
      <path d="M138 47 L160 35 Q176 32.5 195 32.5 L212 33.5 L229 41 L227 46 Z" fill="#0d0809" />
      <path d="M138 47 L160 35 Q176 32.5 195 32.5 L212 33.5 L229 41 L227 46 Z" fill="url(#bm-painel)" />
      <path d="M190 33 L186 46" stroke="#1e1a19" strokeWidth="1.6" />
      {/* O motor saindo do capô: grade, presilhas prateadas e o laranja nas frestas */}
      <path d="M66 52 L72 45.5 L122 42.5 L127 48.5 Z" fill="#100e0e" stroke="#3b3634" strokeWidth="0.6" />
      {[80, 90, 100, 110].map(x => <path key={x} d={`M${x} 51 L${x + 2} 44.5`} stroke="#ff7a1a" strokeWidth="1.2" opacity="0.85" />)}
      <path d="M76 51.5 L80 44.8 M116 49.2 L119 43" stroke="#9a9c9f" strokeWidth="1.4" />
      {/* Bico: para-choque em blocos, presilhas e a fenda do farol */}
      <path d="M7 67 L12 58 L24 57 L22 76 L10 76 Z" fill="#121010" stroke="#2c2826" strokeWidth="0.6" />
      <rect x="14" y="57.5" width="3.2" height="18" fill="#8f9195" />
      <rect x="8.5" y="59.5" width="12" height="2.6" rx="1" fill="#e6eeff" />
      <rect x="8.5" y="59.5" width="12" height="2.6" rx="1" fill="#cfe0ff" style={{ filter: 'blur(1.5px)' }} opacity="0.9" />
      {/* Rodas: pneus largos, os de trás maiores */}
      {[[69, 76, 17], [250, 74, 19]].map(([x, y, r]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill="#070606" stroke="#1b1919" strokeWidth="2.5" />
          <g className="gt-roda">
            <circle cx={x} cy={y} r={r * 0.52} fill="#131111" stroke="#2c2928" strokeWidth="1" />
            {[0, 72, 144, 216, 288].map(a => (
              <path key={a} d={`M${x} ${y} L${x + Math.cos((a * Math.PI) / 180) * r * 0.5} ${y + Math.sin((a * Math.PI) / 180) * r * 0.5}`} stroke="#2c2928" strokeWidth="2" />
            ))}
            <circle cx={x} cy={y} r={r * 0.12} fill="#3a3635" />
          </g>
        </g>
      ))}
    </svg>
  );
}

