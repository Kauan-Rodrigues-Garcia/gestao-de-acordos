/**
 * LuzesMortas.tsx — o fundo e o fim do close (pedido de 28/10/2026, com as
 * imagens de referência):
 *
 *   `FogoDePixel`  o fogo dos dois lados da cara encarando (a pixel art
 *                  dela no fogo): labaredas em pixel grosso subindo das
 *                  beiradas, o meio escuro atrás da cabeça;
 *   `LuzesMortas`  «para ele abrir a boca para flutuar» (as quatro fotos da
 *                  bocarra): lá dentro da boca, o túnel de carne com as
 *                  fileiras de dentes vindo na direção de quem olha e, no
 *                  fundo, as três luzes — duas em cima, uma embaixo. A luz
 *                  cresce, passa pelo vermelho, vira laranja e toma a tela
 *                  inteira num clarão; as faíscas sobem (flutuam).
 *                  Desde 29/10 («as luzes quando ele abre a boca também
 *                  girar e serem melhores visualmente») a goela gira em
 *                  espiral, duas rodas de raios giram uma contra a outra e
 *                  as três luzes orbitam o meio, com rastro e brilho em cruz.
 *
 * Os dois são um canvas pequeno ampliado em pixel (`image-rendering`), um
 * quadro por `requestAnimationFrame`, e o tempo divide pela velocidade.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { sorteador } from '../acaso';

// ── O fogo ──────────────────────────────────────────────────────────────────

const FOGO_L = 120, FOGO_A = 68;
/** Do preto ao branco-amarelo, passando pelo vermelho e pelo laranja (o índice é o calor). */
const CORES_DO_FOGO = (() => {
  const paradas: readonly [number, number, number, number][] = [
    [0, 10, 3, 2], [6, 70, 10, 4], [12, 150, 26, 6], [18, 214, 64, 10], [24, 245, 128, 22], [30, 255, 196, 60], [36, 255, 240, 170],
  ];
  const cores: [number, number, number][] = [];
  for (let i = 0; i <= 36; i++) {
    const j = paradas.findIndex(p => p[0] >= i);
    const b = paradas[j], a = paradas[Math.max(0, j - 1)];
    const k = b[0] === a[0] ? 0 : (i - a[0]) / (b[0] - a[0]);
    cores.push([0, 1, 2].map(c => Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * k)) as [number, number, number]);
  }
  return cores;
})();

export function FogoDePixel({ v }: { v: RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const calor = new Uint8Array(FOGO_L * FOGO_A);
    const img = c.createImageData(FOGO_L, FOGO_A);
    // A fonte do fogo, embaixo: cheia nas beiradas, apagada no meio (atrás da cabeça).
    const fonte = Array.from({ length: FOGO_L }, (_, x) => {
      const d = Math.abs(x / (FOGO_L - 1) - 0.5);
      return Math.round(36 * Math.max(0, Math.min(1, (d - 0.17) / 0.17)));
    });
    let id = 0, antes = performance.now(), sobra = 0;
    const passo = () => {
      for (let x = 0; x < FOGO_L; x++) calor[(FOGO_A - 1) * FOGO_L + x] = Math.max(0, fonte[x] - (Math.random() < 0.3 ? 4 : 0));
      for (let y = 1; y < FOGO_A; y++) {
        for (let x = 0; x < FOGO_L; x++) {
          const de = y * FOGO_L + x;
          const p = calor[de];
          if (!p) { calor[de - FOGO_L] = 0; continue; }
          const r = Math.floor(Math.random() * 3);
          const para = Math.max(FOGO_L, Math.min(calor.length - 1, de - r + 1));
          calor[para - FOGO_L] = Math.max(0, p - (r & 1));
        }
      }
      for (let i = 0; i < calor.length; i++) {
        const [r, g, b] = CORES_DO_FOGO[calor[i]];
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = calor[i] < 2 ? 0 : 255;
      }
      c.putImageData(img, 0, 0);
    };
    // Aquece antes de aparecer: as labaredas já chegam altas.
    for (let i = 0; i < 70; i++) passo();
    const quadro = (agora: number) => {
      sobra += ((agora - antes) / 1000) * v.current;
      antes = agora;
      // Uns 24 passos por segundo, como o fogo de pixel antigo.
      for (let n = 0; sobra > 1 / 24 && n < 3; n++) { sobra -= 1 / 24; passo(); }
      if (sobra > 1 / 24) sobra = 0;
      id = requestAnimationFrame(quadro);
    };
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
  }, [v]);
  return <canvas ref={ref} className="coisa-close-chamas" width={FOGO_L} height={FOGO_A} aria-hidden />;
}

// ── As luzes mortas ─────────────────────────────────────────────────────────

const LUZ_L = 300;
const ANEIS = 15;
/** Quanto os anéis andam na direção de quem olha, por segundo. */
const VELOCIDADE_DOS_ANEIS = 1.5;
/** O giro da goela inteira (radianos por segundo) e a torção da espiral, do fundo até a boca. */
const GIRO_DA_GOELA = 0.55, ESPIRAL = 1.6;
/** As voltas das três luzes em volta do meio, por segundo. */
const ORBITA = 0.22;

type Cor = readonly [number, number, number];
const misturar = (a: Cor, b: Cor, k: number): Cor => {
  const t = Math.max(0, Math.min(1, k));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};
const css = (c: Cor, a = 1) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`;

const CARNE: Cor = [34, 8, 6];
const CARNE_NA_LUZ: Cor = [150, 70, 40];
const DENTE: Cor = [70, 50, 30];
const DENTE_NA_LUZ: Cor = [246, 228, 176];
const OURO: Cor = [255, 206, 120];
const VERMELHO: Cor = [255, 40, 30];

/** A goela: um losango de pontas redondas, mais alto que largo (a foto do túnel). */
function naGoela(cx: number, cy: number, raio: number, ang: number): readonly [number, number] {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [cx + raio * 0.95 * Math.sign(c) * Math.abs(c) ** 0.72, cy + raio * 1.22 * Math.sign(s) * Math.abs(s) ** 0.72];
}

export function LuzesMortas({ dura, v }: {
  /** Quanto tudo leva, em segundos (no fim, a luz toma a tela). */
  dura: number;
  v: RefObject<number>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const c = cv?.getContext('2d');
    if (!cv || !c) return;
    const W = LUZ_L, H = Math.round((LUZ_L * window.innerHeight) / Math.max(1, window.innerWidth));
    cv.width = W; cv.height = H;
    const cx = W / 2, cy = H * 0.5;
    const acaso = sorteador(1990);
    const faiscas = Array.from({ length: 46 }, () => ({ x: acaso() * W, y: acaso() * H, vel: 6 + acaso() * 16, fase: acaso() * 6 }));

    let t = 0, antes = performance.now(), id = 0;
    const quadro = (agora: number) => {
      t += Math.min(0.05, (agora - antes) / 1000) * v.current;
      antes = agora;
      const k = Math.min(1, t / dura);
      // A luz acende, cresce e, no fim, toma tudo.
      const luz = Math.min(1, 0.35 + k * 1.1);
      c.fillStyle = css(CARNE);
      c.fillRect(0, 0, W, H);

      // Os anéis de carne e dentes, do mais perto (maior) ao mais fundo.
      const aneis = Array.from({ length: ANEIS }, (_, i) => ({ i, z: (((i + t * VELOCIDADE_DOS_ANEIS) % ANEIS) + ANEIS) % ANEIS / ANEIS }))
        .sort((a, b) => b.z - a.z);
      const rot = t * GIRO_DA_GOELA;
      for (const { i, z } of aneis) {
        const raio = 2 + z ** 2.3 * W * 0.72;
        // A espiral: o fundo gira na frente da boca.
        const torce = rot + (1 - z) * ESPIRAL;
        // Perto de quem olha a carne some no escuro; lá no fundo, na luz.
        const naLuz = (1 - z) ** 1.3 * luz;
        const lados = 48;
        c.beginPath();
        for (let j = 0; j <= lados; j++) {
          const [x, y] = naGoela(cx, cy, raio, (j / lados) * Math.PI * 2 + torce);
          if (j) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.fillStyle = css(misturar(CARNE, CARNE_NA_LUZ, naLuz * 0.85));
        c.fill();
        // A dobra escura da carne logo dentro do anel.
        c.strokeStyle = css(misturar([10, 2, 2], CARNE, naLuz * 0.8), 0.9);
        c.lineWidth = Math.max(1, raio * 0.03);
        c.stroke();
        // O molhado: pontinhos de brilho na carne.
        const brilhos = Math.round(6 + 14 * z);
        for (let j = 0; j < brilhos; j++) {
          const a = j * 2.39996 + i * 1.3 + torce;
          const [x, y] = naGoela(cx, cy, raio * (0.9 + 0.08 * Math.sin(j * 5.1)), a);
          c.fillStyle = css(misturar(CARNE_NA_LUZ, OURO, 0.6), 0.25 + naLuz * 0.7);
          c.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
        // Os dentes na beirada, finos e muitos, apontando para dentro; cada anel gira para um lado.
        const n = Math.round(22 + 34 * z);
        const giro = i * 0.41 + t * 0.16 * (i % 2 ? 1 : -1) + torce;
        const dente = misturar(DENTE, DENTE_NA_LUZ, naLuz + 0.15);
        const ponta = misturar(dente, [255, 248, 220], 0.45);
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2 + giro;
          const larg = ((Math.PI * 2) / n) * 0.3;
          const comp = 0.86 - 0.05 * Math.sin(j * 2.3 + i);
          const [x1, y1] = naGoela(cx, cy, raio, a - larg);
          const [x2, y2] = naGoela(cx, cy, raio, a + larg);
          const [xp, yp] = naGoela(cx, cy, raio * comp, a);
          const [xm, ym] = naGoela(cx, cy, raio * (1 - (1 - comp) * 0.5), a);
          c.beginPath();
          c.moveTo(x1, y1); c.lineTo(xp, yp); c.lineTo(x2, y2); c.closePath();
          c.fillStyle = css(dente);
          c.fill();
          // A ponta mais clara, na luz.
          c.beginPath();
          c.moveTo((x1 + xm) / 2, (y1 + ym) / 2); c.lineTo(xp, yp); c.lineTo((x2 + xm) / 2, (y2 + ym) / 2); c.closePath();
          c.fillStyle = css(ponta);
          c.fill();
        }
      }
      // A borda da tela no escuro, como dentro da boca.
      const sombra = c.createRadialGradient(cx, cy, W * 0.25, cx, cy, W * 0.75);
      sombra.addColorStop(0, 'rgb(0 0 0 / 0)');
      sombra.addColorStop(1, 'rgb(6 1 1 / 0.85)');
      c.fillStyle = sombra;
      c.fillRect(0, 0, W, H);

      // O clarão do fundo, crescendo.
      const halo = W * (0.1 + 0.25 * k + 1.4 * Math.max(0, k - 0.6) ** 1.6);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, halo);
      g.addColorStop(0, css(OURO, 0.95));
      g.addColorStop(0.45, css(OURO, 0.4));
      g.addColorStop(1, css(OURO, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      c.globalCompositeOperation = 'lighter';
      // As duas rodas de raios, girando uma contra a outra.
      const raios = (n: number, giro: number, alfa: number, abertura: number) => {
        const alcance = W * (0.3 + 0.9 * k);
        const gr = c.createRadialGradient(cx, cy, 0, cx, cy, alcance);
        gr.addColorStop(0, css(OURO, alfa));
        gr.addColorStop(0.6, css(OURO, alfa * 0.35));
        gr.addColorStop(1, css(OURO, 0));
        c.beginPath();
        for (let r = 0; r < n; r++) {
          const a = (r / n) * Math.PI * 2 + giro;
          c.moveTo(cx, cy);
          c.arc(cx, cy, alcance, a - abertura / 2, a + abertura / 2);
          c.closePath();
        }
        c.fillStyle = gr;
        c.fill();
      };
      raios(12, t * 0.55, 0.24 * luz, 0.1);
      raios(7, -t * 0.85, 0.17 * luz, 0.17);

      // As três luzes orbitando o meio (duas em cima, uma embaixo, no começo),
      // pulsando cada uma no seu tempo, com o rastro e o brilho em cruz.
      const cresce = 1 + k * 2.4;
      const volta = t * ORBITA * Math.PI * 2;
      const lugar = (a: number) => [cx + Math.cos(a) * 7.5 * cresce, cy + Math.sin(a) * 6.5 * cresce] as const;
      [-5 / 6, -1 / 6, 1 / 2].forEach((ini, i) => {
        const a = ini * Math.PI + volta;
        const r = (2.6 + Math.sin(t * 7 + i * 2) * 0.5) * cresce;
        for (let p = 7; p >= 1; p--) {
          const [rx, ry] = lugar(a - p * 0.07);
          c.fillStyle = css(OURO, 0.1 * (1 - p / 8));
          c.beginPath();
          c.arc(rx, ry, r * (1.1 - p * 0.06), 0, Math.PI * 2);
          c.fill();
        }
        const [x, y] = lugar(a);
        const gl = c.createRadialGradient(x, y, 0, x, y, r * 3.4);
        gl.addColorStop(0, 'rgb(255 255 245 / 1)');
        gl.addColorStop(0.25, css(OURO, 0.95));
        gl.addColorStop(0.6, css([255, 120, 40], 0.35));
        gl.addColorStop(1, css(OURO, 0));
        c.fillStyle = gl;
        c.fillRect(x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8);
        // O brilho em cruz, girando ao contrário da órbita.
        c.save();
        c.translate(x, y);
        c.rotate(-t * 1.8 + i);
        const fio = Math.max(1, r * 0.22);
        for (const [l, a2] of [[r * 7, 0.55], [r * 4, 0.35]] as const) {
          const cruz = c.createLinearGradient(-l, 0, l, 0);
          cruz.addColorStop(0, 'rgb(255 240 200 / 0)');
          cruz.addColorStop(0.5, `rgb(255 250 225 / ${a2})`);
          cruz.addColorStop(1, 'rgb(255 240 200 / 0)');
          c.fillStyle = cruz;
          c.fillRect(-l, -fio / 2, l * 2, fio);
          c.rotate(Math.PI / 2);
          c.fillRect(-l, -fio / 2, l * 2, fio);
          c.rotate(Math.PI / 4);
        }
        c.restore();
      });
      c.globalCompositeOperation = 'source-over';

      // As faíscas subindo: quem olha também vai flutuar.
      for (const f of faiscas) {
        const y = (((f.y - t * f.vel) % H) + H) % H;
        const x = f.x + Math.sin(t * 2 + f.fase) * 2;
        c.fillStyle = css(OURO, 0.5 + 0.5 * Math.sin(t * 9 + f.fase));
        c.fillRect(Math.round(x), Math.round(y), 1, 1);
      }

      // No meio, a luz fica vermelha (a segunda foto da sequência), depois volta ao ouro.
      const verm = Math.max(0, 1 - Math.abs(k - 0.5) / 0.16);
      if (verm > 0) {
        c.globalCompositeOperation = 'color';
        c.fillStyle = css(VERMELHO, verm * 0.75);
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
      }
      // E no fim, o clarão toma a tela.
      if (k > 0.8) {
        c.fillStyle = `rgb(255 244 214 / ${Math.min(1, (k - 0.8) / 0.17)})`;
        c.fillRect(0, 0, W, H);
      }
      id = requestAnimationFrame(quadro);
    };
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
  }, [dura, v]);
  return <canvas ref={ref} className="coisa-luzes-mortas" aria-hidden />;
}
