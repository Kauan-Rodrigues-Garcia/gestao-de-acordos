/**
 * Fumaca — a névoa do Analítico: lufadas de ruído fractal (fiapos, não bolas)
 * que sobem, giram devagar, crescem e se desfazem. Clara no tema escuro e
 * escura no claro. Passa por cima do vulto atrás do vidro (`VultoNoVidro`).
 *
 * Leve: o canvas desenha em meia resolução (o CSS estica — fumaça é borrão de
 * qualquer jeito), a 30 quadros por segundo, e para sozinho com a aba
 * escondida (`requestAnimationFrame`).
 */
import { useEffect, useRef } from 'react';

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

// ── Fumaça ────────────────────────────────────────────────────────────────────

/**
 * Ruído de valor com interpolação suave, em oitavas: é o que dá à fumaça os
 * fiapos e buracos irregulares que um gradiente redondo não tem.
 */
function ruidoFractal(tam: number, oitavas: number[]): Float32Array {
  const saida = new Float32Array(tam * tam);
  let pesoTotal = 0;
  oitavas.forEach((celulas, k) => {
    const peso = 1 / (k + 1);
    pesoTotal += peso;
    const grade = Array.from({ length: (celulas + 1) * (celulas + 1) }, () => Math.random());
    const v = (gx: number, gy: number) => grade[(gy % (celulas + 1)) * (celulas + 1) + (gx % (celulas + 1))];
    const suave = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < tam; y++) {
      const fy = (y / tam) * celulas, y0 = Math.floor(fy), ty = suave(fy - y0);
      for (let x = 0; x < tam; x++) {
        const fx = (x / tam) * celulas, x0 = Math.floor(fx), tx = suave(fx - x0);
        const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
        const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
        saida[y * tam + x] += (a + (b - a) * ty) * peso;
      }
    }
  });
  for (let i = 0; i < saida.length; i++) saida[i] /= pesoTotal;
  return saida;
}

/** Uma lufada pronta, numa cor: ruído fractal apagado nas bordas. */
function desenharLufada(tam: number, r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const ruido = ruidoFractal(tam, [3, 6, 12, 24]);
  const img = cx.createImageData(tam, tam);
  const meio = tam / 2;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const d = Math.hypot(x - meio, y - meio) / meio;
      // Borda que some devagar; dentro, só o que passa do limiar do ruído vira fumaça.
      const borda = Math.max(0, 1 - d);
      const n = Math.max(0, ruido[y * tam + x] - 0.38) / 0.62;
      const a = Math.pow(n, 1.6) * borda * borda;
      const k = (y * tam + x) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b;
      img.data[k + 3] = Math.round(Math.min(1, a * 1.6) * 255);
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

type Particula = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; esc: number; cresce: number; vida: number; dur: number; sprite: number; a: number };

export function Fumaca({ claro }: { claro: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const claroRef = useRef(claro);
  claroRef.current = claro;

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext('2d'); if (!cx) return;
    // Quatro lufadas diferentes por tema, feitas uma vez.
    const clara = Array.from({ length: 4 }, () => desenharLufada(160, 228, 230, 238));
    const escura = Array.from({ length: 4 }, () => desenharLufada(160, 34, 30, 38));

    let parts: Particula[] = [], rodando = true, ultimo = performance.now();
    const nova = (qualquerLugar: boolean): Particula => {
      const w = cv.width, h = cv.height;
      return {
        x: acaso(-0.1, 1.1) * w,
        y: qualquerLugar ? acaso(0, 1.1) * h : h + acaso(20, 120),
        vx: acaso(-6, 10), vy: -acaso(4, 13),
        rot: Math.random() * Math.PI * 2, vr: acaso(-0.12, 0.12),
        esc: acaso(1.2, 2.4), cresce: acaso(0.03, 0.08),
        vida: qualquerLugar ? acaso(0, 20) : 0, dur: acaso(22, 38),
        sprite: Math.floor(Math.random() * 4), a: acaso(0.55, 1),
      };
    };
    const ajustar = () => {
      // Meia resolução: o CSS estica. Fumaça não precisa de nitidez.
      cv.width = Math.max(1, Math.round(cv.clientWidth / 2));
      cv.height = Math.max(1, Math.round(cv.clientHeight / 2));
      const n = Math.round(Math.min(30, Math.max(12, (cv.width * cv.height) / 8000)));
      parts = Array.from({ length: n }, () => nova(true));
    };
    const quadro = (agora: number) => {
      if (!rodando) return;
      // 30 quadros por segundo bastam para fumaça lenta: metade do trabalho.
      if (agora - ultimo < 32) { requestAnimationFrame(quadro); return; }
      const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
      const sprites = claroRef.current ? escura : clara;
      // Escura no claro precisa de menos para pesar o mesmo.
      const forca = claroRef.current ? 0.48 : 0.4;
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.vida += dt;
        if (p.vida >= p.dur) { Object.assign(p, nova(false)); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.esc += p.cresce * dt;
        // Entra e sai devagar: seno da vida.
        const alfa = Math.sin((p.vida / p.dur) * Math.PI) * p.a * forca;
        const s = sprites[p.sprite], tam = s.width * p.esc;
        cx.globalAlpha = alfa;
        cx.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), p.x, p.y);
        cx.drawImage(s, -tam / 2, -tam / 2, tam, tam);
      }
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalAlpha = 1;
      requestAnimationFrame(quadro);
    };
    ajustar(); requestAnimationFrame(quadro);
    const obs = new ResizeObserver(ajustar); obs.observe(cv);
    return () => { rodando = false; obs.disconnect(); };
  }, []);

  return <canvas ref={ref} className="hw-fumaca" />;
}
