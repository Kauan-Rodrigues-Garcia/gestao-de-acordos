/**
 * Enfeites.tsx — a decoração de Halloween do mural (pedido de 28/10/2026:
 * «a aranha, a abóbora»): a aranha descendo no fio, a abóbora acesa por
 * dentro, a teia nos cantos e os morcegos cruzando o alto.
 *
 * Os desenhos são os do tema de Halloween do sistema (`components/Halloween`),
 * e não novos (pedido de 28/10: «pegue o do sistema, o que já tinha»): a
 * abóbora é a bolha do chat (`AboboraChat`), o morcego é o da revoada
 * (`MorcegoSvg`), a aranha é a da teia (`AranhaSvg`) e a teia sai da mesma
 * conta da `CenaHalloween`. Aqui só muda onde ficam e o tamanho; o movimento
 * é CSS (`mural.css`), nos mesmos keyframes do tema.
 */
import type { CSSProperties } from 'react';
import { AboboraChat, MorcegoSvg } from '@/components/Halloween/Desenhos';
import { AranhaSvg } from '@/components/Halloween/Aranha';

// ── A aranha ────────────────────────────────────────────────────────────────

/** A aranha da teia do sistema no fio: desce e sobe devagar, girando. `fio` é o quanto ela desce, no máximo; `tam`, a largura. */
export function Aranha({ x, y, fio, tam = 40, atraso = 0 }: { x: number; y: number; fio: number; tam?: number; atraso?: number }) {
  return (
    <div
      className="enfeite-aranha"
      style={{ left: x, top: y, ['--fio' as string]: `${fio}px`, ['--atraso' as string]: `${atraso}s` } as CSSProperties}
      aria-hidden
    >
      <span className="enfeite-aranha-fio" />
      <span className="enfeite-aranha-corpo">
        <AranhaSvg width={tam} height={tam} />
      </span>
    </div>
  );
}

// ── A abóbora ───────────────────────────────────────────────────────────────

/** Só o desenho: a abóbora do chat, acesa. `tam` é a largura. */
export function DesenhoDaAbobora({ tam }: { tam: number }) {
  return <span className="enfeite-abobora-desenho" style={{ ['--tam' as string]: `${tam}px` } as CSSProperties}><AboboraChat acesa /></span>;
}

export function Abobora({ x, y, tam = 72, giro = 0, atraso = 0 }: { x: number; y: number; tam?: number; giro?: number; atraso?: number }) {
  return (
    <div
      className="enfeite-abobora"
      style={{ left: x, top: y, rotate: `${giro}deg`, ['--atraso' as string]: `${atraso}s` } as CSSProperties}
      aria-hidden
    >
      <DesenhoDaAbobora tam={tam} />
    </div>
  );
}

// ── A teia ──────────────────────────────────────────────────────────────────

/** A teia de canto do tema (`CenaHalloween`): sete raios, sete voltas e um fio arrebentado. */
function desenharTeia(tam: number) {
  const raios = 7, voltas = 7, d: string[] = [];
  const ang = (i: number) => (Math.PI / 2) * (i / (raios - 1));
  const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  for (let i = 0; i < raios; i++) d.push(`M0 0 L${p(ang(i), tam * (0.92 + 0.08 * Math.sin(i * 2.3)))}`);
  for (let k = 1; k <= voltas; k++) {
    const r = tam * (k / voltas) * 0.9;
    for (let i = 0; i < raios - 1; i++) {
      if (k === 5 && i === 3) continue; // um fio arrebentado
      const a1 = ang(i), a2 = ang(i + 1);
      d.push(`M${p(a1, r)} Q${p((a1 + a2) / 2, r * 0.86)} ${p(a2, r)}`);
    }
  }
  return d.join(' ');
}
const TEIA = desenharTeia(100);

/** A teia num canto (`canto` diz qual; ela abre para dentro). `tam` é o lado. */
export function Teia({ x, y, tam, canto }: { x: number; y: number; tam: number; canto: 'se' | 'sd' | 'ie' | 'id' }) {
  const direita = canto === 'sd' || canto === 'id', baixo = canto === 'ie' || canto === 'id';
  return (
    <svg
      className="enfeite-teia"
      style={{ left: direita ? x - tam : x, top: baixo ? y - tam : y, transform: `scale(${direita ? -1 : 1}, ${baixo ? -1 : 1})` }}
      width={tam}
      height={tam}
      viewBox="0 0 100 100"
      aria-hidden
    >
      <path d={TEIA} />
    </svg>
  );
}

// ── Os morcegos ─────────────────────────────────────────────────────────────

/** Os morcegos da revoada do tema cruzando o alto do mural, cada um no seu tempo. */
export function Morcegos({ v }: { v: number }) {
  const bando = [
    { y: 150, atraso: 0, dura: 16, tam: 64 },
    { y: 112, atraso: 1.1, dura: 17, tam: 46 },
    { y: 176, atraso: 2, dura: 15, tam: 50 },
  ];
  return (
    <div className="enfeite-morcegos" style={{ ['--v' as string]: v } as CSSProperties} aria-hidden>
      {bando.map((m, i) => (
        <span
          key={i}
          className="enfeite-morcego"
          style={{ top: m.y, width: m.tam, height: m.tam / 2, ['--atraso' as string]: `${m.atraso}s`, ['--dura' as string]: `${m.dura}s` } as CSSProperties}
        >
          <MorcegoSvg />
        </span>
      ))}
    </div>
  );
}
