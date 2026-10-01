/**
 * OlhosNaFumaca — o fundo do Analítico: olhos vermelhos atrás de uma fumaça
 * densa, como quem espia por um vidro embaçado.
 *
 *   Olhos  — SVG, olhos de bicho no escuro: vermelho vivo, pupila escura,
 *            em quatro feitios (bravo, gato, meia-lua, redondo). Olham para os
 *            lados, piscam e somem devagar para reaparecer em outro lugar.
 *   Fumaca — canvas: lufadas macias que sobem e derivam, crescem e se
 *            desfazem. Clara no tema escuro e escura no claro.
 *
 * O canvas desenha em meia resolução e o CSS estica: fumaça é borrão de
 * qualquer jeito, e assim custa um quarto dos pixels. Aba escondida para
 * sozinha (`requestAnimationFrame`).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

// ── Olhos ─────────────────────────────────────────────────────────────────────
//
// Olhos de bicho no escuro, no traço do desenho animado: vermelho vivo, sem
// branco, pupila escura. Quatro feitios, todos desenhados como o olho ESQUERDO
// (o canto do nariz à direita, num quadro de 100 × 60); o direito é o mesmo
// espelhado.

type Feitio = 'bravo' | 'gato' | 'meiaLua' | 'redondo';

const FEITIOS: Record<Feitio, { contorno: string; pupila: string }> = {
  // Pálpebra de cima reta e caída para o nariz: cara de bravo. Pupila em fenda.
  bravo: {
    contorno: 'M5 5 L96 38 C 82 57, 30 61, 10 43 C 1 34, 0 17, 5 5 Z',
    pupila: 'M54 12 Q 64 36 54 60 Q 44 36 54 12 Z',
  },
  // Amêndoa puxada para cima no canto de fora. Pupila em fenda.
  gato: {
    contorno: 'M2 42 C 20 10, 70 0, 98 20 C 84 50, 34 62, 2 42 Z',
    pupila: 'M52 4 Q 62 31 52 58 Q 42 31 52 4 Z',
  },
  // Meia-lua: pálpebra reta em cima, pupila redonda cortada por ela.
  meiaLua: {
    contorno: 'M4 6 L96 22 C 95 46, 72 60, 47 60 C 21 60, 3 42, 4 6 Z',
    pupila: 'M33 11 A 17 17 0 0 0 67 17 Z',
  },
  // Amêndoa redonda, pupila redonda no meio: o que observa quieto.
  redondo: {
    contorno: 'M3 32 C 22 4, 78 4, 97 32 C 78 58, 22 58, 3 32 Z',
    pupila: 'M50 17 A 15 15 0 1 1 49.99 17 Z',
  },
};
const LISTA_FEITIOS = Object.keys(FEITIOS) as Feitio[];

type Par = {
  id: number; x: number; y: number; w: number; gap: number; feitio: Feitio; brilho: number;
  visivel: boolean; pisca: boolean; olhar: number; inclina: number;
};

export function Olhos() {
  const base = useId().replace(/:/g, '');
  const [pares, setPares] = useState<Par[]>([]);

  useEffect(() => {
    let id = 0; const timers: number[] = [];
    const novo = (): Par => {
      const w = acaso(42, 92);
      const feitio = LISTA_FEITIOS[Math.floor(Math.random() * LISTA_FEITIOS.length)];
      return {
        id: id++, x: acaso(4, 88), y: acaso(8, 86), w, gap: w * acaso(0.3, 0.6), feitio,
        // Os pequenos parecem mais longe: um pouco mais apagados.
        brilho: 0.7 + ((w - 42) / 50) * 0.3,
        visivel: false, pisca: false, olhar: 0, inclina: acaso(-8, 8),
      };
    };
    setPares(Array.from({ length: 5 }, novo));
    const mostrar = () => setPares(ps => ps.map(p => ({ ...p, visivel: true })));
    timers.push(window.setTimeout(mostrar, 120));
    // Um par some na névoa e outro surge em outro canto, sem pressa.
    timers.push(window.setInterval(() => {
      setPares(ps => { const i = Math.floor(Math.random() * ps.length); return ps.map((p, j) => (j === i ? { ...p, visivel: false } : p)); });
      timers.push(window.setTimeout(() => {
        setPares(ps => { const i = ps.findIndex(p => !p.visivel); if (i < 0) return ps; const c = [...ps]; c[i] = novo(); return c; });
        timers.push(window.setTimeout(mostrar, 80));
      }, 3200));
    }, 10000));
    // Olhadas: um par vira para um lado, para o outro, ou volta ao centro.
    timers.push(window.setInterval(() => {
      setPares(ps => { const i = Math.floor(Math.random() * ps.length); return ps.map((p, j) => (j === i ? { ...p, olhar: [-1, 0, 1][Math.floor(Math.random() * 3)] } : p)); });
    }, 1700));
    // Piscadas.
    timers.push(window.setInterval(() => {
      setPares(ps => { const i = Math.floor(Math.random() * ps.length); return ps.map((p, j) => (j === i ? { ...p, pisca: true } : p)); });
      timers.push(window.setTimeout(() => setPares(ps => ps.map(p => ({ ...p, pisca: false }))), 320));
    }, 2600));
    return () => timers.forEach(t => { window.clearTimeout(t); window.clearInterval(t); });
  }, []);

  const cor = `${base}-cor`, luz = `${base}-luz`;

  return (
    <>
      {/* Um jogo de gradientes para todos os olhos da tela. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          {/* Vermelho vivo, mais escuro embaixo e no canto de fora. */}
          <linearGradient id={cor} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4101a" />
            <stop offset="55%" stopColor="#e3202a" />
            <stop offset="100%" stopColor="#f2343c" />
          </linearGradient>
          {/* Um clarão no meio, como se brilhassem por dentro. */}
          <radialGradient id={luz} cx="55%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ff6a5a" stopOpacity=".55" />
            <stop offset="100%" stopColor="#ff6a5a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {pares.map(p => {
        const f = FEITIOS[p.feitio];
        return (
          <div
            key={p.id}
            className={cn('hw-olhos', p.pisca && 'pisca')}
            style={{
              left: `${p.x}%`, top: `${p.y}%`, opacity: p.visivel ? p.brilho : 0,
              ['--w' as string]: `${p.w}px`, ['--gap' as string]: `${p.gap}px`,
              ['--olhar' as string]: `${p.olhar * p.w * 0.12}px`, rotate: `${p.inclina}deg`,
            }}
          >
            {[false, true].map(espelho => {
              const clip = `${base}-c${p.id}${espelho ? 'b' : 'a'}`;
              return (
                <svg key={String(espelho)} viewBox="0 0 100 60" className={cn('hw-olho', espelho && 'espelho')}>
                  <clipPath id={clip}><path d={f.contorno} /></clipPath>
                  <path d={f.contorno} fill={`url(#${cor})`} />
                  <g clipPath={`url(#${clip})`}>
                    <path d={f.contorno} fill={`url(#${luz})`} />
                    <g className="hw-iris"><path d={f.pupila} fill="#160305" /></g>
                  </g>
                </svg>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

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
      const n = Math.round(Math.min(40, Math.max(14, (cv.width * cv.height) / 7000)));
      parts = Array.from({ length: n }, () => nova(true));
    };
    const quadro = (agora: number) => {
      if (!rodando) return;
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
