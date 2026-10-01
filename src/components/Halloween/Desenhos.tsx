import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { indiceDaPessoa, useTemaHalloween } from './tema';
import './halloween.css';

// ── Chapéu de bruxa ───────────────────────────────────────────────────────────

/** base, sombra, luz, aba, aba de cima */
const CORES_CHAPEU = [
  ['#6A22B5', '#55189A', '#7A33C8', '#4E1689', '#6724AE'], // roxo
  ['#3E8E3A', '#2F7230', '#52A84A', '#2A6428', '#3A8636'], // verde
  ['#E8731C', '#C95E12', '#F58B34', '#B45310', '#DB6A18'], // laranja
  ['#37313F', '#27222E', '#4C4557', '#1F1B25', '#332D3B'], // preto
  ['#9C1F3A', '#7E162E', '#B5304D', '#6B1226', '#8E1B35'], // vinho
] as const;

export function ChapeuBruxa({ chave, className, style }: { chave: string; className?: string; style?: React.CSSProperties }) {
  const [base, sombra, luz, aba, abaTopo] = CORES_CHAPEU[indiceDaPessoa(chave, CORES_CHAPEU.length)];
  return (
    <svg viewBox="0 0 100 76" className={className} style={style} aria-hidden="true">
      <path d="M2 64 C18 55 82 55 98 64 C84 73 16 73 2 64 Z" fill={aba} />
      <path d="M2 64 C18 55 82 55 98 64 C82 60.5 18 60.5 2 64 Z" fill={abaTopo} />
      <path d="M22 60 C28 44 34 26 40 10 C46 4 56 3 64 9 C71 14 79 22 89 31 C81 31 75 29 70 26 C72 38 74 50 78 60 Z" fill={base} />
      <path d="M60 9 C62 28 65 45 70 60 L78 60 C74 50 72 38 70 26 C75 29 81 31 89 31 C79 22 71 14 64 9 Z" fill={sombra} />
      <path d="M40 10 C34 26 28 44 22 60 L29 60 C33 44 38 26 45 7 Z" fill={luz} />
      <path d="M21 52 Q50 57.5 79 52 L80.5 60 Q50 65.5 19.5 60 Z" fill="#7B4420" />
      <path d="M20 57.5 Q50 63 80 57.5 L80.5 60 Q50 65.5 19.5 60 Z" fill="#5E3218" />
      <path d="M30 56.6 v3.2 M67 56.4 v3.2" stroke="#4A260F" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="43.5" y="51.5" width="13" height="11" rx="2.2" fill="#7B4420" stroke="#F5A21E" strokeWidth="2.8" />
      <path d="M50 53.5 v7" stroke="#3A1E0B" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Põe o chapéu por cima de uma foto quando o tema está ligado; fora dele,
 * devolve a foto como veio. O chapéu fica apoiado no topo da foto, caído para
 * a esquerda — nunca em cima do nome ou do texto ao lado.
 *
 * `escala` é a largura do chapéu em relação à foto. Em lista apertada (chat)
 * usa menos, para a aba não encostar na linha de cima.
 */
export function ComChapeu({ chave, tamanho, escala = 1.1, children }: { chave: string; tamanho: number; escala?: number; children: ReactNode }) {
  const ligado = useTemaHalloween();
  if (!ligado || tamanho < 24) return <>{children}</>;
  return (
    <span className="hw-com-chapeu" style={{ width: tamanho, height: tamanho }}>
      {children}
      <ChapeuBruxa chave={chave} className="hw-chapeu" style={{ width: tamanho * escala, bottom: `${Math.round(62 + escala * 8)}%` }} />
    </span>
  );
}

// ── Abóbora do chat ───────────────────────────────────────────────────────────

const L = '#FFA920', D = '#FF8F1F', OUT = '#B82200';

function Olho({ espelhado }: { espelhado?: boolean }) {
  return (
    <g transform={espelhado ? 'translate(194 0) scale(-1 1)' : undefined}>
      <path d="M47 111 C50 96 58 86 67 86 C77 86 84 96 82 116 C71 112 58 111 47 111 Z" fill="#BA2C0A" />
      <path className="rosto" d="M54 111 C56 98 62 89 69 89 C77 89 83 99 82 115 C74 113 64 111 54 111 Z" />
      <rect x="66.5" y="100.5" width="7" height="15" rx="3.5" fill={L} />
      <path d="M73.5 104 C75.5 104 76 108 75.8 115 L73.5 114.5 Z" fill="#BA2C0A" />
    </g>
  );
}

/** A bolha do chat no Halloween. Com mensagem nova, o rosto acende como vela. */
export function AboboraChat({ acesa }: { acesa: boolean }) {
  return (
    <svg viewBox="20 18 154 158" className={cn('hw-abobora', acesa && 'acesa')} aria-hidden="true">
      <defs>
        <clipPath id="hw-ab-e"><ellipse cx="68" cy="112" rx="34" ry="48" /></clipPath>
        <clipPath id="hw-ab-d"><ellipse cx="126" cy="112" rx="34" ry="48" /></clipPath>
        <clipPath id="hw-ab-c"><path d="M58 118 C58 88 74 74 93 73 L100 75 C120 72 138 88 138 118 C138 150 121 170 99 168 C77 170 58 150 58 118 Z" /></clipPath>
      </defs>
      <g className="ab-corpo">
        <ellipse cx="97" cy="171" rx="62" ry="7.5" fill="oklch(0.2 0.03 180 / .35)" />
        <path d="M62 70 C70 53 92 48 101 57 C110 51 129 52 134 70 L134 100 L62 100 Z" fill={D} />
        <path d="M62 70 C70 53 92 48 101 57 C110 51 129 52 134 70" fill="none" stroke={OUT} strokeWidth="1" />
        <ellipse cx="55" cy="112" rx="31" ry="54" fill={D} stroke={OUT} strokeWidth="1.1" />
        <ellipse cx="139" cy="113" rx="30" ry="54" fill={D} stroke={OUT} strokeWidth="1.1" />
        <g clipPath="url(#hw-ab-e)">
          <rect x="30" y="60" width="80" height="110" fill={D} /><ellipse cx="72" cy="105" rx="31" ry="42" fill={L} />
          <path d="M58 70 C66 66 74 70 73 77 C72 84 62 86 58 80 C55 76 55 72 58 70 Z M47 76 C51 74 54 78 52 83 C50 87 45 86 45 81 Z M44 125 C48 122 52 125 51 131 C50 136 44 136 43 131 Z" fill={D} />
        </g>
        <ellipse cx="68" cy="112" rx="34" ry="48" fill="none" stroke={OUT} strokeWidth="1" />
        <g clipPath="url(#hw-ab-d)">
          <rect x="90" y="60" width="80" height="110" fill={D} /><ellipse cx="122" cy="105" rx="31" ry="42" fill={L} />
          <path d="M117 70 C124 66 133 70 132 77 C131 83 122 84 119 79 C116 75 115 72 117 70 Z M138 99 C144 98 147 105 145 112 C143 117 137 116 136 110 C135 104 135 100 138 99 Z" fill={D} />
        </g>
        <ellipse cx="126" cy="112" rx="34" ry="48" fill="none" stroke={OUT} strokeWidth="1" />
        <g clipPath="url(#hw-ab-c)">
          <rect x="55" y="70" width="90" height="105" fill={D} /><ellipse cx="98" cy="112" rx="38" ry="47" fill={L} />
          <path d="M95 84 C101 83 105 86 104 91 C103 96 96 96 94 92 C92 88 92 85 95 84 Z M88 93 C92 92 95 96 93 101 C91 105 85 104 85 99 C85 95 86 93 88 93 Z" fill={D} />
        </g>
        <path d="M58 118 C58 88 74 74 93 73 L100 75 C120 72 138 88 138 118 C138 150 121 170 99 168 C77 170 58 150 58 118 Z" fill="none" stroke={OUT} strokeWidth="1.1" />
        <Olho /><Olho espelhado />
        <path d="M89 124.5 L96.5 108.5 L104 124.5 Z" fill="#BA2C0A" />
        <path className="rosto" d="M92.5 122.8 L96.5 114 L100.7 122.8 Z" />
        <path d="M50 128 Q97 133.5 145 127 C141 149 123 163 97 163 C71 163 54 150 50 128 Z" fill="#BA2C0A" />
        <path className="rosto" d="M59 130.5 Q97 135.5 139 129.5 C135 148 119 159.5 97 159.5 C76 159.5 62 149 59 130.5 Z" />
        <path d="M65 129.5 L77 130.8 L76.8 138.5 C76.5 141 67 141.5 66 139 C65 136 65 132 65 129.5 Z" fill={L} />
        <path d="M115 131.2 L127 130.2 C127 133 127.5 137 126.5 139.5 C125 142 116.5 141.5 116 139 Z" fill={L} />
        <path d="M88.5 162.8 L88.8 150 C89 147.5 97.5 147.8 99 150.2 C99.8 152 99.3 157 98.7 162.8 Z" fill={L} />
      </g>
      <g className="ab-cipo">
        <path d="M92 71 C101 64 106 55 99 47 C94 42 87 41 81.5 43 C84 35 90 25 95.5 23 C109 33 114 48 111 60 C109 66 106.5 70 104 73 Z" fill="#8A0000" />
        <path d="M81.5 43 C84 35 90 25 95.5 23 C96.5 30 89 40 81.5 43 Z" fill="#B81515" />
        <path d="M93 69 C100 66 106 64 110.5 61 C109 66 106.5 70 104 73 L94 72.5 Z" fill="#6B0000" />
      </g>
    </svg>
  );
}
