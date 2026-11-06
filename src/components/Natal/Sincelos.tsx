/**
 * Sincelos — gelo pendurado numa borda (06/11/2026, pedido do Kauan: «poucos
 * gelos em alguns lugares do Gestão, bem feitos»).
 *
 * Desenho próprio, no jeito da referência que ele mandou: uma placa de gelo
 * presa na borda, com reflexos brancos, as pontas de tamanhos diferentes (a
 * maioria curta, uma ou outra comprida), um contorno azul mais escuro e
 * estrelinhas de brilho que cintilam. Da ponta mais comprida, de vez em
 * quando, cai uma gota.
 *
 * O formato sai de uma SEMENTE, não do acaso: o mesmo gelo no mesmo lugar em
 * toda carga, e lugares diferentes com gelos diferentes.
 *
 * Onde mora (poucos, de propósito):
 *   - debaixo da barra do topo, nas pontas — só nas telas sem cena de Natal
 *     nem trem (Dashboard, Acordos e Analítico já têm enfeite no alto);
 *   - debaixo da marca, no menu lateral aberto;
 *   - debaixo do card Pendente do Pix, o card «gelo» (o Pix parado).
 *
 * Não recebe clique. No modo leve as animações param sozinhas (`data-leve`).
 */
import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import './sincelos.css';

/** Sorteio com semente (mulberry32): o mesmo número dá sempre o mesmo gelo. */
function sorteador(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

interface Ponta { x: number; base: number; larg: number; comp: number }

function geometria(largura: number, comprMax: number, semente: number) {
  const rnd = sorteador(semente);
  const PLACA = 7;

  // A borda de baixo da placa: ondula de leve, e afina nas duas pontas.
  const passos = Math.max(4, Math.round(largura / 14));
  const fundo: [number, number][] = [];
  for (let i = 0; i <= passos; i++) {
    const x = (largura * i) / passos;
    const afina = Math.min(1, Math.min(x, largura - x) / 10);
    fundo.push([x, 2.5 + (PLACA - 2.5 + rnd() * 3) * afina]);
  }
  const fundoEm = (x: number) => {
    const i = Math.min(passos - 1, Math.floor((x / largura) * passos));
    const [x0, y0] = fundo[i], [x1, y1] = fundo[i + 1];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  };

  // As pontas: quase todas curtas; de cinco em cinco, mais ou menos, uma comprida.
  const pontas: Ponta[] = [];
  for (let x = 7 + rnd() * 5; x < largura - 6; x += 7 + rnd() * 9) {
    const longa = rnd() < 0.28;
    const comp = longa ? comprMax * (0.72 + rnd() * 0.28) : comprMax * (0.25 + rnd() * 0.35);
    const borda = Math.min(1, Math.min(x, largura - x) / 18);
    pontas.push({ x, base: fundoEm(x) - 1.2, larg: (longa ? 8.5 : 6) + rnd() * 3.5, comp: Math.max(4, comp * (0.45 + 0.55 * borda)) });
  }

  let d = `M0 0 L${largura} 0`;
  for (let i = fundo.length - 1; i >= 0; i--) d += ` L${r1(fundo[i][0])} ${r1(fundo[i][1])}`;
  d += ' Z';
  for (const p of pontas) {
    const l = p.larg / 2, ponta = p.base + p.comp, torto = (rnd() - 0.5) * 1.2;
    // Da direita para a esquerda: o MESMO giro da placa. No giro contrário a
    // sobreposição se anulava (regra «nonzero») e a emenda virava um risco.
    d += ` M${r1(p.x + l)} ${r1(p.base)}`
      + ` C${r1(p.x + l * 0.85)} ${r1(p.base + p.comp * 0.4)} ${r1(p.x + l * 0.22 + torto)} ${r1(ponta - 2)} ${r1(p.x + torto)} ${r1(ponta)}`
      + ` C${r1(p.x - l * 0.22 + torto)} ${r1(ponta - 2)} ${r1(p.x - l * 0.85)} ${r1(p.base + p.comp * 0.4)} ${r1(p.x - l)} ${r1(p.base)} Z`;
  }

  // Reflexos: manchas na placa e um risco na face esquerda das pontas compridas.
  const manchas = Array.from({ length: Math.max(2, Math.round(largura / 26)) }, () => {
    const x = 6 + rnd() * (largura - 12);
    return { x, y: 2 + rnd() * 1.6, rx: 2.5 + rnd() * 6, ry: 0.8 + rnd() * 0.7 };
  });
  // Partes mais azuis na metade de baixo da placa: dão volume, como na referência.
  const sombras = Array.from({ length: Math.max(2, Math.round(largura / 30)) }, () => {
    const x = 8 + rnd() * (largura - 16);
    return { x, y: fundoEm(x) - 1.8, rx: 3 + rnd() * 7, ry: 1 + rnd() * 0.8 };
  });
  const longas = [...pontas].sort((a, b) => b.comp - a.comp);
  const riscos = longas.slice(0, Math.max(1, Math.round(pontas.length / 4))).map(p =>
    `M${r1(p.x - p.larg * 0.22)} ${r1(p.base + 1.5)} Q${r1(p.x - p.larg * 0.24)} ${r1(p.base + p.comp * 0.35)} ${r1(p.x - 0.4)} ${r1(p.base + p.comp * 0.66)}`);

  // Brilhos: na ponta das duas mais compridas e um na placa.
  const brilhos = [
    ...longas.slice(0, 2).map(p => ({ x: p.x, y: p.base + p.comp + 0.5, t: 3.2 })),
    { x: 8 + rnd() * (largura - 16), y: 1.8, t: 2.6 },
  ];
  const gota = longas[0] ? { x: longas[0].x, y: longas[0].base + longas[0].comp } : null;
  const altura = Math.ceil(Math.max(...pontas.map(p => p.base + p.comp), PLACA + 3) + 8);
  return { d, manchas, sombras, riscos, brilhos, gota, altura };
}

/** Estrelinha de quatro pontas, centrada em 0,0. */
const ESTRELA = 'M0 -1 C0.15 -0.15 0.15 -0.15 1 0 C0.15 0.15 0.15 0.15 0 1 C-0.15 0.15 -0.15 0.15 -1 0 C-0.15 -0.15 -0.15 -0.15 0 -1 Z';

export function Sincelos({
  largura, comprimento = 16, semente = 1, gota = true, className,
}: {
  /** Largura em px; o desenho não estica (as pontas ficariam gordas). */
  largura: number;
  /** A ponta mais comprida, em px. */
  comprimento?: number;
  semente?: number;
  gota?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const g = useMemo(() => geometria(largura, comprimento, semente), [largura, comprimento, semente]);
  return (
    <svg
      className={cn('nt-sincelos', className)} width={largura} height={g.altura}
      viewBox={`0 0 ${largura} ${g.altura}`} aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-gelo`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="gelo-1" />
          <stop offset=".3" className="gelo-2" />
          <stop offset="1" className="gelo-3" />
        </linearGradient>
      </defs>
      {/* O contorno por baixo e o recheio por cima: só a metade de fora do traço aparece. */}
      <path d={g.d} className="contorno" />
      <path d={g.d} className="recheio" fill={`url(#${id}-gelo)`} />
      {g.sombras.map((m, i) => <ellipse key={`s${i}`} cx={m.x} cy={m.y} rx={m.rx} ry={m.ry} className="sombra" />)}
      {g.manchas.map((m, i) => <ellipse key={i} cx={m.x} cy={m.y} rx={m.rx} ry={m.ry} className="mancha" />)}
      {g.riscos.map((r, i) => <path key={i} d={r} className="risco" />)}
      {g.brilhos.map((b, i) => (
        <path key={i} d={ESTRELA} className="brilho"
          transform={`translate(${r1(b.x)} ${r1(b.y)}) scale(${b.t})`}
          style={{ animationDelay: `${-(i * 1.37 + semente * 0.61) % 4}s` }} />
      ))}
      {gota && g.gota && (
        <path className="gota" d={`M${r1(g.gota.x)} ${r1(g.gota.y - 0.5)} c0.9 1.3 1.5 2.1 1.5 2.8 a1.5 1.5 0 0 1 -3 0 c0 -0.7 0.6 -1.5 1.5 -2.8 Z`}
          style={{ animationDelay: `${-(semente * 2.3) % 7}s` }} />
      )}
    </svg>
  );
}

/**
 * O gelo da barra do topo do app: duas pontas, uma curta à esquerda (depois do
 * botão do menu) e uma mais longa à direita. O `Layout` só monta nas telas sem
 * cena nem trem — ver o topo deste arquivo.
 */
export function SincelosDoTopo() {
  return (
    <>
      <Sincelos largura={104} comprimento={16} semente={7} gota={false} className="no-topo-esq hidden md:block" />
      <Sincelos largura={190} comprimento={24} semente={23} className="no-topo-dir" />
    </>
  );
}

/** Debaixo da marca, no menu lateral aberto: curto, para não cobrir o primeiro item. */
export function SincelosDaMarca() {
  return <Sincelos largura={130} comprimento={13} semente={41} gota={false} className="na-marca" />;
}
