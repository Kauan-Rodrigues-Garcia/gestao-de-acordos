/* eslint-disable react-refresh/only-export-components -- exporta junto o que pertence ao componente (hook, constante, conta); isso só tira o Fast Refresh no `npm run dev`, não muda o app. */
import { useEffect, useRef, type CSSProperties } from 'react';
import './vi.css';

/** Uma volta do giro, igual à de `vi-grana-gira` no `vi.css`. */
const VOLTA_MS = 5600;
/** Quantos graus o maço vira por pixel arrastado (no tamanho de 52 px). */
const GRAUS_POR_PX = 3.2;
/** O giro mais rápido que um arremesso consegue, em voltas do giro normal. */
const RITMO_MAXIMO = 16;
/** Com o mouse em cima ele já acorda um pouco. */
const RITMO_EM_CIMA = 2.2;
/** O empurrão de um clique. */
const RITMO_DO_CLIQUE = 9;
/** Em quanto tempo o embalo perde ~63% da força. */
const FREIO_MS = 1100;
/** Menos que isto de arrasto é clique. */
const FOLGA_DO_CLIQUE_PX = 4;

/**
 * O ritmo com que o maço sai da mão: a velocidade do arrasto (px/ms) virada em
 * «voltas do giro normal», com teto. Exportada para os testes.
 */
export function ritmoDoArremesso(pxPorMs: number, tamanho: number): number {
  const grausPorMs = pxPorMs * GRAUS_POR_PX * (52 / tamanho);
  const ritmo = grausPorMs / (360 / VOLTA_MS);
  return Math.max(-RITMO_MAXIMO, Math.min(RITMO_MAXIMO, ritmo));
}

/** O ritmo voltando ao de descanso, `dt` ms depois. Exportada para os testes. */
export function ritmoFreando(ritmo: number, descanso: number, dt: number): number {
  return descanso + (ritmo - descanso) * Math.exp(-dt / FREIO_MS);
}

/**
 * O maço de dinheiro da saudação (Cleber, 16/11/2026: «um bolo de dinheiro
 * flutuando e rodando, representa bem o GTA») — entra no lugar do sólido da
 * `FormaSaudacao` enquanto o tema está ligado.
 *
 * É o dinheiro caído do jogo: um maço de notas com a cinta de papel, girando
 * no ar. Modelado em CSS 3D — um bloco de seis faces mais a cinta em volta —
 * sem canvas e sem imagem. O giro e o sobe-e-desce são animações de CSS em
 * `transform`: o navegador faz na placa de vídeo, sem redesenhar a página.
 *
 * Dá para brincar (pedido do mesmo dia: «puxando ele gira mais rápido»):
 *   - mouse em cima: ele acorda e gira mais depressa;
 *   - arrastar de lado: o maço vira na mão, para os dois lados;
 *   - soltar no meio do movimento: sai girando com o embalo e vai freando;
 *   - clicar: dá um pulo e um rodopio.
 *
 * Nada disso desenha quadro a quadro. O JavaScript só mexe no RITMO e no
 * PONTO da animação que já existe (`playbackRate`/`currentTime`), e o laço
 * do freio roda só enquanto há embalo — parado na tela, o custo é zero.
 *
 * No modo leve não há animação para acelerar: ele fica parado na pose de três
 * quartos (`vi.css`) e só o pulo do clique responde.
 */
export function DinheiroVi({ tamanho = 52 }: { tamanho?: number }) {
  const raiz = useRef<HTMLSpanElement>(null);
  const gira = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = raiz.current;
    const alvo = gira.current;
    if (!el || !alvo) return;

    let ritmo = 1;
    let emCima = false;
    let laco = 0;
    let antes = 0;
    let arrasto: { id: number; x: number; inicio: number; andou: number; quando: number; vel: number } | null = null;

    const animacao = (): Animation | null => alvo.getAnimations().find(a => a.playState !== 'finished') ?? null;
    /** Girando para trás a animação acabaria no zero: fica sempre longe dele. */
    const longeDoZero = (a: Animation) => {
      const t = Number(a.currentTime ?? 0);
      if (t < VOLTA_MS * 50) a.currentTime = (((t % VOLTA_MS) + VOLTA_MS) % VOLTA_MS) + VOLTA_MS * 1000;
    };
    const aplicar = (a: Animation, r: number) => { ritmo = r; a.playbackRate = r; };

    const frear = (agora: number) => {
      const a = animacao();
      const descanso = emCima ? RITMO_EM_CIMA : 1;
      if (!a || arrasto) { laco = 0; return; }
      const dt = Math.min(64, agora - antes);
      antes = agora;
      const proximo = ritmoFreando(ritmo, descanso, dt);
      longeDoZero(a);
      if (Math.abs(proximo - descanso) < 0.03) { aplicar(a, descanso); laco = 0; return; }
      aplicar(a, proximo);
      laco = requestAnimationFrame(frear);
    };
    const soltarOFreio = () => {
      if (laco) return;
      antes = performance.now();
      laco = requestAnimationFrame(frear);
    };

    const pular = () => {
      el.animate(
        [{ translate: '0 0' }, { translate: `0 ${-0.24 * tamanho}px`, offset: 0.38 }, { translate: '0 0' }],
        { duration: 520, easing: 'cubic-bezier(.3, .7, .4, 1)' },
      );
    };

    const aoEntrar = () => { emCima = true; soltarOFreio(); };
    const aoSair = () => { emCima = false; soltarOFreio(); };

    const aoApertar = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.dataset.pegou = '';
      arrasto = { id: e.pointerId, x: e.clientX, inicio: e.clientX, andou: 0, quando: e.timeStamp, vel: 0 };
      const a = animacao();
      if (a) { longeDoZero(a); aplicar(a, 0); }
    };
    const aoMover = (e: PointerEvent) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const dx = e.clientX - arrasto.x;
      const dt = Math.max(1, e.timeStamp - arrasto.quando);
      arrasto.andou = Math.max(arrasto.andou, Math.abs(e.clientX - arrasto.inicio));
      // Média corrida: um tranco do mouse no último instante não decide o arremesso.
      arrasto.vel = arrasto.vel * 0.6 + (dx / dt) * 0.4;
      arrasto.x = e.clientX;
      arrasto.quando = e.timeStamp;
      const a = animacao();
      if (a) a.currentTime = Number(a.currentTime ?? 0) + dx * GRAUS_POR_PX * (52 / tamanho) / 360 * VOLTA_MS;
    };
    const aoSoltar = (e: PointerEvent) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const { andou, vel, quando } = arrasto;
      arrasto = null;
      delete el.dataset.pegou;
      const a = animacao();
      if (andou < FOLGA_DO_CLIQUE_PX) {
        pular();
        if (a) aplicar(a, RITMO_DO_CLIQUE);
      } else if (a) {
        // Parou a mão antes de soltar: não é arremesso.
        aplicar(a, e.timeStamp - quando > 90 ? 0 : ritmoDoArremesso(vel, tamanho));
      }
      soltarOFreio();
    };

    el.addEventListener('pointerenter', aoEntrar);
    el.addEventListener('pointerleave', aoSair);
    el.addEventListener('pointerdown', aoApertar);
    el.addEventListener('pointermove', aoMover);
    el.addEventListener('pointerup', aoSoltar);
    el.addEventListener('pointercancel', aoSoltar);
    return () => {
      if (laco) cancelAnimationFrame(laco);
      el.removeEventListener('pointerenter', aoEntrar);
      el.removeEventListener('pointerleave', aoSair);
      el.removeEventListener('pointerdown', aoApertar);
      el.removeEventListener('pointermove', aoMover);
      el.removeEventListener('pointerup', aoSoltar);
      el.removeEventListener('pointercancel', aoSoltar);
    };
  }, [tamanho]);

  return (
    <span ref={raiz} className="vi-grana -my-2" style={{ '--tam': `${tamanho}px` } as CSSProperties} aria-hidden="true">
      <span className="vi-grana-brilho" />
      <span className="vi-grana-sombra" />
      <span className="vi-grana-boia">
        <span className="vi-grana-camera">
          <span ref={gira} className="vi-grana-gira">
            <span className="vi-grana-maco">
              <i className="vi-g vi-g-nota vi-g-cima" />
              <i className="vi-g vi-g-nota vi-g-baixo" />
              <i className="vi-g vi-g-borda vi-g-frente" />
              <i className="vi-g vi-g-borda vi-g-tras" />
              <i className="vi-g vi-g-borda vi-g-lado vi-g-dir" />
              <i className="vi-g vi-g-borda vi-g-lado vi-g-esq" />
              <i className="vi-g vi-g-cinta vi-g-cinta-cima">$</i>
              <i className="vi-g vi-g-cinta vi-g-cinta-baixo">$</i>
              <i className="vi-g vi-g-cinta vi-g-cinta-frente" />
              <i className="vi-g vi-g-cinta vi-g-cinta-tras" />
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
