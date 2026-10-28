/**
 * Puxando.tsx — ela puxa o mural para a tela (pedido de 28/10/2026: «depois
 * que acabar ele sai puxando o mural com uma animação boa, pensando nas
 * imagens»). O corpo inteiro, por cima do palco e do mural, no mesmo tamanho
 * e no mesmo lugar em que estava na toca:
 *
 *   vira      estica os dois braços para a direita
 *   corre     dispara de lado até a borda da tela, com o rastro borrado
 *             atrás (a foto dela correndo na caverna)
 *   agarra    fecha as luvas na borda do mural, que aparece com um tranco, e
 *             treme tomando impulso
 *   trancos   três puxões curtos: o tronco vai para trás, o mural sacode e
 *             entra um pedaço a cada um
 *   arranca   ela dispara para a esquerda arrastando o mural inteiro, com o
 *             rastro, e some pela borda
 *   assenta   o mural passa um tico do lugar e volta com um baque
 *
 * O mural anda pelo `transform` dele (o elemento vem por `mural`); no fim o
 * transform volta a vazio e `aoTerminar` avisa. Os tempos dividem pela
 * velocidade do mural.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { PALETA_DA_COISA } from './arte';
import { ALTURA_DA_COISA, CORPO_X, LARGURA_PUXANDO, MAO_PUXANDO, PUXANDO } from './desenho';
import { pintarGrade } from './derry';

const VIRA = 0.3;
const AGARRA = 0.55;
const TRANCOS = 3;
const TRANCO = 0.34;
const RESPIRO = 0.22;
/** Quanto do caminho entra a cada tranco (o resto vai de uma vez, no arranque). */
const POR_TRANCO = 0.07;
const ARRANCA = 0.8;
const ASSENTA = 0.45;
const PASSO = 0.07;
/** Quantos pixels dela por segundo ela corre até a borda. */
const CORRE = 150;
/** A borda do mural fica sob a luva, três pixels antes do meio dela. */
const BORDA = 3;
const RASTROS = 3;

function quadro(linhas: readonly string[]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = LARGURA_PUXANDO;
  cv.height = ALTURA_DA_COISA;
  pintarGrade(cv.getContext('2d')!, linhas, PALETA_DA_COISA, 0, 0);
  return cv;
}

const suave = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

export function ACoisaPuxando({ x, y, px, mural, v, aoTerminar }: {
  /** Onde o corpo dela estava no palco, na tela (o canto de cima à esquerda). */
  x: number;
  y: number;
  /** O tamanho de um pixel dela na tela. */
  px: number;
  mural: RefObject<HTMLDivElement | null>;
  v: RefObject<number>;
  aoTerminar: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rastros = useRef<(HTMLCanvasElement | null)[]>([]);
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;
  const quadros = useMemo(() => ({
    anda: PUXANDO.anda.map(quadro),
    firma: quadro(PUXANDO.firma),
    puxa: PUXANDO.puxa.map(quadro),
  }), []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = window.innerWidth;
    const maoX = MAO_PUXANDO[0] * px;
    const x0 = x - CORPO_X * px;
    // Até a luva ficar inteira na tela, encostada na borda da direita.
    const xAgarra = W - 4 * px - maoX;
    const corre = Math.max(0.15, (xAgarra - x0) / (CORRE * px));
    // Puxado, a borda do mural chega a zero; ela continua até sumir.
    const xMuralNoLugar = BORDA * px - maoX;
    const xSome = -LARGURA_PUXANDO * px - 40;
    const xTrancos = xAgarra + (xMuralNoLugar - xAgarra) * POR_TRANCO * TRANCOS;

    const muralEm = (borda: number, giro = 0) => {
      const el = mural.current;
      if (el) el.style.transform = `translateX(${Math.round(borda)}px)${giro ? ` rotate(${giro.toFixed(2)}deg)` : ''}`;
    };
    const muralNaMao = (sx: number, giro = 0) => muralEm(Math.max(0, sx + maoX - BORDA * px), giro);

    // O que cada canvas mostra (só repinta quando o quadro muda).
    const atuais = new Map<HTMLCanvasElement, HTMLCanvasElement>();
    const pintar = (alvo: HTMLCanvasElement, q: HTMLCanvasElement) => {
      if (atuais.get(alvo) === q) return;
      atuais.set(alvo, q);
      const c = alvo.getContext('2d')!;
      c.clearRect(0, 0, alvo.width, alvo.height);
      c.drawImage(q, 0, 0);
    };
    const por = (alvo: HTMLCanvasElement, sx: number, sy: number) => {
      alvo.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    };
    // Por onde ela passou, para o rastro.
    const passou: { q: HTMLCanvasElement; x: number; y: number }[] = [];
    const mostrar = (q: HTMLCanvasElement, sx: number, sy: number, comRastro: boolean) => {
      pintar(cv, q); por(cv, sx, sy);
      passou.unshift({ q, x: sx, y: sy });
      passou.length = Math.min(passou.length, RASTROS * 3 + 1);
      rastros.current.forEach((r, i) => {
        if (!r) return;
        const p = passou[(i + 1) * 3];
        r.style.opacity = comRastro && p ? String(0.42 - i * 0.12) : '0';
        if (p) { pintar(r, p.q); por(r, p.x, p.y); }
      });
    };

    let t = 0, antes = performance.now(), id = 0, acabou = false;
    const passo = (agora: number) => {
      t += Math.min(0.05, (agora - antes) / 1000) * v.current;
      antes = agora;
      let s = t;
      if (s < VIRA) {
        mostrar(quadros.anda[0], x0, y, false);
      } else if ((s -= VIRA) < corre) {
        const k = suave(s / corre);
        mostrar(quadros.anda[Math.floor(s / PASSO) % 4], x0 + (xAgarra - x0) * k, y - Math.abs(Math.sin(s * 22)) * 2 * px, true);
      } else if ((s -= corre) < AGARRA) {
        // A borda do mural aparece com um tranco embaixo da luva.
        const k = Math.min(1, s / 0.12);
        const treme = s > 0.15 ? Math.sin(s * 80) * px * 0.6 : 0;
        mostrar(quadros.firma, xAgarra + treme, y, false);
        muralEm(W + (xAgarra + maoX - BORDA * px - W) * k);
      } else if ((s -= AGARRA) < TRANCOS * (TRANCO + RESPIRO)) {
        const i = Math.floor(s / (TRANCO + RESPIRO));
        const r = s - i * (TRANCO + RESPIRO);
        const k = Math.min(1, r / TRANCO);
        const e = 1 - (1 - k) ** 3;
        const noTranco = r < TRANCO;
        const sx = xAgarra + (xMuralNoLugar - xAgarra) * POR_TRANCO * (i + e);
        const treme = noTranco ? 0 : Math.sin(r * 90) * px * 0.5;
        mostrar(noTranco ? quadros.puxa[(i * 2 + Math.floor(k * 2)) % 4] : quadros.firma, sx + treme, y + (noTranco ? Math.sin(k * Math.PI) * px : 0), false);
        // O mural sacode a cada puxão.
        muralNaMao(sx, noTranco ? Math.sin(k * Math.PI) * -0.7 : 0);
      } else if ((s -= TRANCOS * (TRANCO + RESPIRO)) < ARRANCA) {
        const k = s / ARRANCA;
        const e = k * k * (3 - 2 * k);
        const sx = xTrancos + (xSome - xTrancos) * e;
        mostrar(quadros.puxa[Math.floor(s / (PASSO * 0.8)) % 4], sx, y - Math.abs(Math.sin(s * 26)) * 2 * px, true);
        muralNaMao(sx);
      } else if ((s -= ARRANCA) < ASSENTA) {
        // Passa um tico do lugar e volta.
        const k = s / ASSENTA;
        muralEm(-Math.sin(k * Math.PI) * 26 * (1 - k));
        cv.style.opacity = '0';
        rastros.current.forEach(r => { if (r) r.style.opacity = '0'; });
      } else if (!acabou) {
        acabou = true;
        // O mural chegou (o baque é do CSS, `mural-baque`).
        if (mural.current) mural.current.style.transform = '';
        fim.current();
        return;
      }
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
    // Uma puxada só: o tamanho da tela é o do começo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estilo = { width: LARGURA_PUXANDO * px, height: ALTURA_DA_COISA * px, transform: `translate(${x - CORPO_X * px}px, ${y}px)` };
  return (
    <>
      {Array.from({ length: RASTROS }, (_, i) => (
        <canvas
          key={i}
          ref={el => { rastros.current[i] = el; }}
          className="coisa-puxando coisa-puxando-rastro"
          width={LARGURA_PUXANDO}
          height={ALTURA_DA_COISA}
          style={{ ...estilo, opacity: 0 }}
          aria-hidden
        />
      ))}
      <canvas ref={ref} className="coisa-puxando" width={LARGURA_PUXANDO} height={ALTURA_DA_COISA} style={estilo} aria-hidden />
    </>
  );
}
