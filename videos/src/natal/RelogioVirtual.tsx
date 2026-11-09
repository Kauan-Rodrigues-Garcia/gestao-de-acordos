// O relógio virtual: roda os palcos ORIGINAIS da Caça (as bruxas, a Bruxa do
// Pântano) dentro do vídeo, quadro a quadro, sem reescrever nada deles.
//
// Os palcos são classes que se animam sozinhas: `requestAnimationFrame`,
// `setTimeout`/`setInterval`, `performance.now()`, `Math.random()`,
// `ResizeObserver` e as animações do CSS deles. Num vídeo isso sairia tremido e
// diferente a cada gravação. Aqui, só enquanto o código do palco roda, essas
// funções são trocadas por versões que obedecem a um tempo NOSSO: o quadro do
// vídeo. O sorteio tem semente fixa. As animações do CSS são pausadas e
// postas no ponto do tempo virtual (Web Animations API).
//
// Assim o mesmo quadro sai sempre igual, e o que aparece é exatamente o que o
// app desenhava. Quem comanda (soltar, atirar, jogar poção) é o roteiro, em
// `comandos`, no tempo de cada um.
//
// ATENÇÃO (08/11/2026): «sempre igual» só vale renderizando os quadros EM
// ORDEM, numa aba só — por isso `npm run render:natal` leva --concurrency=1.
// Com várias abas, cada aba vê quadros salteados e os palcos chegam ao mesmo
// quadro por caminhos diferentes: na poção da escuridão a tela piscava entre
// claro e escuro e a Bruxa do Pântano aparecia em dois lugares. O mesmo vale
// para renderizar só um trecho (--frames): comece antes da cena do palco.

import { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';

const FPS = 60;
export const BASE_PERF = 100_000;
const BASE_DATA = Date.UTC(2026, 9, 16, 13, 0, 0);

function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tarefa = { id: number; quando: number; fn: (...a: unknown[]) => void; args: unknown[]; intervalo?: number };

export class RelogioVirtual {
  agora = 0;
  private timers = new Map<number, Tarefa>();
  private rafs = new Map<number, FrameRequestCallback>();
  private seq = 1;
  private readonly sorte: () => number;
  /** Onde cada animação do CSS começou, no tempo virtual. */
  private inicios = new WeakMap<Animation, number>();

  constructor(semente: number) {
    this.sorte = sorteio(semente);
  }

  /** Roda `fn` com as funções de tempo e de sorteio trocadas pelas virtuais. */
  dentro<T>(fn: () => T): T {
    const g = globalThis as unknown as Record<string, unknown>;
    const salvo = {
      pn: performance.now, dn: Date.now, rnd: Math.random,
      raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame,
      st: g.setTimeout, ct: g.clearTimeout, si: g.setInterval, ci: g.clearInterval, ro: g.ResizeObserver,
    };
    performance.now = () => BASE_PERF + this.agora;
    Date.now = () => BASE_DATA + this.agora;
    Math.random = this.sorte;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => { const id = this.seq++; this.rafs.set(id, cb); return id; };
    g.cancelAnimationFrame = (id: number) => { this.rafs.delete(id); };
    g.setTimeout = (fn: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      const id = this.seq++; this.timers.set(id, { id, quando: this.agora + Math.max(0, Number(ms) || 0), fn, args }); return id;
    };
    g.clearTimeout = (id: number) => { this.timers.delete(id); };
    g.setInterval = (fn: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      const passo = Math.max(1, Number(ms) || 0);
      const id = this.seq++; this.timers.set(id, { id, quando: this.agora + passo, fn, args, intervalo: passo }); return id;
    };
    g.clearInterval = g.clearTimeout;
    // O tamanho é lido na hora, sem esperar o navegador: o vídeo não tem «depois».
    g.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        const h = el as HTMLElement;
        this.cb([{ target: el, contentRect: { width: h.clientWidth, height: h.clientHeight } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    };
    try {
      return fn();
    } finally {
      performance.now = salvo.pn; Date.now = salvo.dn; Math.random = salvo.rnd;
      g.requestAnimationFrame = salvo.raf; g.cancelAnimationFrame = salvo.caf;
      g.setTimeout = salvo.st; g.clearTimeout = salvo.ct; g.setInterval = salvo.si; g.clearInterval = salvo.ci;
      g.ResizeObserver = salvo.ro;
    }
  }

  /** Anda até `t` (ms), em quadros de 1/60 s: os timers na hora deles, e o `requestAnimationFrame` a cada quadro. */
  avancarAte(t: number) {
    while (this.agora < t - 0.01) {
      const prox = Math.min(t, this.agora + 1000 / FPS);
      this.dentro(() => {
        for (let guarda = 0; guarda < 500; guarda++) {
          let cedo: Tarefa | null = null;
          for (const x of this.timers.values()) if (x.quando <= prox && (!cedo || x.quando < cedo.quando)) cedo = x;
          if (!cedo) break;
          this.agora = Math.max(this.agora, cedo.quando);
          if (cedo.intervalo) cedo.quando += cedo.intervalo; else this.timers.delete(cedo.id);
          cedo.fn(...cedo.args);
        }
        this.agora = prox;
        const cbs = [...this.rafs.values()];
        this.rafs.clear();
        for (const cb of cbs) cb(BASE_PERF + this.agora);
      });
    }
  }

  /** Põe as animações do CSS dentro de `raizes` no ponto do tempo virtual. */
  sincronizarAnimacoes(raizes: (Element | null)[]) {
    for (const a of document.getAnimations()) {
      const alvo = (a.effect as KeyframeEffect | null)?.target as Element | null;
      if (!alvo || !raizes.some(r => r && (r === alvo || r.contains(alvo)))) continue;
      if (!this.inicios.has(a)) this.inicios.set(a, this.agora);
      a.pause();
      a.currentTime = this.agora - this.inicios.get(a)!;
    }
  }
}

/** Um comando do roteiro: no tempo `t` (ms desde o começo da cena), faz algo com o palco. */
export type Comando<P> = { t: number; fazer: (palco: P, relogio: RelogioVirtual) => void };

/**
 * Monta um palco original num `<div>` e o leva ao quadro atual do vídeo.
 * Voltar no tempo (no estúdio) refaz tudo do começo; ir para a frente só anda.
 */
export function PalcoVirtual<P extends { destruir(): void }>({
  inicio, fim, semente, criar, comandos, extras = () => [], style,
}: {
  inicio: number;
  fim: number;
  semente: number;
  criar: (host: HTMLDivElement) => P;
  comandos: Comando<P>[];
  /** Outras raízes cujas animações CSS seguem este relógio (o que o palco põe fora do host). */
  extras?: () => (Element | null)[];
  style?: React.CSSProperties;
}) {
  const f = useCurrentFrame();
  const host = useRef<HTMLDivElement>(null);
  const sessao = useRef<{ relogio: RelogioVirtual; palco: P; feitos: number } | null>(null);
  useLayoutEffect(() => {
    const espera = delayRender('palco virtual');
    try {
      const el = host.current;
      if (!el) return;
      const t = ((f - inicio) / FPS) * 1000;
      const acabar = () => {
        if (!sessao.current) return;
        const { relogio, palco } = sessao.current;
        relogio.dentro(() => palco.destruir());
        el.replaceChildren();
        sessao.current = null;
      };
      if (f < inicio || f > fim) { acabar(); return; }
      if (sessao.current && t < sessao.current.relogio.agora - 1) acabar();
      if (!sessao.current) {
        const relogio = new RelogioVirtual(semente);
        const palco = relogio.dentro(() => criar(el));
        sessao.current = { relogio, palco, feitos: 0 };
      }
      const s = sessao.current;
      while (s.feitos < comandos.length && comandos[s.feitos].t <= t) {
        const c = comandos[s.feitos++];
        s.relogio.avancarAte(c.t);
        s.relogio.dentro(() => c.fazer(s.palco, s.relogio));
      }
      s.relogio.avancarAte(t);
      s.relogio.sincronizarAnimacoes([el, ...extras()]);
    } finally {
      continueRender(espera);
    }
  }, [f]);
  return <div ref={host} style={{ position: 'absolute', inset: 0, ...style }} />;
}
