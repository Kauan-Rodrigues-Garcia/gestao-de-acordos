/**
 * chefaoEfeitos.ts — o que o chefão espalha pela tela: sangue no chão, o
 * braço que voa, o rastro do moonwalk, a poeira do pulo, as notas da Fúria e
 * os textos que sobem.
 *
 * Tudo direto no DOM, fora do React: são dezenas de pedacinhos por segundo e
 * nenhum muda depois de criado (só se apaga sozinho). Todos moram na folha do
 * palco do chefão (`cenaChefao.tsx`) e somem com ela.
 *
 * O sangue no chão (09/10/2026 — «quando ele tomar dano ficará manchas de
 * sangue no chão») fica `MANCHA_MS` e desbota — eram 45 s, e ficava sangue
 * demais acumulado; caiu para 15 s. Há um teto de manchas, a mais velha sai
 * primeiro.
 */
import { type Imagem } from './zumbis';
import {
  NUMERO_DA_PARTE_VITIMA, girarImagem, imagemDaVitima, soAParte, type ParteVitima, type PoseVitima,
} from './chefaoArte';
import { imagemParaPixels } from './pixels';

// ── Os textos que sobem ─────────────────────────────────────────────────────

export type TipoTexto = 'dano' | 'hs' | 'esquiva' | 'passo' | 'final' | 'furia' | 'cura';

const DURA_TEXTO: Readonly<Record<TipoTexto, number>> = {
  dano: 1_000, hs: 1_000, esquiva: 1_000, passo: 1_600, final: 2_300, furia: 2_000, cura: 1_200,
};

export function textoQueSobe(folha: HTMLElement, x: number, y: number, texto: string, tipo: TipoTexto): void {
  const el = document.createElement('div');
  el.className = `zb-chefao-texto ${tipo}`;
  el.textContent = texto;
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  folha.appendChild(el);
  setTimeout(() => el.remove(), DURA_TEXTO[tipo]);
}

// ── O sangue ────────────────────────────────────────────────────────────────

/** Gotas que voam do acerto e caem. */
export function respingo(folha: HTMLElement, x: number, y: number, forca: number): void {
  const n = Math.round(4 + forca * 6);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = i % 2 ? 'zb-chefao-gota escura' : 'zb-chefao-gota';
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    const ang = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * (16 + forca * 26);
    el.style.setProperty('--dx', `${Math.round((Math.cos(ang) * dist) / 2) * 2}px`);
    el.style.setProperty('--dy', `${Math.round((Math.sin(ang) * dist + 14) / 2) * 2}px`);
    folha.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }
}

/** Quanto a mancha fica no chão até sumir de vez (o CSS `zb-mancha` desbota nos últimos 5 s). */
export const MANCHA_MS = 15_000;
/** O teto de manchas na tela: a mais velha sai. */
const MAX_MANCHAS = 90;
const manchas: HTMLElement[] = [];

const SANGUE = ['#6e0a12', '#8f0f19', '#c8202a'] as const;

/**
 * Uma mancha de sangue no chão, em pixel: um borrão achatado (o chão é visto
 * de lado), com respingos em volta. `tamanho` de 0 a 1 (uma gota, uma poça).
 */
export function manchaNoChao(folha: HTMLElement, x: number, y: number, tamanho: number, escala = 3): void {
  const l = Math.round(4 + tamanho * 14);
  const a = Math.max(2, Math.round(l / 3));
  const c = document.createElement('canvas');
  c.width = l + 4;
  c.height = a + 2;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const cx = c.width / 2, cy = c.height / 2;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      const d = ((i - cx) / (l / 2)) ** 2 + ((j - cy) / (a / 2)) ** 2;
      // O borrão, e uns respingos soltos na borda.
      if (d <= 1 || (d < 1.9 && Math.random() < 0.12)) {
        ctx.fillStyle = d < 0.35 ? SANGUE[0] : SANGUE[Math.random() < 0.7 ? 1 : 2];
        ctx.fillRect(i, j, 1, 1);
      }
    }
  }
  c.className = 'zb-chefao-mancha';
  c.style.width = `${c.width * escala}px`;
  c.style.height = `${c.height * escala}px`;
  c.style.left = `${Math.round(x - (c.width * escala) / 2)}px`;
  c.style.top = `${Math.round(y - (c.height * escala) / 2)}px`;
  // Embaixo de tudo: o chefão pisa por cima do sangue.
  folha.prepend(c);
  manchas.push(c);
  while (manchas.length > MAX_MANCHAS) manchas.shift()?.remove();
  setTimeout(() => {
    c.remove();
    const i = manchas.indexOf(c);
    if (i >= 0) manchas.splice(i, 1);
  }, MANCHA_MS);
}

/** Uma gota que pinga do toco, cai até o chão e vira mancha. */
export function pingo(folha: HTMLElement, x: number, y: number, chao: number): void {
  const el = document.createElement('div');
  el.className = 'zb-chefao-pingo';
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  const queda = Math.max(4, chao - y);
  el.style.setProperty('--queda', `${Math.round(queda)}px`);
  const ms = Math.min(520, 160 + queda * 2.2);
  el.style.animationDuration = `${ms}ms`;
  folha.appendChild(el);
  setTimeout(() => { el.remove(); manchaNoChao(folha, x, chao, 0.05); }, ms);
}

// ── O braço que voa ─────────────────────────────────────────────────────────

/** O pedaço da imagem onde há pixel: o braço, sem o vazio em volta. */
export function recortar(img: Imagem): { pixels: ImageData; x: number; y: number } | null {
  let x0 = img.largura, y0 = img.altura, x1 = -1, y1 = -1;
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < img.largura; i++) {
    if (img.cores[j * img.largura + i]) {
      if (i < x0) x0 = i; if (i > x1) x1 = i;
      if (j < y0) y0 = j; if (j > y1) y1 = j;
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cores = new Array<string | null>(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cores[j * w + i] = img.cores[(y0 + j) * img.largura + x0 + i];
  return { pixels: imagemParaPixels({ largura: w, altura: h, cores, partes: new Uint8Array(w * h) }, false), x: x0, y: y0 };
}

/** Quanto o pedaço fica no chão depois de parar (os últimos 6 s, apagando). */
const PEDACO_MS = 25_000;

/**
 * O braço arrancado: voa girando, quica no chão, desliza e para, deixando
 * uma poça. `x`, `y` = canto de cima onde ele estava no corpo; `espelho` =
 * o chefão olhava para a esquerda; `vx` = para onde voa (px/s).
 */
export function pedacoQueVoa(
  folha: HTMLElement, recorte: { pixels: ImageData }, x: number, y: number,
  escala: number, espelho: boolean, vx: number, chao: number,
): void {
  const w = recorte.pixels.width, h = recorte.pixels.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')?.putImageData(recorte.pixels, 0, 0);
  c.className = 'zb-chefao-pedaco';
  c.style.width = `${w * escala}px`;
  c.style.height = `${h * escala}px`;
  folha.appendChild(c);

  const GRAVIDADE = 1500;
  const metadeAltura = (h * escala) / 2;
  const s = { x, y, vx, vy: -420 - Math.random() * 160, rot: 0, vr: (vx > 0 ? 1 : -1) * (540 + Math.random() * 360) };
  let antes = performance.now();
  let rastro = 0;
  let parado = false;
  const pintar = () => {
    c.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) rotate(${Math.round(s.rot / 15) * 15}deg)${espelho ? ' scaleX(-1)' : ''}`;
  };
  const passo = (agora: number) => {
    const dt = Math.min(0.04, (agora - antes) / 1000);
    antes = agora;
    s.vy += GRAVIDADE * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.vr * dt;
    // Sangue saindo enquanto voa.
    rastro += dt;
    if (rastro > 0.045 && !parado) { rastro = 0; respingo(folha, s.x + (w * escala) / 2, s.y + metadeAltura, 0.15); }
    // O chão: quica, perde força, desliza.
    if (s.y + metadeAltura >= chao) {
      s.y = chao - metadeAltura;
      if (Math.abs(s.vy) > 120) {
        s.vy *= -0.32;
        s.vx *= 0.55;
        s.vr *= 0.45;
        manchaNoChao(folha, s.x + (w * escala) / 2, chao, 0.3);
      } else {
        s.vy = 0;
        s.vx *= 0.82;
        s.vr *= 0.7;
        if (Math.abs(s.vx) < 6) {
          parado = true;
          // Deita: gira até o múltiplo de 90° mais perto.
          s.rot = Math.round(s.rot / 90) * 90;
          pintar();
          manchaNoChao(folha, s.x + (w * escala) / 2, chao, 0.75);
          setTimeout(() => c.classList.add('some'), PEDACO_MS - 6_000);
          setTimeout(() => c.remove(), PEDACO_MS);
          return;
        }
      }
    }
    pintar();
    requestAnimationFrame(passo);
  };
  pintar();
  requestAnimationFrame(passo);
}

// ── O rastro, a poeira e as notas ───────────────────────────────────────────

/**
 * Uma cópia do chefão que fica para trás e apaga: o rastro do moonwalk, do
 * deslize e da Fúria. `transform` é o mesmo do corpo naquele quadro.
 * Entra ATRÁS do corpo (`atrasDe`): por cima, ele borrava o chefão inteiro.
 */
export function rastro(
  folha: HTMLElement, pixels: ImageData, x: number, y: number,
  largura: number, altura: number, transform: string, furia: boolean, atrasDe: Element | null,
): void {
  const c = document.createElement('canvas');
  c.width = pixels.width;
  c.height = pixels.height;
  c.getContext('2d')?.putImageData(pixels, 0, 0);
  c.className = furia ? 'zb-chefao-rastro furia' : 'zb-chefao-rastro';
  c.style.left = `${Math.round(x)}px`;
  c.style.top = `${Math.round(y)}px`;
  c.style.width = `${largura}px`;
  c.style.height = `${altura}px`;
  c.style.transform = transform;
  folha.insertBefore(c, atrasDe && atrasDe.parentNode === folha ? atrasDe : null);
  setTimeout(() => c.remove(), 420);
}

/** A poeira de quando ele pula e de quando cai. */
export function poeira(folha: HTMLElement, x: number, y: number, forte: boolean): void {
  const n = forte ? 8 : 4;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'zb-chefao-poeira';
    const lado = i % 2 ? 1 : -1;
    el.style.left = `${Math.round(x + lado * (4 + Math.random() * 10))}px`;
    el.style.top = `${Math.round(y - 4)}px`;
    el.style.setProperty('--dx', `${Math.round(lado * (14 + Math.random() * (forte ? 36 : 18)))}px`);
    el.style.setProperty('--dy', `${-Math.round(4 + Math.random() * 12)}px`);
    folha.appendChild(el);
    setTimeout(() => el.remove(), 520);
  }
}

// ── A vítima do banquete ────────────────────────────────────────────────────

export interface Vitima {
  /** A linha do chão dela (px do palco). */
  chao: number;
  /** O meio do corpo agora (para o sangue). */
  meio(): { x: number; y: number };
  /** Viu o chefão: braços para cima, tremendo, olhando para ele. */
  assustar(): void;
  /** O bote: cai deitada, para longe de quem pulou (`ladoDoChefao` 1 = ele à esquerda). */
  derrubar(ladoDoChefao: 1 | -1): void;
  /** Arranca a parte e ela voa. `false` se já não havia. */
  arrancar(parte: ParteVitima): boolean;
  /** O tronco sendo roído (0–1): vira sangue, pixel a pixel. */
  roer(p: number): void;
  /** Some. Comida até o fim: ficam a poça e os ossos. */
  sumir(comida: boolean): void;
}

/** Quanto os ossos e a poça da vítima ficam no chão. */
const RESTO_DA_VITIMA_MS = 10_000;
/** A passada, andando distraída. */
const PASSADA_MS = 150;
/** O assobio de quem anda distraído. */
const ASSOBIO_MS = 650;

/**
 * A pessoa do banquete (`imagemDaVitima`), em pé na caixa `x`, `y` (o canto
 * de cima, de pé). Com `entrada`, ela chega ANDANDO de `entrada.deX` até `x`
 * em `entrada.ms`, aparecendo do nada e assobiando. Entra ATRÁS dele
 * (`atrasDe`). A cena conduz o resto: o susto, o bote, cada pedaço.
 */
export function vitima(
  folha: HTMLElement, x: number, y: number, semente: number, escala: number, atrasDe: Element | null,
  entrada?: { deX: number; ms: number },
): Vitima {
  const emPe = imagemDaVitima(semente);
  const larguraEmPe = emPe.largura * escala;
  const chao = y + emPe.altura * escala;
  const caixa = document.createElement('div');
  caixa.className = 'zb-vitima';
  const tela = document.createElement('canvas');
  tela.className = 'zb-vitima-sprite';
  caixa.appendChild(tela);
  folha.insertBefore(caixa, atrasDe && atrasDe.parentNode === folha ? atrasDe : null);

  let pose: PoseVitima = entrada ? 'anda1' : 'parada';
  let px = entrada ? entrada.deX : x;
  let caida: 1 | -1 | 0 = 0;
  const removidas = new Set<ParteVitima>();
  let roidos: number[] = [];
  let ordemDoTronco: number[] | null = null;
  let foi = false;
  let quadro = 0;
  let caixaAgora = { left: x, top: y, w: larguraEmPe, h: emPe.altura * escala };

  /** A imagem como está agora: pose, deitada ou não, e sem o que ele arrancou. */
  const imagem = (sem: ReadonlySet<ParteVitima> = removidas): Imagem => {
    const img = imagemDaVitima(semente, pose, sem);
    return caida ? girarImagem(img, caida) : img;
  };

  const pintar = () => {
    const img = imagem();
    const cores = [...img.cores];
    roidos.forEach((i, k) => { cores[i] = k % 3 === 0 ? '#5a0d0d' : null; });
    tela.width = img.largura;
    tela.height = img.altura;
    tela.getContext('2d')?.putImageData(imagemParaPixels({ ...img, cores }, false), 0, 0);
    const w = img.largura * escala, h = img.altura * escala;
    caixaAgora = { left: px + larguraEmPe / 2 - w / 2, top: chao - h, w, h };
    caixa.style.left = `${Math.round(caixaAgora.left)}px`;
    caixa.style.top = `${Math.round(caixaAgora.top)}px`;
    caixa.style.width = `${w}px`;
    caixa.style.height = `${h}px`;
  };
  pintar();

  // Chegando andando, distraída.
  if (entrada) {
    caixa.classList.add('chegando');
    const t0 = performance.now();
    let ultimoPe = t0;
    let ultimoAssobio = t0 - ASSOBIO_MS / 2;
    const andar = (agora: number) => {
      if (foi || pose === 'susto' || caida) return;
      const p = Math.min(1, (agora - t0) / entrada.ms);
      px = entrada.deX + (x - entrada.deX) * p;
      if (agora - ultimoPe >= PASSADA_MS) { ultimoPe = agora; pose = pose === 'anda1' ? 'anda2' : 'anda1'; }
      if (agora - ultimoAssobio >= ASSOBIO_MS) { ultimoAssobio = agora; nota(folha, px + larguraEmPe / 2 + 6, y - 4); }
      if (p >= 1) { px = x; pose = 'parada'; pintar(); return; }
      pintar();
      quadro = requestAnimationFrame(andar);
    };
    quadro = requestAnimationFrame(andar);
  }

  return {
    chao,
    meio: () => ({ x: caixaAgora.left + caixaAgora.w / 2, y: caixaAgora.top + caixaAgora.h / 2 }),
    assustar() {
      if (foi || caida) return;
      cancelAnimationFrame(quadro);
      px = x;
      pose = 'susto';
      caixa.classList.add('treme');
      pintar();
    },
    derrubar(ladoDoChefao) {
      if (foi || caida) return;
      cancelAnimationFrame(quadro);
      px = x;
      pose = 'susto';
      caida = ladoDoChefao;
      caixa.classList.remove('treme', 'chegando');
      pintar();
      poeira(folha, caixaAgora.left + caixaAgora.w / 2, chao, true);
      respingo(folha, caixaAgora.left + caixaAgora.w / 2, caixaAgora.top + caixaAgora.h / 2, 0.8);
    },
    arrancar(parte) {
      if (foi || removidas.has(parte)) return false;
      const r = recortar(soAParte(imagem(), parte));
      removidas.add(parte);
      pintar();
      if (!r) return true;
      const pxPedaco = caixaAgora.left + r.x * escala;
      const pyPedaco = caixaAgora.top + r.y * escala;
      // Voa para longe dele; a cabeça vai mais longe.
      const lado = caida || 1;
      const forca = parte === 'cabeca' ? 1.6 : 1;
      const vx = (lado * (110 + Math.random() * 150) + (Math.random() - 0.5) * 80) * forca;
      pedacoQueVoa(folha, r, pxPedaco, pyPedaco, escala, false, vx, chao + (Math.random() - 0.3) * 14);
      const w = r.pixels.width * escala, h = r.pixels.height * escala;
      respingo(folha, pxPedaco + w / 2, pyPedaco + h / 2, 1);
      respingo(folha, pxPedaco + w / 2, pyPedaco + h / 2, 0.6);
      manchaNoChao(folha, pxPedaco + w / 2, chao - 2, 0.7);
      return true;
    },
    roer(p) {
      if (foi || !caida) return;
      if (!ordemDoTronco) {
        // A ordem em que o tronco some: sorteada pela semente, igual em toda tela.
        const img = imagem(new Set());
        const n = NUMERO_DA_PARTE_VITIMA.tronco;
        ordemDoTronco = [...img.partes.keys()].filter(i => img.partes[i] === n);
        let s = Math.abs(semente) || 1;
        for (let i = ordemDoTronco.length - 1; i > 0; i--) {
          s = (s * 16807) % 2147483647;
          const j = s % (i + 1);
          [ordemDoTronco[i], ordemDoTronco[j]] = [ordemDoTronco[j], ordemDoTronco[i]];
        }
      }
      const q = Math.min(1, Math.max(0, p));
      roidos = ordemDoTronco.slice(0, Math.round(q * ordemDoTronco.length));
      pintar();
    },
    sumir(comida) {
      if (foi) return;
      foi = true;
      cancelAnimationFrame(quadro);
      if (!comida) {
        caixa.classList.add('some');
        setTimeout(() => caixa.remove(), 400);
        return;
      }
      caixa.remove();
      const meio = caixaAgora.left + caixaAgora.w / 2;
      manchaNoChao(folha, meio, chao - 3, 1);
      manchaNoChao(folha, meio - caixaAgora.w * 0.3, chao - 1, 0.6);
      manchaNoChao(folha, meio + caixaAgora.w * 0.3, chao - 4, 0.6);
      const ossos = document.createElement('div');
      ossos.className = 'zb-vitima-ossos';
      ossos.style.left = `${Math.round(meio)}px`;
      ossos.style.top = `${Math.round(chao - 3)}px`;
      folha.insertBefore(ossos, atrasDe && atrasDe.parentNode === folha ? atrasDe : null);
      setTimeout(() => ossos.remove(), RESTO_DA_VITIMA_MS);
    },
  };
}

/** Uma nota musical que sobe girando em volta dele, na Fúria. */
export function nota(folha: HTMLElement, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = Math.random() < 0.5 ? 'zb-chefao-nota' : 'zb-chefao-nota dupla';
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 60)}px`);
  folha.appendChild(el);
  setTimeout(() => el.remove(), 1_300);
}
