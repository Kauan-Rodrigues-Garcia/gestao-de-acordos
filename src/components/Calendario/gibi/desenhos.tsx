/**
 * Os desenhos do gibi: o motivo de cada tema (a capa, a figurinha do dia em
 * destaque, o botão do topo), o estouro do «hoje» e o bolo do aniversário.
 *
 * Tudo pinta com as cores da paleta (acento, segunda cor, contorno), então o
 * mesmo desenho veste qualquer tema e o escuro. Os do Outubro Rosa, Halloween,
 * Novembro Azul, Natal e o laço vieram do «Estúdio do Calendário».
 *
 * As cores chegam em hex, e não como `var(--ac)`: o html2canvas desenha cada
 * SVG como imagem solta, onde a variável não existe — o desenho sairia preto
 * no «Copiar imagem».
 */
import type { ReactNode } from 'react';
import type { MotivoTema, PaletaGibi } from '@/lib/calendarioSetor';

type Cores = Pick<PaletaGibi, 'ac' | 'ac2' | 'ol' | 'muted'>;
type Desenho = (c: Cores) => ReactNode;

const MOTIVOS: Record<MotivoTema, Desenho> = {
  calendario: c => (
    <>
      <rect x="8" y="12" width="48" height="44" rx="7" fill="#fff" stroke={c.ol} strokeWidth="3" />
      <path d="M8 27v-8a7 7 0 0 1 7-7h34a7 7 0 0 1 7 7v8Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <rect x="18" y="5" width="6" height="13" rx="3" fill={c.ac2} stroke={c.ol} strokeWidth="2.5" />
      <rect x="40" y="5" width="6" height="13" rx="3" fill={c.ac2} stroke={c.ol} strokeWidth="2.5" />
      <g fill={c.ol}>
        <circle cx="19" cy="36" r="2.6" /><circle cx="29" cy="36" r="2.6" /><circle cx="39" cy="36" r="2.6" />
        <circle cx="19" cy="46" r="2.6" /><circle cx="29" cy="46" r="2.6" />
      </g>
      <path d="M45 39l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill={c.ac2} stroke={c.ol} strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  fala: c => (
    <>
      <path d="M12 10h40a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H31L18 58l2-10h-8a7 7 0 0 1-7-7V17a7 7 0 0 1 7-7Z" fill="#fff" stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 40c-8-5.5-12-9.5-12-14a6 6 0 0 1 12-1.5 6 6 0 0 1 12 1.5c0 4.5-4 8.5-12 14Z" fill={c.ac2} stroke={c.ol} strokeWidth="2.5" strokeLinejoin="round" />
    </>
  ),
  mascara: c => (
    <>
      <path d="M48 22c1-10 7-15 13-18-1 7-4 13-8 19Z" fill="#22D3EE" stroke={c.ol} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M44 21c-1-9 3-15 8-19 1 7-1 13-4 19Z" fill={c.ac2} stroke={c.ol} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M5 24c8-7 19-6 27 1 8-7 19-8 27-1 2 12-4 22-14 22-6 0-9-6-13-6s-7 6-13 6C9 46 3 36 5 24Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="20" cy="31" rx="6.5" ry="4.2" fill={c.ol} />
      <ellipse cx="44" cy="31" rx="6.5" ry="4.2" fill={c.ol} />
      <g fill={c.ac2} stroke={c.ol} strokeWidth="1.2"><circle cx="11" cy="27" r="1.8" /><circle cx="53" cy="27" r="1.8" /><circle cx="32" cy="34" r="1.8" /></g>
    </>
  ),
  tulipa: c => (
    <>
      <path d="M32 34v26" stroke={c.ol} strokeWidth="7" strokeLinecap="round" />
      <path d="M32 34v26" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 54c-10-2-16-10-16-17 8 2 14 8 16 17Z" fill="#22C55E" stroke={c.ol} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 50c8-1 13-7 13-13-7 1-12 6-13 13Z" fill="#16A34A" stroke={c.ol} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 12l8 9 7-13 7 13 8-9c2 15-4 24-15 24S15 27 17 12Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M23 20c0 4 1 7 3 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".7" />
    </>
  ),
  quebra_cabeca: c => (
    <>
      <path d="M10 16h13a6.5 6.5 0 1 1 13 0h13v13a6.5 6.5 0 1 1 0 13v13H36a6.5 6.5 0 1 0-13 0H10V42a6.5 6.5 0 1 0 0-13Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M15 22c0-2 1-3 3-3" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      <path d="M26 30l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill={c.ac2} stroke={c.ol} strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  semaforo: c => (
    <>
      <rect x="28.5" y="52" width="7" height="10" fill="#475569" stroke={c.ol} strokeWidth="2.5" />
      <rect x="19" y="3" width="26" height="51" rx="9" fill="#334155" stroke={c.ol} strokeWidth="3" />
      <circle cx="32" cy="15" r="6.5" fill="#EF4444" stroke={c.ol} strokeWidth="2.2" />
      <circle cx="32" cy="29" r="6.5" fill={c.ac} stroke={c.ol} strokeWidth="2.2" />
      <circle cx="32" cy="43" r="6.5" fill="#22C55E" stroke={c.ol} strokeWidth="2.2" />
      <path d="M29 26.5c.8-1.2 2-1.8 3.2-1.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
    </>
  ),
  fogueira: c => (
    <>
      <rect x="9" y="46" width="46" height="9" rx="4.5" fill="#92400E" stroke={c.ol} strokeWidth="2.5" transform="rotate(-14 32 50.5)" />
      <rect x="9" y="46" width="46" height="9" rx="4.5" fill="#B45309" stroke={c.ol} strokeWidth="2.5" transform="rotate(14 32 50.5)" />
      <path d="M32 5c8 12 16 18 14 31-1 8-7 12-14 12s-13-4-14-12c-1-8 4-12 8-18 1 6 3 8 5 9-1-7-1-15 1-22Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 24c4 6 8 10 7 16-1 4-4 6-7 6s-6-2-7-6c0-5 4-8 7-16Z" fill={c.ac2} stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  laco: c => (
    <>
      <path d="M21 59 36 30c6-12 4-24-4-24s-10 12-4 24l15 29" fill="none" stroke={c.ol} strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 59 36 30c6-12 4-24-4-24s-10 12-4 24l15 29" fill="none" stroke={c.ac} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 11c3-1 5 1 5.5 4" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
    </>
  ),
  bigode: c => (
    <g transform="translate(0 2)">
      <path d="M32 30c-4-6-12-8-18-4-5 3-8 8-12 7 2 7 10 11 18 9 6-2 10-6 12-8 2 2 6 6 12 8 8 2 16-2 18-9-4 1-7-4-12-7-6-4-14-2-18 4Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 30c4-2 8-1 11 2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".6" />
    </g>
  ),
  arvore: c => (
    <>
      <rect x="28" y="54" width="8" height="8" fill="#7C4A1E" stroke={c.ol} strokeWidth="2.5" />
      <path d="M32 8l14 17h-6l12 15h-7l11 15H8l11-15h-7l12-15h-6Z" fill={c.ac2} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <g fill={c.ac} stroke={c.ol} strokeWidth="1.5">
        <circle cx="27" cy="33" r="3" /><circle cx="39" cy="30" r="3" /><circle cx="33" cy="45" r="3" /><circle cx="21" cy="49" r="3" /><circle cx="45" cy="48" r="3" />
      </g>
      <path d="M32 0l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z" fill="#FACC15" stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  abobora: c => (
    <>
      <path d="M29 18q1-9 8-12l3 4q-6 3-6 9Z" fill="#4D7C0F" stroke={c.ol} strokeWidth="2.5" strokeLinejoin="round" />
      <g stroke={c.ol} strokeWidth="3">
        <ellipse cx="19" cy="39" rx="13" ry="18" fill={c.ac} /><ellipse cx="45" cy="39" rx="13" ry="18" fill={c.ac} /><ellipse cx="32" cy="39" rx="13" ry="20" fill={c.ac} />
      </g>
      <path d="M21 35l5-7 5 7zM37 35l5-7 5 7z" fill="#FDE68A" stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 43Q32 55 45 43L41 45 38 42 35 46 32 42 29 46 26 42 23 45Z" fill="#FDE68A" stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  estrela: c => (
    <>
      <path d="M30 6c2 17 9 24 26 26-17 2-24 9-26 26-2-17-9-24-26-26 17-2 24-9 26-26Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M52 4c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9Z" fill={c.ac2} stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  coracao: c => (
    <>
      <path d="M32 56C14 43 5 33 5 22a13.5 13.5 0 0 1 27-3 13.5 13.5 0 0 1 27 3c0 11-9 21-27 34Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 18c1-4 4-6 8-6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".7" />
      <path d="M50 4c.9 4.5 2.5 6 7 7-4.5.9-6.1 2.5-7 7-.9-4.5-2.5-6.1-7-7 4.5-1 6.1-2.5 7-7Z" fill={c.ac2} stroke={c.ol} strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  taca: c => (
    <>
      <path d="M19 6h26l-3 22c-1 6-5 9-10 9s-9-3-10-9Z" fill="#FEF9C3" stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M21.2 15h21.6L41 27.5c-.8 4.6-4.3 7-9 7s-8.2-2.4-9-7Z" fill={c.ac} />
      <g fill="#fff"><circle cx="29" cy="24" r="1.6" /><circle cx="35" cy="20" r="1.3" /><circle cx="33" cy="28" r="1.4" /></g>
      <path d="M32 37v16" stroke={c.ol} strokeWidth="4" strokeLinecap="round" />
      <path d="M21 58c2-5 20-5 22 0Z" fill="#FEF9C3" stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M53 3c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8Z" fill={c.ac2} stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 20c.6 3 1.8 4.2 5 5-3.2.6-4.4 1.8-5 5-.6-3.2-1.8-4.4-5-5 3.2-.8 4.4-2 5-5Z" fill={c.ac2} stroke={c.ol} strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
  ovo: c => (
    <>
      <ellipse cx="32" cy="34" rx="20" ry="26" fill={c.ac} stroke={c.ol} strokeWidth="3" />
      <path d="M13 32l5-5 5 5 5-5 5 5 5-5 5 5 5-5 3 4" fill="none" stroke={c.ac2} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <g fill={c.ac2} stroke={c.ol} strokeWidth="1.5"><circle cx="24" cy="45" r="3" /><circle cx="37" cy="47" r="3" /><circle cx="31" cy="17" r="3" /><circle cx="42" cy="20" r="2.4" /></g>
      <path d="M19 22c1-4 4-8 7-10" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".6" />
    </>
  ),
  floco: c => (
    <>
      <g stroke={c.ol} strokeWidth="9" strokeLinecap="round" fill="none">
        <path d="M32 5v54M8.6 18.5l46.8 27M8.6 45.5l46.8-27" />
        <path d="M24 9l8 8 8-8M24 55l8-8 8 8" />
      </g>
      <g stroke="#fff" strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M32 5v54M8.6 18.5l46.8 27M8.6 45.5l46.8-27" />
        <path d="M24 9l8 8 8-8M24 55l8-8 8 8" />
      </g>
      <circle cx="32" cy="32" r="6" fill={c.ac2} stroke={c.ol} strokeWidth="2.5" />
    </>
  ),
  gravata: c => (
    <>
      <path d="M20 4l12 7 12-7" fill="none" stroke={c.ol} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M24 9h16l-3 10H27Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M27 19h10l7 28-12 12-12-12Z" fill={c.ac} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <path d="M26 30l11-6M23 42l17-9" stroke={c.ac2} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  flor: c => (
    <>
      <path d="M32 40v20" stroke={c.ol} strokeWidth="7" strokeLinecap="round" />
      <path d="M32 40v20" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
      <g fill={c.ac2} stroke={c.ol} strokeWidth="2.6">
        <circle cx="32" cy="14" r="10" /><circle cx="45.3" cy="23.7" r="10" /><circle cx="40.2" cy="39.3" r="10" />
        <circle cx="23.8" cy="39.3" r="10" /><circle cx="18.7" cy="23.7" r="10" />
      </g>
      <circle cx="32" cy="28" r="9" fill="#FACC15" stroke={c.ol} strokeWidth="2.6" />
      <circle cx="29" cy="25" r="2" fill="#fff" opacity=".7" />
    </>
  ),
  balao: c => (
    <>
      <path d="M24 39q-3 8 2 13t4 10M42 42q3 7-1 12t-6 8" fill="none" stroke={c.ol} strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="43" cy="26" rx="13" ry="16" fill="#38BDF8" stroke={c.ol} strokeWidth="3" />
      <path d="M40 41.5l3 3 3-3Z" fill="#38BDF8" stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="23" cy="21" rx="14" ry="17" fill={c.ac2} stroke={c.ol} strokeWidth="3" />
      <path d="M20 37.6l3 3 3-3Z" fill={c.ac2} stroke={c.ol} strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 14c1-3 3-5 6-5.5M37 19c1-3 3-4 5-4.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".75" />
    </>
  ),
  etiqueta: c => (
    <>
      <path d="M6 31 29 8h23a3 3 0 0 1 3 3v23L32 57a3.5 3.5 0 0 1-5 0L6 36a3.5 3.5 0 0 1 0-5Z" fill={c.ac2} stroke={c.ol} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="45" cy="18" r="4.2" fill={c.ac} stroke={c.ol} strokeWidth="2.5" />
      <circle cx="25" cy="32" r="3.6" fill="none" stroke={c.ol} strokeWidth="3" />
      <circle cx="37" cy="43" r="3.6" fill="none" stroke={c.ol} strokeWidth="3" />
      <path d="M39 30 23 45" stroke={c.ol} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  bolo: c => (
    <>
      <path d="M6 58h52" stroke={c.ol} strokeWidth="3" strokeLinecap="round" />
      <rect x="10" y="30" width="44" height="27" rx="5" fill={c.ac} stroke={c.ol} strokeWidth="3" />
      <path d="M11 38q5.5 6 11 0t10.5 0 10.5 0 10.5 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <rect x="21" y="15" width="6" height="15" rx="2" fill={c.ac2} stroke={c.ol} strokeWidth="2.2" />
      <rect x="37" y="15" width="6" height="15" rx="2" fill={c.ac2} stroke={c.ol} strokeWidth="2.2" />
      <path d="M24 4c3 3 3 6 0 8-3-2-3-5 0-8ZM40 4c3 3 3 6 0 8-3-2-3-5 0-8Z" fill="#F59E0B" stroke={c.ol} strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
};

export function Motivo({ id, cores, className }: { id: MotivoTema; cores: Cores; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden overflow="visible">
      {MOTIVOS[id](cores)}
    </svg>
  );
}

const ESTOUROS = {
  hoje: '50,0 61,22 85,10 78,35 100,42 80,58 94,82 68,76 58,100 46,79 22,94 26,69 0,62 20,46 6,22 32,26',
  marco: '50,0 61,18 82,8 80,30 100,38 84,54 96,76 72,76 62,98 48,82 28,96 26,74 2,70 16,52 4,30 26,28 30,6',
};

/**
 * O estouro de gibi atrás do número (o «hoje», a contagem do próximo marco).
 * Em SVG, e não em `clip-path`, que o html2canvas não recorta.
 */
export function Estouro({ forma, cor, className }: { forma: keyof typeof ESTOUROS; cor: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={ESTOUROS[forma]} fill={cor} />
    </svg>
  );
}

/** O bolo da figurinha do aniversário. */
export function Bolo({ cores }: { cores: Pick<Cores, 'ol'> }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="11" width="18" height="10" rx="2" fill="#F9A8D4" stroke={cores.ol} strokeWidth="1.6" />
      <path d="M3 15q3 2 6 0t6 0 6 0" fill="none" stroke="#fff" strokeWidth="1.6" />
      <rect x="11" y="5" width="2" height="6" fill="#60A5FA" stroke={cores.ol} strokeWidth="1" />
      <path d="M12 1.2c1.6 1.5 1.6 3.1 0 3.7-1.6-.6-1.6-2.2 0-3.7z" fill="#F59E0B" />
    </svg>
  );
}
