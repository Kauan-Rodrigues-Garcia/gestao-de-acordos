import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { relogioNatal } from '../musica';
import { ondeEsta, type PosicaoDoTrem } from './horario';
import { agendaAgora, useAgendaDoTrem } from './agenda';
import { CAMINHO_DA_ABA, type AbaDoTrem } from './rota';
import './trem.css';

/*
 * O mapa da linha, no menu lateral — no espírito do Mini Metro: uma linha
 * vermelha na beirada do menu, ligando as abas da rota, cada uma com a sua
 * estação (as pontas, a estação do Dashboard e o fim da linha, são terminais
 * quadrados), e um trenzinho que mostra onde o trem está agora, para todo
 * mundo, em qualquer tela do sistema.
 *
 * O trenzinho do mapa CHEGA a uma estação quando o trem de verdade entra
 * naquela aba; durante a janela de uma aba ele vai andando para a próxima.
 * A estação da aba onde o trem está pulsa.
 *
 * Mora dentro do `<nav>` do menu (que ganha `relative`), cobrindo a lista
 * inteira e rolando com ela. Acha as abas pelo link de cada uma.
 */

interface Parada { aba: AbaDoTrem; y: number }

/** Ida e volta: o trem chega devagar e sai devagar de cada estação do mapa. */
const suave = (t: number) => t * t * (3 - 2 * t);

/** A posição no percurso, em «abas» (0 = a primeira da rota). */
function noPercurso(p: PosicaoDoTrem, rota: readonly AbaDoTrem[]): number {
  const i = rota.indexOf(p.aba);
  const n = rota.length;
  if (p.fase === 'estacao') return 0;
  if (p.fase === 'fim') return n - 1;
  if (p.fase === 'ida') return i < n - 1 ? i + suave(p.progresso) : n - 1;
  return i > 0 ? i - suave(1 - p.progresso) : 0;
}

/**
 * Do percurso para as estações que a pessoa vê: entre duas delas, o
 * trenzinho do mapa anda na proporção do caminho. Para quem é da regra Cofen
 * (sem Acordos nem Pix), ele vai devagar do Dashboard ao Analítico enquanto o
 * trem passa pelo «túnel» — e chega lá na mesma hora que para todo mundo.
 */
function noMapa(u: number, rota: readonly AbaDoTrem[], estacoes: readonly AbaDoTrem[]): number {
  const pos = estacoes.map(a => rota.indexOf(a));
  if (u <= pos[0]) return 0;
  for (let k = 0; k < pos.length - 1; k++) {
    if (u <= pos[k + 1]) return k + (u - pos[k]) / (pos[k + 1] - pos[k]);
  }
  return pos.length - 1;
}

export function MapaDaLinha({ rota, visiveis, nav }: {
  /** O percurso do trem (o relógio, igual para todo mundo). */
  rota: readonly AbaDoTrem[];
  /** As abas em que a pessoa vê o trem (as estações do mapa dela). */
  visiveis: readonly AbaDoTrem[];
  nav: RefObject<HTMLElement>;
}) {
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [caixa, setCaixa] = useState({ largura: 0, altura: 0 });
  const trem = useRef<SVGGElement>(null);
  const estacoes = useRef<(SVGGElement | null)[]>([]);
  // Assina a agenda (o laço lê `agendaAgora`): fechado, o trenzinho do mapa fica na estação.
  useAgendaDoTrem();

  // Onde fica cada aba no menu (o menu pode mudar de ordem, encolher e rolar).
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const medir = () => {
      const lista: Parada[] = [];
      for (const aba of visiveis) {
        const link = el.querySelector<HTMLElement>(`a[href="${CAMINHO_DA_ABA[aba]}"]`);
        if (link) lista.push({ aba, y: link.offsetTop + link.offsetHeight / 2 });
      }
      setParadas(v => (JSON.stringify(v) === JSON.stringify(lista) ? v : lista));
      setCaixa(v => (v.largura === el.clientWidth && v.altura === el.scrollHeight ? v : { largura: el.clientWidth, altura: el.scrollHeight }));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    const mo = new MutationObserver(medir);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [nav, visiveis]);

  // O trenzinho, num quadro por vez (e devagar: o mapa é pequeno).
  useEffect(() => {
    if (paradas.length < 2) return;
    let quadro = 0, ultimo = 0;
    const x = caixa.largura - 4.5;
    const passo = (t: number) => {
      quadro = requestAnimationFrame(passo);
      // Quatro vezes por segundo: o trenzinho do mapa anda devagar, e a transição de CSS alisa.
      if (t - ultimo < 250) return;
      ultimo = t;
      const p = ondeEsta(relogioNatal(), rota, agendaAgora());
      // As estações: as abas que a pessoa vê e que o menu mostra, na ordem do percurso.
      const naRota = rota.filter(a => paradas.some(pa => pa.aba === a));
      const u = Math.min(naRota.length - 1, Math.max(0, noMapa(noPercurso(p, rota), rota, naRota)));
      const yDe = (k: number) => paradas.find(pa => pa.aba === naRota[k])!.y;
      const i = Math.min(naRota.length - 2, Math.floor(u));
      const y = yDe(i) + (yDe(i + 1) - yDe(i)) * (u - i);
      const indo = p.fase === 'ida' || p.fase === 'estacao' ? 1 : -1;
      const desce = (yDe(Math.min(naRota.length - 1, i + 1)) - yDe(i)) * indo >= 0;
      if (trem.current) trem.current.style.transform = `translate(${x}px, ${y.toFixed(1)}px) rotate(${desce ? 180 : 0}deg)`;
      estacoes.current.forEach((g, k) => g?.classList.toggle('aqui', paradas[k]?.aba === p.aba));
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [paradas, caixa.largura, rota]);

  if (paradas.length < 2 || !caixa.largura) return null;
  const x = caixa.largura - 4.5;
  const ys = paradas.map(p => p.y);
  const pontas = new Set([rota[0], rota[rota.length - 1]]);

  return (
    <div className="nt-mapa" style={{ height: caixa.altura }} aria-hidden="true">
      <svg width={caixa.largura} height={caixa.altura}>
        {/* a linha */}
        <line x1={x} y1={Math.min(...ys)} x2={x} y2={Math.max(...ys)} stroke="#D6403A" strokeWidth={3.2} strokeLinecap="round" />
        {/* as estações */}
        {paradas.map((p, k) => (
          <g key={p.aba} ref={g => { estacoes.current[k] = g; }} className="nt-mapa-estacao" transform={`translate(${x} ${p.y})`}>
            <circle className="nt-mapa-pulso" r={7} />
            {pontas.has(p.aba)
              ? <rect x={-4.6} y={-4.6} width={9.2} height={9.2} rx={2} fill="#FFFFFF" stroke="#D6403A" strokeWidth={2.4} />
              : <circle r={4.4} fill="#FFFFFF" stroke="#D6403A" strokeWidth={2.4} />}
          </g>
        ))}
        {/* o trenzinho: a locomotiva na frente, o vagão de presentes atrás */}
        <g ref={trem}>
          <circle className="nt-mapa-fumaca" cx={0} cy={-17} r={2.2} />
          <rect x={-4.6} y={-14} width={9.2} height={13} rx={3.2} fill="#D6403A" />
          <rect x={-2.6} y={-11} width={5.2} height={4} rx={1.2} fill="#FFD98A" />
          <rect x={-4.2} y={0.5} width={8.4} height={10} rx={2.4} fill="#3F9A5B" />
          <rect x={-0.8} y={0.5} width={1.6} height={10} fill="#F2B544" />
        </g>
      </svg>
    </div>
  );
}
