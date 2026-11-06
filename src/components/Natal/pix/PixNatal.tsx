/**
 * O Natal da tela do Pix Automático (06/11/2026).
 *
 *   - `VaralDosCards` — o pisca-pisca pendurado debaixo dos cards Pendente,
 *     Aprovado e Pago, preso nos vãos ENTRE eles: um laço vermelho em cada
 *     prego e, no estilo detalhado, o festão de pinheiro por baixo do fio.
 *   - `RenaNeon` — a rena de neon do cabeçalho, decalcada da plaquinha de luz
 *     de vitrine que o Kauan mandou (tubo branco no escuro, dourado no claro),
 *     com o nariz vermelho e o fio da tomada.
 *   - `KevinEsquecido` — a referência a «Esqueceram de Mim»: o sticker fica no
 *     canto do card Pendente enquanto há Pix pendente. Pix pendente é
 *     exatamente isso, o que ficou para trás esperando alguém lembrar dele.
 *     Sem pendente, ele some.
 *   - `NeveNoTopo`, `Azevinho` — neve acumulada no alto dos cards e o raminho
 *     de azevinho na sub-aba aberta.
 *   - `corPixNatal.ts` — as cores de Pago e do EXTRA no Natal: Pago dourado
 *     (presente entregue) e EXTRA vermelho de fita de presente.
 *
 * Tudo aparece só com o tema ligado (`useTemaNatal`), nos dois estilos. Como o
 * resto do Natal, nenhuma cor do tema escolhido muda — só Pago e EXTRA, que
 * eram teal e fúcsia: teal ao lado do verde do Aprovado não se distinguia
 * debaixo das luzes, e fúcsia briga com o vermelho do Natal.
 */
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import kevin from './kevin.webp';
import { usePiscaPisca, varsDaLampada } from '../piscaPisca';
import './pixNatal.css';

// ── Pisca-pisca dos cards ─────────────────────────────────────────────────────

/** Vermelho, dourado, verde e gelo: as quatro cores do Natal, nessa ordem. */
const CORES = ['#FF3B3B', '#FFC531', '#2FD16B', '#8FD3FF'] as const;
/** Altura do prego, a partir do alto da faixa. */
const PREGO_Y = 4;
/** Distância entre duas lâmpadas no fio. */
const PASSO = 34;

interface Vao { x0: number; x1: number; flecha: number }

/**
 * Os pregos ficam nas bordas da grade e no meio de cada vão entre os cards da
 * PRIMEIRA linha — com zoom ou tela estreita a grade cai para 2 ou 1 coluna, e
 * o fio acompanha.
 */
/*
 * A grade chega como ELEMENTO (ref de estado), não como `useRef`: o fio vem
 * antes dela na página, e o efeito dele rodava antes de a grade receber a ref
 * — achava `null`, desistia e nunca mais medía. No laboratório, com
 * StrictMode, o efeito rodava duas vezes e o defeito sumia (06/11/2026).
 */
function useVaos(el: HTMLElement | null): { largura: number; vaos: Vao[] } {
  const [medida, setMedida] = useState<{ largura: number; vaos: Vao[] }>({ largura: 0, vaos: [] });
  useLayoutEffect(() => {
    if (!el) return;
    const medir = () => {
      const base = el.getBoundingClientRect();
      const filhos = Array.from(el.children) as HTMLElement[];
      if (!filhos.length || base.width === 0) { setMedida({ largura: base.width, vaos: [] }); return; }
      const topo = filhos[0].getBoundingClientRect().top;
      const linha = filhos
        .map(f => f.getBoundingClientRect())
        .filter(r => Math.abs(r.top - topo) < 4)
        .sort((a, b) => a.left - b.left);
      const pregos = [0];
      for (let i = 1; i < linha.length; i++) {
        pregos.push((linha[i - 1].right + linha[i].left) / 2 - base.left);
      }
      pregos.push(base.width);
      const vaos = pregos.slice(1).map((x1, i) => {
        const x0 = pregos[i];
        return { x0, x1, flecha: Math.min(21, Math.max(12, (x1 - x0) * 0.055)) };
      });
      setMedida(m => (m.largura === base.width && JSON.stringify(m.vaos) === JSON.stringify(vaos)) ? m : { largura: base.width, vaos });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return medida;
}

/** Ponto e inclinação na curva do vão (Bézier quadrática, prego a prego). */
function naCurva(v: Vao, t: number) {
  const meio = (v.x0 + v.x1) / 2, cy = PREGO_Y + 2 * v.flecha;
  const x = (1 - t) ** 2 * v.x0 + 2 * (1 - t) * t * meio + t ** 2 * v.x1;
  const y = (1 - t) ** 2 * PREGO_Y + 2 * (1 - t) * t * cy + t ** 2 * PREGO_Y;
  const dx = 2 * (1 - t) * (meio - v.x0) + 2 * t * (v.x1 - meio);
  const dy = 2 * (1 - t) * (cy - PREGO_Y) + 2 * t * (PREGO_Y - cy);
  return { x, y, giro: (Math.atan2(dy, dx) * 180) / Math.PI * 0.55 };
}

const caminho = (v: Vao, desce = 0) =>
  `M${v.x0} ${PREGO_Y + desce} Q${(v.x0 + v.x1) / 2} ${PREGO_Y + 2 * v.flecha + desce} ${v.x1} ${PREGO_Y + desce}`;

/**
 * Vai dentro de um bloco `relative` com `pb-8`, irmão da grade dos cards: os
 * pregos ficam na borda de BAIXO dos cards e o fio pendura no vão entre eles e
 * os filtros (06/11/2026 — antes passava por cima). Não recebe clique.
 */
export function VaralDosCards({ grade, festao }: { grade: HTMLElement | null; festao: boolean }) {
  const { largura, vaos } = useVaos(grade);
  const id = useId().replace(/:/g, '');
  const modo = usePiscaPisca();
  if (!largura || !vaos.length) return null;

  let n = 0;
  const lampadas = vaos.flatMap(v => {
    const qtd = Math.max(3, Math.round((v.x1 - v.x0) / PASSO));
    return Array.from({ length: qtd }, (_, k) => {
      const t = (k + 0.5) / qtd;
      const i = n++;
      return { ...naCurva(v, t), cor: i % CORES.length, par: i % 2 === 0, i };
    });
  });

  return (
    <svg
      className="ntp-varal" data-pisca={modo} width={largura} height={60} viewBox={`0 0 ${largura} 60`}
      aria-hidden="true"
    >
      <defs>
        {CORES.map((cor, i) => (
          <radialGradient key={cor} id={`${id}-halo-${i}`}>
            <stop offset="0" stopColor={cor} stopOpacity=".75" />
            <stop offset=".45" stopColor={cor} stopOpacity=".25" />
            <stop offset="1" stopColor={cor} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      {festao && vaos.map((v, i) => (
        <g key={`f${i}`} className="ntp-festao">
          <path d={caminho(v, 1)} className="g1" />
          <path d={caminho(v, 1)} className="g2" />
          <path d={caminho(v, 1)} className="g3" />
          {[0.14, 0.33, 0.5, 0.67, 0.86].map((t, j) => {
            const p = naCurva(v, t);
            return <circle key={j} cx={p.x + (j % 2 ? 3 : -3)} cy={p.y + 1 + (j % 2 ? -3 : 3)} r="1.8" className={j % 3 === 0 ? 'baga-ouro' : 'baga'} />;
          })}
        </g>
      ))}

      {vaos.map((v, i) => <path key={`w${i}`} d={caminho(v)} className="ntp-fio" />)}

      {/* Os halos primeiro, todos: assim nenhuma lâmpada fica por baixo do brilho da vizinha. */}
      {lampadas.map((l, i) => (
        <circle key={`h${i}`} cx={l.x} cy={l.y + 13} r="15" fill={`url(#${id}-halo-${l.cor})`}
          className={cn('ntp-halo pp-luz', l.par ? 'pp-a' : 'pp-b')} style={varsDaLampada(l.i)} />
      ))}
      {lampadas.map((l, i) => (
        <g key={`l${i}`} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.giro.toFixed(1)}) scale(.82)`}>
          <rect x="-2.3" y="0" width="4.6" height="4.4" rx=".9" className="ntp-soquete" />
          <g className={cn('ntp-bulbo pp-luz', l.par ? 'pp-a' : 'pp-b')} style={varsDaLampada(l.i)}>
            <path d="M0 3.6 C4.6 4.6 5.6 10 4.1 14 C3.1 17 1.6 19 0 19.6 C-1.6 19 -3.1 17 -4.1 14 C-5.6 10 -4.6 4.6 0 3.6 Z" fill={CORES[l.cor]} />
            <ellipse cx="-1.7" cy="9.5" rx=".9" ry="2.7" fill="#FFFFFF" opacity=".6" />
          </g>
        </g>
      ))}

      {/* Um laço em cada prego, inclusive nas pontas. */}
      {[vaos[0].x0, ...vaos.map(v => v.x1)].map((x, i, todos) => (
        <g key={`p${i}`} className="ntp-laco"
          transform={`translate(${Math.min(Math.max(x, 11), largura - 11)} ${PREGO_Y - 1}) scale(${i === 0 || i === todos.length - 1 ? 0.85 : 1})`}>
          <path d="M-1 2 L-5 14 L-2.5 12.5 L-1.2 15.5 Z" />
          <path d="M1 2 L5 14 L2.5 12.5 L1.2 15.5 Z" />
          <path d="M0 0 C-4 -6 -12 -5 -10 1 C-9 4 -4 3 0 0 Z" />
          <path d="M0 0 C4 -6 12 -5 10 1 C9 4 4 3 0 0 Z" />
          <circle r="2.2" className="no" />
        </g>
      ))}
    </svg>
  );
}

// ── Rena de neon ──────────────────────────────────────────────────────────────

/*
 * Decalcada ponto a ponto da foto (408 × 548, o mesmo quadro): um tubo só, do
 * focinho à galhada em espiral, descendo pelo galhinho, cabeça, costas, as
 * duas patas e o peito — como a placa de verdade, que é uma mangueira de LED
 * dobrada num arame.
 */
const RENA_TUBO = 'M111 150 C111.5 145.3 116 139.8 120 139 C124 138.2 129.2 142.8 135 145 C140.8 147.2 150.8 151.5 155 152 C159.2 152.5 160.5 152 160 148 C159.5 144 155 136 152 128 C149 120 145 111 142 100 C139 89 135.3 72.5 134 62 C132.7 51.5 133 44.2 134 37 C135 29.8 136.5 23.3 140 19 C143.5 14.7 149.2 12.5 155 11 C160.8 9.5 169.2 9 175 10 C180.8 11 186.3 13.7 190 17 C193.7 20.3 196 25.5 197 30 C198 34.5 197.7 40.8 196 44 C194.3 47.2 189.7 49 187 49 C184.3 49 182 46.3 180 44 C178 41.7 177.2 37.3 175 35 C172.8 32.7 169.5 30.3 167 30 C164.5 29.7 161.8 30.5 160 33 C158.2 35.5 156.7 39.3 156 45 C155.3 50.7 155.3 61.8 156 67 C156.7 72.2 156.8 74 160 76 C163.2 78 169.2 78.8 175 79 C180.8 79.2 190.5 76 195 77 C199.5 78 201.3 82 202 85 C202.7 88 201.2 92.3 199 95 C196.8 97.7 192.8 99 189 101 C185.2 103 178.5 104.3 176 107 C173.5 109.7 173 112.8 174 117 C175 121.2 179 127.3 182 132 C185 136.7 188.2 142 192 145 C195.8 148 198.7 149.8 205 150 C211.3 150.2 221.7 146.3 230 146 C238.3 145.7 246.7 147.3 255 148 C263.3 148.7 272.5 150.2 280 150 C287.5 149.8 294 147.2 300 147 C306 146.8 312 146.8 316 149 C320 151.2 323.5 156.2 324 160 C324.5 163.8 322.3 168 319 172 C315.7 176 309.3 180 304 184 C298.7 188 290.8 192 287 196 C283.2 200 281.3 203.8 281 208 C280.7 212.2 281.8 215.7 285 221 C288.2 226.3 294.8 233.2 300 240 C305.2 246.8 311 253.2 316 262 C321 270.8 326.8 282.2 330 293 C333.2 303.8 335 317 335 327 C335 337 333.7 344.7 330 353 C326.3 361.3 318 368 313 377 C308 386 304.2 397 300 407 C295.8 417 290.5 428.2 288 437 C285.5 445.8 285.8 447.3 285 460 C284.2 472.7 284.5 500.5 283 513 C281.5 525.5 279.3 530.5 276 535 C272.7 539.5 267.3 540.8 263 540 C258.7 539.2 253.3 537.8 250 530 C246.7 522.2 245.2 509.2 243 493 C240.8 476.8 238.7 447.8 237 433 C235.3 418.2 235 410.8 233 404 C231 397.2 229.3 395.7 225 392 C220.7 388.3 213.3 385.7 207 382 C200.7 378.3 193.2 373.5 187 370 C180.8 366.5 174.8 361.3 170 361 C165.2 360.7 162.5 362.2 158 368 C153.5 373.8 147.7 387.7 143 396 C138.3 404.3 133.8 407.3 130 418 C126.2 428.7 122.5 446.3 120 460 C117.5 473.7 117.2 489.3 115 500 C112.8 510.7 110.3 519.3 107 524 C103.7 528.7 98.7 530.3 95 528 C91.3 525.7 87.5 519.2 85 510 C82.5 500.8 82 488 80 473 C78 458 75.2 437.5 73 420 C70.8 402.5 68.8 379.8 67 368 C65.2 356.2 65.2 353 62 349 C58.8 345 51.7 346.7 48 344 C44.3 341.3 39.2 338.2 40 333 C40.8 327.8 46.3 319 53 313 C59.7 307 68.8 300.5 80 297 C91.2 293.5 105 293 120 292 C135 291 154.5 292.8 170 291 C185.5 289.2 202.5 285.7 213 281 C223.5 276.3 228.5 269 233 263 C237.5 257 239.5 252 240 245 C240.5 238 238.3 229 236 221 C233.7 213 230.2 204.5 226 197 C221.8 189.5 216.2 180.7 211 176 C205.8 171.3 200.5 169.7 195 169 C189.5 168.3 184.7 170.7 178 172 C171.3 173.3 162.3 176.3 155 177 C147.7 177.7 140.3 177.7 134 176 C127.7 174.3 120.8 171.3 117 167 C113.2 162.7 110.5 154.7 111 150Z';
/** Os arames de suporte por dentro, finos — a placa da foto tem. */
const RENA_ARAME = 'M160 296 L166 354 M238 266 L206 400 L262 396 L310 410 M246 268 L312 408 M240 262 L318 268';
/** O fio da tomada, saindo da pata da frente, como na foto. */
const RENA_TOMADA = 'M128 424 C108 452 66 494 0 524';

/*
 * A rena obedece ao mesmo controlador do pisca-pisca (`piscaPisca.ts`): o tubo
 * pisca, respira ou fica aceso conforme a função da vez, e na função «corre» a
 * luz percorre a mangueira de ponta a ponta — como a placa de LED de loja.
 */
export function RenaNeon({ className }: { className?: string }) {
  const modo = usePiscaPisca();
  return (
    <svg viewBox="0 0 408 548" className={cn('ntp-rena', className)} data-pisca={modo} aria-hidden="true">
      <path d={RENA_ARAME} className="arame" />
      <path d={RENA_TOMADA} className="tomada" />
      <rect x="118" y="410" width="14" height="24" rx="3" transform="rotate(30 125 422)" className="tomada-plugue" />
      <path d={RENA_TUBO} className="tubo pp-luz pp-a" style={varsDaLampada(3)} />
      <path d={RENA_TUBO} className="tubo-corre" pathLength={100} />
      {/* O nariz do Rudolph: o único ponto vermelho, no fio do outro canal. */}
      <circle cx="108" cy="151" r="16" className="nariz-halo pp-luz pp-b" style={varsDaLampada(8)} />
      <circle cx="108" cy="151" r="8" className="nariz pp-luz pp-b" style={varsDaLampada(8)} />
    </svg>
  );
}

// ── «Esqueceram de mim» ───────────────────────────────────────────────────────

/**
 * O sticker no canto de baixo do card Pendente, dentro dele, meio torto como
 * adesivo colado à mão. Ao passar o mouse ele dá o grito.
 */
export function KevinEsquecido({ className }: { className?: string }) {
  // Entra depois dos cards (que sobem em 0,3 s), para ser notado.
  const [entrou, setEntrou] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setEntrou(true), 450); return () => window.clearTimeout(t); }, []);
  return (
    <img
      src={kevin} alt="" draggable={false} aria-hidden="true"
      title="Esqueceram de mim!"
      className={cn('ntp-kevin', entrou && 'entrou', className)}
    />
  );
}

// ── Neve no alto dos cards ────────────────────────────────────────────────────

/** A neve acumulada na borda de cima do card, escorrendo um pouco nos cantos. */
export function NeveNoTopo({ variante = 0 }: { variante?: number }) {
  const formas = [
    'M0 7 C3 3 9 2 15 3.5 C22 1.5 30 2.5 38 3 C47 1 57 2.5 66 2.8 C74 1.5 84 2.2 92 3.2 C96 3.6 99 5 100 7 C99 8.5 97 9 96 11.5 C95 13 93 12.5 92.5 10 C88 8.6 80 8.8 72 8.4 C60 8.9 47 8.3 34 8.7 C24 8.2 14 8.6 8 8.6 C6 10.5 4 12 2.8 10.5 C2 9.3 1 8.4 0 7 Z',
    'M0 7 C4 2.5 11 2.8 18 3.2 C27 1.6 36 2.9 45 2.4 C55 1.4 64 3 73 2.6 C82 1.6 91 2.4 96 4 C98.5 5 100 6 100 7 C99.5 8.3 98 8.6 97 8.8 C88 8.7 79 8.4 70 8.6 C68 11 66 12.6 64.5 10.8 C63.8 9.6 63 8.8 61 8.7 C48 8.3 34 8.9 20 8.4 C12 8.6 6 8.8 3 9 C1.5 8.6 0.4 7.9 0 7 Z',
  ];
  return (
    <svg className="ntp-neve" viewBox="0 0 100 13" preserveAspectRatio="none" aria-hidden="true">
      <path d={formas[variante % formas.length]} />
    </svg>
  );
}

// ── Azevinho da sub-aba aberta ────────────────────────────────────────────────

export function Azevinho({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={cn('ntp-azevinho', className)} aria-hidden="true">
      <path className="folha" d="M15 11 C12 6 6 3 1 4 C3 5 3 7 2 8 C4 8 5 10 4 12 C6 11 8 12 8 14 C10 12 13 12 15 11 Z" />
      <path className="folha escura" d="M15 11 C18 6 24 3 29 4 C27 5 27 7 28 8 C26 8 25 10 26 12 C24 11 22 12 22 14 C20 12 17 12 15 11 Z" />
      <path className="nervura" d="M15 11 C11 8 6 6 2.5 5.5 M15 11 C19 8 24 6 27.5 5.5" />
      <circle className="baga" cx="13" cy="13" r="2.6" />
      <circle className="baga" cx="17.4" cy="13.4" r="2.6" />
      <circle className="baga" cx="15.2" cy="9.6" r="2.6" />
      <circle className="brilho" cx="12.2" cy="12.1" r=".8" />
      <circle className="brilho" cx="16.6" cy="12.5" r=".8" />
      <circle className="brilho" cx="14.4" cy="8.7" r=".8" />
    </svg>
  );
}
