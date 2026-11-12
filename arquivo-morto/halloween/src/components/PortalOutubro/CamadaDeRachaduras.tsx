/**
 * CamadaDeRachaduras.tsx — o vidro do Gestão rachando durante a semana.
 *
 * Uma camada por cima de tudo que NÃO pega clique (`pointer-events: none`):
 * ninguém deixa de trabalhar por causa dela. Abaixo dos diálogos (z 45; os
 * diálogos do app são z 50).
 *
 * Cada rachadura tem três traços: a luz vazando (de quarta em diante), a
 * fresta escura e o fio claro do vidro — os dois últimos aparecem no tema
 * claro e no escuro. De quinta em diante a tela treme de vez em quando e caem
 * farelos das pontas; no último minuto treme sem parar.
 *
 * ## Leve de propósito (26/10/2026: «está bem lagado»)
 *
 * Medido com a CPU 4× mais lenta: a luz pulsava com `filter` por cima de um
 * desfoque, e o navegador refazia o desfoque a cada quadro, o dia inteiro.
 * Agora:
 *   - a luz é uma camada própria, desenhada UMA vez; o pulso é só `opacity`
 *     dessa camada, que a placa de vídeo faz sem repintar nada;
 *   - a camada inteira é isolada (`contain` + `will-change`): rolar a página
 *     embaixo não a repinta, e o tremor só a desloca;
 *   - as rachaduras prontas viram UM caminho por traço (centenas de `<path>`
 *     viraram três); só as que ainda crescem ficam separadas, com o tracejado;
 *   - no modo leve (máquina sem placa de vídeo, ou o tema recolhido) não há
 *     desfoque, pulso, tremor nem farelos: só o vidro, parado.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { EstadoDoPortal } from './fases';
import { ALTURA, LARGURA, crescimento, gerarRachaduras, pontaEm, type Rachadura } from './rachaduras';

/** De quanto em quanto tempo (da hora do portal) a tela treme. */
const TREMOR_A_CADA_MS = 6 * 60_000;
/** Nunca dois tremores em menos de 5 s de verdade (o relógio de teste acelerado). */
const FOLGA_REAL_MS = 5_000;
const TREMOR_DURA_MS = 700;
/** O crescimento anda em degraus de 1/60: o desenho só muda quando a trinca anda de verdade. */
const DEGRAUS = 60;

interface Farelo { id: number; x: number; y: number; tam: number; giro: number; atraso: number }
interface Visivel { r: Rachadura; g: number }

/** Da caixa 1920 × 1080 para a tela (a caixa cobre a tela, como `slice`). */
function paraATela(x: number, y: number): [number, number] {
  const w = window.innerWidth, h = window.innerHeight;
  const escala = Math.max(w / LARGURA, h / ALTURA);
  return [x * escala + (w - LARGURA * escala) / 2, y * escala + (h - ALTURA * escala) / 2];
}

/**
 * Um traço (luz, fio ou fresta) de todas as rachaduras: as prontas juntas num
 * caminho só, por grossura; as que crescem, uma a uma, com o tracejado.
 */
function Traco({ itens, cor, largura, deslocar }: {
  itens: readonly Visivel[];
  cor: string;
  largura: (r: Rachadura) => number;
  deslocar?: boolean;
}) {
  const prontas = new Map<number, string[]>();
  const crescendo: Visivel[] = [];
  for (const it of itens) {
    if (it.g >= 1) {
      const l = Math.round(largura(it.r) * 10) / 10;
      const lista = prontas.get(l) ?? [];
      lista.push(it.r.d);
      prontas.set(l, lista);
    } else crescendo.push(it);
  }
  return (
    <g transform={deslocar ? 'translate(0.8 0.8)' : undefined} stroke={cor}>
      {[...prontas].map(([l, ds]) => <path key={`p${l}`} d={ds.join('')} strokeWidth={l} />)}
      {crescendo.map(({ r, g }) => (
        <path
          key={r.id}
          d={r.d}
          strokeWidth={largura(r)}
          strokeDasharray={`${r.comprimento} ${r.comprimento}`}
          strokeDashoffset={r.comprimento * (1 - g)}
        />
      ))}
    </g>
  );
}

const SVG_PROPS = {
  viewBox: `0 0 ${LARGURA} ${ALTURA}`,
  preserveAspectRatio: 'xMidYMid slice',
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** A luz vazando das frestas. Desenhada uma vez; quem pulsa é a camada (`opacity`). */
const Luz = memo(function Luz({ itens, sexta, leve }: { itens: readonly Visivel[]; sexta: boolean; leve: boolean }) {
  return (
    <svg className="portal-vidro" {...SVG_PROPS}>
      {!leve && (
        <defs>
          <filter id="portal-brilho" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
      )}
      <g filter={leve ? undefined : 'url(#portal-brilho)'}>
        <Traco itens={itens} cor="#ff7a00" largura={r => r.largura * (leve ? 1.8 : 2.6)} />
      </g>
      {sexta && <Traco itens={itens} cor="#ffd9a8" largura={r => r.largura * 0.9} />}
    </svg>
  );
});

/** O vidro: a fresta escura e o fio claro do lado. */
const Vidro = memo(function Vidro({ itens }: { itens: readonly Visivel[] }) {
  return (
    <svg className="portal-vidro" {...SVG_PROPS}>
      <Traco itens={itens} cor="rgb(255 255 255 / 0.9)" largura={r => Math.max(0.8, r.largura * 0.7)} deslocar />
      <Traco itens={itens} cor="rgb(20 24 22 / 0.72)" largura={r => r.largura} />
    </svg>
  );
});

export function CamadaDeRachaduras({ agora, estado, leve }: { agora: number; estado: EstadoDoPortal; leve: boolean }) {
  const todas = useMemo(() => gerarRachaduras(), []);
  const ultimoMinuto = estado.fase === 'ultimoMinuto';

  // A mesma lista enquanto nada cresce: as camadas não redesenham à toa.
  const itens: Visivel[] = [];
  let chave = '';
  for (const r of todas) {
    const g = ultimoMinuto ? 1 : Math.round(crescimento(r, agora) * DEGRAUS) / DEGRAUS;
    if (g <= 0) continue;
    itens.push({ r, g });
    chave += `${r.id}:${g},`;
  }
  const guardados = useRef({ chave, itens });
  if (guardados.current.chave !== chave) guardados.current = { chave, itens };
  const estaveis = guardados.current.itens;

  // ── O tremor de vez em quando, com farelos caindo ───────────────────────
  const [tremendo, setTremendo] = useState(false);
  const [farelos, setFarelos] = useState<Farelo[]>([]);
  const ultimo = useRef<{ balde: number; real: number }>({ balde: Math.floor(agora / TREMOR_A_CADA_MS), real: 0 });
  const relogios = useRef<number[]>([]);
  useEffect(() => () => { for (const t of relogios.current) window.clearTimeout(t); }, []);
  useEffect(() => {
    if (leve || !estado.tremor || ultimoMinuto) return;
    const balde = Math.floor(agora / TREMOR_A_CADA_MS);
    if (balde === ultimo.current.balde) return;
    ultimo.current.balde = balde;
    const real = Date.now();
    if (real - ultimo.current.real < FOLGA_REAL_MS) return;
    ultimo.current.real = real;
    setTremendo(true);
    const pontas = estaveis.filter(x => !x.r.galho);
    const novos: Farelo[] = Array.from({ length: Math.min(8, pontas.length * 2) }, (_, i) => {
      const { r, g } = pontas[Math.floor(Math.random() * pontas.length)];
      const [x, y] = paraATela(...pontaEm(r, g * Math.random()));
      return { id: real + i, x, y, tam: 2 + Math.round(Math.random() * 3), giro: Math.round(Math.random() * 360), atraso: Math.round(Math.random() * 250) };
    });
    setFarelos(novos);
    relogios.current = [
      window.setTimeout(() => setTremendo(false), TREMOR_DURA_MS),
      window.setTimeout(() => setFarelos([]), 2200),
    ];
  }, [agora, estado.tremor, ultimoMinuto, estaveis, leve]);

  if (estaveis.length === 0) return null;
  const treme = !leve && (ultimoMinuto ? ' portal-treme-forte' : tremendo ? ' portal-treme' : '');
  return (
    <div className={`portal-camada${treme || ''}`} aria-hidden>
      {estado.luz > 0 && (
        <div className="portal-luz-camada" style={{ opacity: Math.min(1, estado.luz * 1.1) }}>
          <div className={leve ? 'portal-luz-parada' : 'portal-luz-pulso'}>
            <Luz itens={estaveis} sexta={estado.dia === 5} leve={leve} />
          </div>
        </div>
      )}
      <Vidro itens={estaveis} />
      {farelos.map(f => (
        <span
          key={f.id}
          className="portal-farelo"
          style={{ left: f.x, top: f.y, width: f.tam, height: f.tam, transform: `rotate(${f.giro}deg)`, animationDelay: `${f.atraso}ms` }}
        />
      ))}
    </div>
  );
}
