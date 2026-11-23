/** O hot dog do sorteio dos cupons (a arte da campanha, 23/11/2026). */
export function HotDog({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 250 150" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hd-pao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5c27a" /><stop offset=".55" stopColor="#e09a45" /><stop offset="1" stopColor="#b9702a" />
        </linearGradient>
        <linearGradient id="hd-pao2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd99c" /><stop offset="1" stopColor="#e8a654" />
        </linearGradient>
        <linearGradient id="hd-salsicha" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2573a" /><stop offset=".5" stopColor="#b8361f" /><stop offset="1" stopColor="#7e2213" />
        </linearGradient>
      </defs>
      <path d="M22 70 Q125 28 228 70 L222 92 Q125 62 28 92 Z" fill="url(#hd-pao2)" />
      <rect x="8" y="64" width="234" height="38" rx="19" fill="url(#hd-salsicha)" />
      <path d="M30 74 Q125 64 220 74" stroke="#ff8a6a" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".7" />
      <path d="M34 80 l14 -9 l14 9 l14 -9 l14 9 l14 -9 l14 9 l14 -9 l14 9 l14 -9 l14 9 l14 -9 l14 9 l14 -9"
        stroke="#ffd21f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M42 92 l14 -8 l14 8 l14 -8 l14 8 l14 -8 l14 8 l14 -8 l14 8 l14 -8 l14 8 l14 -8 l14 8"
        stroke="#e11d2a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".9" />
      <path d="M14 92 Q125 136 236 92 Q238 120 210 132 Q125 150 40 132 Q12 120 14 92 Z" fill="url(#hd-pao)" />
      <path d="M44 118 Q125 140 206 118" stroke="#ffe0a8" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".6" />
      <g fill="#fff4d6" opacity=".9">
        <ellipse cx="70" cy="122" rx="4" ry="2" transform="rotate(-15 70 122)" />
        <ellipse cx="110" cy="130" rx="4" ry="2" transform="rotate(10 110 130)" />
        <ellipse cx="150" cy="129" rx="4" ry="2" transform="rotate(-8 150 129)" />
        <ellipse cx="188" cy="121" rx="4" ry="2" transform="rotate(14 188 121)" />
      </g>
    </svg>
  );
}
