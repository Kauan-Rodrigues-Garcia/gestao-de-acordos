/**
 * fisica.ts — a morte do zumbi: o que voa, o que tomba e o sangue no chão.
 *
 * Puro (sem DOM): simula e pinta numa grade de pixels (`Uint32Array`, um
 * pixel do sprite por posição). `cena.tsx` só copia a grade para um canvas
 * ampliado sem suavizar. Assim nada sai do grid da arte em pixel: posição
 * sempre arredondada, peça girada por amostragem do pixel mais perto, em
 * passos de 15°, e nunca meio pixel.
 *
 * ## Os dois tiros (Cleber, 07/10/2026)
 *
 *   cabeça  a cabeça estoura em pedaços e sangue; o corpo fica um instante de
 *           pé, jorrando pelo pescoço, e tomba para trás numa poça.
 *   corpo   o tronco estoura; os braços voam girando, as pernas desabam, e a
 *           cabeça cai, quica, rola e para numa poça de sangue.
 *
 * ## Cada um morre do seu jeito (08/10/2026)
 *
 * O enfeite marcado com `solta` (`zumbis.ts`) sai da peça e cai sozinho: o
 * boné voa girando, a gravata e o véu descem planando, o machado finca no
 * chão, a bag cai e solta uma pizza, o cérebro quica mole e suja o chão de
 * rosa. No headshot saem os da cabeça; no tiro no corpo, os do tronco e o que
 * a cabeça não segura (o que cai e o que plana — o machado continua cravado).
 *
 * ## Os sons
 *
 * A física não toca nada: anota em `eventos` (baque, cravou, pop, plof) e
 * quem desenha (`cena.tsx`) toca (`sons.ts`).
 *
 * O palco é um retângulo em volta do zumbi com um chão na altura dos pés.
 * O que cai fica um pouco à frente ou atrás da linha do chão (`chao` de cada
 * gota): o chão tem profundidade, e a sujeira se espalha em vez de virar uma
 * linha só.
 */
import {
  ALTURA, LARGURA, TODOS_OS_QUADROS, montarEnfeite, montarQuadro,
  type Enfeite, type Imagem, type Quadro, type Solta, type Zumbi,
} from './zumbis';

export type Tiro = 'cabeca' | 'corpo';

/** O palco, em pixels do sprite. Na tela, cada um vira `ESCALA` px. */
export const PALCO_L = 200;
export const CHAO = 84;
export const PALCO_A = CHAO + 8;
/** Onde o sprite do zumbi fica no palco: os pés tocam o chão. */
export const ORIGEM_X = Math.round((PALCO_L - LARGURA) / 2);
export const ORIGEM_Y = CHAO - (ALTURA - 1);

/** Quanto dura a cena inteira, e quando ela começa a apagar. */
export const DURACAO_S = 5.2;
export const APAGA_S = 4.3;

const GRAVIDADE = 520;
const FLASH_S = 0.07;
const PASSO_ANGULO = Math.PI / 12;

// ── Cores ────────────────────────────────────────────────────────────────────

const cores = new Map<string, number>();

/** '#rrggbb' → pixel do ImageData (RGBA em little-endian). */
export function cor32(hex: string): number {
  let c = cores.get(hex);
  if (c === undefined) {
    const n = parseInt(hex.slice(1), 16);
    c = ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    cores.set(hex, c);
  }
  return c;
}

const SANGUE = ['#6e0a12', '#9e1219', '#c8202a', '#e0262b'].map(cor32);
const SANGUE_ESCURO = cor32('#5a0810');
const SANGUE_VIVO = cor32('#c8202a');
const SANGUE_BRILHO = cor32('#ff6b6b');
const MIOLO = ['#f08aaa', '#c4527a'].map(cor32);
const OSSO = cor32('#efe6cc');
const BRANCO = cor32('#ffffff');
const TERRA = ['#4a3424', '#6b5038'].map(cor32);

/** A pizza que sai da bag do Entregador. */
const PIZZA = {
  linhas: ['oooooo', 'occcco', 'oyRyyo', '.oyRo.', '.oyyo.', '..oo..'],
  cores: { o: '#1a1124', c: '#b5651d', y: '#ffd34d', R: '#c8202a' } as Record<string, string>,
};

// ── As peças ────────────────────────────────────────────────────────────────

interface Recorte { px: Uint32Array; w: number; h: number; x0: number; y0: number }

/** Só a área com pixel da imagem. */
function recortar(img: Imagem): Recorte | null {
  let x0 = img.largura, y0 = img.altura, x1 = -1, y1 = -1;
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < img.largura; i++) {
    if (!img.cores[j * img.largura + i]) continue;
    x0 = Math.min(x0, i); y0 = Math.min(y0, j); x1 = Math.max(x1, i); y1 = Math.max(y1, j);
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const px = new Uint32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = img.cores[(y0 + j) * img.largura + x0 + i];
    if (c) px[j * w + i] = cor32(c);
  }
  return { px, w, h, x0, y0 };
}

interface Poca { cx: number; cy: number; r: number; max: number }

interface Peca {
  px: Uint32Array;
  w: number;
  h: number;
  /** Onde o pixel (0,0) da peça fica com ângulo zero, e o centro do giro. */
  ox: number;
  oy: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  ang: number;
  va: number;
  /** voa: solta no ar · tomba: gira presa no calcanhar · parada. */
  modo: 'voa' | 'tomba' | 'parada';
  /** Para que lado tomba: -1 para trás, 1 para a frente. */
  lado: number;
  /** De pé, tremendo, antes de tombar. */
  espera: number;
  /** A linha do chão desta peça. */
  chao: number;
  /** Olhos apagados: troca quando bate no chão a primeira vez. */
  morta?: Uint32Array;
  /** De onde sai o sangue (na grade da peça) e por quanto tempo ainda. */
  ferida?: { x: number; y: number };
  jorro: number;
  /** Tamanho da poça que se abre quando a peça para. 0 = sem poça. */
  poca: number;
  /** Peça comprida: deita de lado (0° ou 180°), nunca em pé. */
  comprida: boolean;
  /** Enfeite solto: como ele cai (`Solta`). */
  jeito?: Solta;
  /** Para o balanço de quem plana não ser igual para todos. */
  fase?: number;
}

/** O que aconteceu no passo — `cena.tsx` transforma em som. */
export type Evento =
  | { tipo: 'baque'; forca: number }
  | { tipo: 'crava' }
  | { tipo: 'pop' }
  | { tipo: 'plof' };

interface Gota {
  x: number; y: number; vx: number; vy: number;
  cor: number; tam: number; sangue: boolean; chao: number; parada: boolean;
}

export interface Morte {
  t: number;
  tiro: Tiro;
  gotas: Gota[];
  pecas: Peca[];
  pocas: Poca[];
  /** O chão sujo: fica até o fim. */
  manchas: Uint32Array;
  /** O zumbi inteiro no instante do tiro, pintado de branco por um quadro. */
  flash: Recorte | null;
  explodir: (() => void) | null;
  aleatorio: () => number;
  /** Sobra de gotas por jorrar (o jorro é contínuo, a gota é inteira). */
  sobra: number;
  /** O que tocar: quem desenha esvazia. */
  eventos: Evento[];
}

function quantizar(a: number): number {
  return Math.round(a / PASSO_ANGULO) * PASSO_ANGULO;
}

/** Meia-altura da peça girada: quanto dela fica abaixo do centro. */
function meiaAltura(p: Peca, ang: number): number {
  return Math.abs((p.w / 2) * Math.sin(ang)) + Math.abs((p.h / 2) * Math.cos(ang));
}

/** Um ponto da grade da peça, no palco, com o giro de agora. */
function noPalco(p: Peca, lx: number, ly: number): { x: number; y: number } {
  const q = quantizar(p.ang);
  const dx = p.ox + lx - p.cx, dy = p.oy + ly - p.cy;
  const c = Math.cos(q), s = Math.sin(q);
  return { x: p.cx + c * dx - s * dy, y: p.cy + s * dx + c * dy };
}

function novaPeca(r: Recorte, extra: Partial<Peca>): Peca {
  const ox = ORIGEM_X + r.x0, oy = ORIGEM_Y + r.y0;
  return {
    px: r.px, w: r.w, h: r.h, ox, oy, cx: ox + r.w / 2, cy: oy + r.h / 2,
    vx: 0, vy: 0, ang: 0, va: 0, modo: 'voa', lado: -1, espera: 0, chao: CHAO - 1,
    jorro: 0, poca: 0, comprida: r.w > r.h * 1.6 || r.h > r.w * 1.6,
    ...extra,
  };
}

// ── A cena ──────────────────────────────────────────────────────────────────

/**
 * Prepara a morte do zumbi no quadro em que ele estava. `impacto` é o pixel do
 * sprite onde o tiro pegou; `frente` é 1 (o zumbi olha para a direita do
 * palco — quem espelha é o canvas).
 */
export function criarMorte(
  z: Zumbi,
  quadro: number,
  tiro: Tiro,
  impacto: { x: number; y: number },
  aleatorio: () => number = Math.random,
): Morte {
  const n = TODOS_OS_QUADROS.length;
  const q = TODOS_OS_QUADROS[((quadro % n) + n) % n];
  const m: Morte = {
    t: 0, tiro, gotas: [], pecas: [], pocas: [],
    manchas: new Uint32Array(PALCO_L * PALCO_A),
    flash: recortar(montarQuadro(z, q)),
    explodir: null,
    aleatorio,
    sobra: 0,
    eventos: [],
  };
  const ix = ORIGEM_X + impacto.x, iy = ORIGEM_Y + impacto.y;
  const rnd = (a: number, b: number) => a + aleatorio() * (b - a);

  // Os enfeites que saem: no headshot, os da cabeça; no corpo, os do tronco e
  // o que a cabeça que voa não segura.
  const soltos = z.enfeites.filter(e => e.solta && (tiro === 'cabeca'
    ? e.parte === 'cabeca'
    : e.parte === 'tronco' || (e.parte === 'cabeca' && (e.solta === 'cai' || e.solta === 'plana'))));
  const sem = (e: Enfeite) => soltos.includes(e);

  m.explodir = () => {
    for (const e of soltos) soltarEnfeite(m, z, q, e, ix);
    if (tiro === 'cabeca') {
      const cabeca = montarQuadro(z, q, p => p === 'cabeca', { sem });
      despedacar(m, cabeca, ix, iy, 0.8, 45, 165);
      jorrar(m, ix, iy, 46, 40, 150);
      for (let i = 0; i < 10; i++) m.gotas.push(gota(m, ix, iy, rnd(-80, 80), rnd(-190, -80), MIOLO[i % 2], 2, false));
      for (let i = 0; i < 4; i++) m.gotas.push(gota(m, ix, iy, rnd(-90, 90), rnd(-180, -70), OSSO, 1, false));

      const corpo = recortar(montarQuadro(z, q, p => p !== 'cabeca', { sem }));
      if (corpo) {
        // Preso no calcanhar de trás, para tombar de costas.
        const p = novaPeca(corpo, {
          modo: 'tomba', lado: -1, espera: 0.55, jorro: 1.7, poca: 16,
          ferida: { x: 11.5 - corpo.x0, y: 13 - corpo.y0 },
        });
        p.cx = ORIGEM_X + 6; p.cy = CHAO;
        m.pecas.push(p);
      }
      return;
    }

    // Tiro no corpo.
    const tronco = montarQuadro(z, q, p => p === 'tronco', { sem });
    despedacar(m, tronco, ix, iy, 0.7, 40, 150);
    jorrar(m, ix, iy, 64, 35, 150);

    const cab = recortar(montarQuadro(z, q, p => p === 'cabeca', { sem }));
    const cabMorta = recortar(montarQuadro(z, q, p => p === 'cabeca', { morta: true, sem }));
    if (cab) {
      m.pecas.push(novaPeca(cab, {
        vx: rnd(12, 40), vy: rnd(-175, -135), va: rnd(-12, 12),
        morta: cabMorta?.px, ferida: { x: cab.w / 2, y: cab.h - 1 }, jorro: 0.9, poca: 11,
        chao: CHAO + Math.round(rnd(0, 3)),
      }));
    }
    const frente = recortar(montarQuadro(z, q, p => p === 'bracoFrente'));
    if (frente) {
      m.pecas.push(novaPeca(frente, {
        vx: rnd(40, 75), vy: rnd(-185, -140), va: rnd(10, 18),
        ferida: { x: 1, y: 2 }, jorro: 0.5, chao: CHAO + Math.round(rnd(-2, 2)),
      }));
    }
    const tras = recortar(montarQuadro(z, q, p => p === 'bracoTras'));
    if (tras) {
      m.pecas.push(novaPeca(tras, {
        vx: rnd(-60, -30), vy: rnd(-175, -130), va: rnd(-14, -8),
        ferida: { x: 1, y: 2 }, jorro: 0.5, chao: CHAO + Math.round(rnd(-3, 1)),
      }));
    }
    const pernas = recortar(montarQuadro(z, q, p => p === 'pernaFrente' || p === 'pernaTras'));
    if (pernas) {
      const lado = aleatorio() < 0.5 ? -1 : 1;
      const p = novaPeca(pernas, {
        modo: 'tomba', lado, espera: 0.4, jorro: 1.1, poca: 9,
        ferida: { x: pernas.w / 2, y: 0 },
      });
      p.cx = lado < 0 ? ORIGEM_X + 6 : ORIGEM_X + 17;
      p.cy = CHAO;
      m.pecas.push(p);
    }
  };
  return m;
}

/** O enfeite vira peça própria, com o empurrão do jeito dele. */
function soltarEnfeite(m: Morte, z: Zumbi, q: Quadro, e: Enfeite, ix: number): void {
  const r = recortar(montarEnfeite(z, q, e));
  if (!r || !e.solta) return;
  const a = m.aleatorio;
  const rnd = (de: number, ate: number) => de + a() * (ate - de);
  // Para longe do tiro.
  const longe = ORIGEM_X + r.x0 + r.w / 2 >= ix ? 1 : -1;
  const chao = CHAO + Math.round(rnd(-2, 3));
  const base = { jeito: e.solta, chao, fase: rnd(0, Math.PI * 2) };
  const impulso: Record<Solta, Partial<Peca>> = {
    cai:   { vx: longe * rnd(30, 80), vy: rnd(-230, -170), va: rnd(-16, 16) },
    plana: { vx: longe * rnd(15, 45), vy: rnd(-150, -100), va: 0 },
    // Para a frente: o corpo tomba de costas, e o machado cravado atrás dele sumiria.
    crava: { vx: rnd(45, 75), vy: rnd(-270, -240), va: rnd(13, 17) },
    abre:  { vx: -rnd(40, 75), vy: rnd(-200, -170), va: rnd(-8, -4) },
    miolo: { vx: longe * rnd(10, 40), vy: rnd(-270, -230), va: rnd(-10, 10) },
  };
  m.pecas.push(novaPeca(r, { ...base, ...impulso[e.solta] }));
}

function pizza(m: Morte, x: number, y: number, chao: number): Peca {
  const w = PIZZA.linhas[0].length, h = PIZZA.linhas.length;
  const px = new Uint32Array(w * h);
  PIZZA.linhas.forEach((l, j) => [...l].forEach((c, i) => { if (c !== '.') px[j * w + i] = cor32(PIZZA.cores[c]); }));
  const ox = x - w / 2, oy = y - h;
  return {
    px, w, h, ox, oy, cx: ox + w / 2, cy: oy + h / 2,
    vx: (m.aleatorio() - 0.5) * 60, vy: -170, ang: 0, va: (m.aleatorio() - 0.5) * 20,
    modo: 'voa', lado: -1, espera: 0, chao, jorro: 0, poca: 0, comprida: false, jeito: 'cai',
  };
}

function gota(m: Morte, x: number, y: number, vx: number, vy: number, cor: number, tam: number, sangue: boolean): Gota {
  return { x, y, vx, vy, cor, tam, sangue, chao: CHAO - 1 + Math.round((m.aleatorio() - 0.5) * 6), parada: false };
}

/** A peça vira pedaços: cada pixel (quase todos) sai voando do tiro para fora. */
function despedacar(m: Morte, img: Imagem, ix: number, iy: number, fica: number, vmin: number, vmax: number): void {
  const a = m.aleatorio;
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < img.largura; i++) {
    const c = img.cores[j * img.largura + i];
    if (!c || a() > fica) continue;
    const x = ORIGEM_X + i, y = ORIGEM_Y + j;
    let dx = x - ix, dy = y - iy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const v = vmin + a() * (vmax - vmin);
    m.gotas.push(gota(m, x, y, dx * v + (a() - 0.5) * 40, dy * v - 55 - a() * 70, cor32(c), a() < 0.16 ? 2 : 1, false));
  }
}

/** Um esguicho de sangue para todo lado, mais para cima. */
function jorrar(m: Morte, x: number, y: number, n: number, vmin: number, vmax: number): void {
  const a = m.aleatorio;
  for (let i = 0; i < n; i++) {
    const ang = a() * Math.PI * 2;
    const v = vmin + a() * (vmax - vmin);
    m.gotas.push(gota(m, x, y, Math.cos(ang) * v, Math.sin(ang) * v - 60, SANGUE[i % SANGUE.length], a() < 0.25 ? 2 : 1, true));
  }
}

// ── O tempo passa ───────────────────────────────────────────────────────────

/** Avança a cena. Passos fixos de 1/120 s: a física não muda com o computador. */
export function avancar(m: Morte, dt: number): void {
  const PASSO = 1 / 120;
  let resto = Math.min(dt, 0.1);
  while (resto > 0) {
    const h = Math.min(PASSO, resto);
    passo(m, h);
    resto -= h;
  }
}

function passo(m: Morte, dt: number): void {
  const antes = m.t;
  m.t += dt;
  if (antes < FLASH_S && m.t >= FLASH_S && m.explodir) {
    const ex = m.explodir;
    m.explodir = null;
    ex();
  }
  for (const p of m.pecas) moverPeca(m, p, dt);
  for (const g of m.gotas) moverGota(m, g, dt);
  m.gotas = m.gotas.filter(g => g.x > -4 && g.x < PALCO_L + 4 && g.y < PALCO_A + 4 && !(g.sangue && g.parada));
  for (const poca of m.pocas) poca.r += (poca.max - poca.r) * Math.min(1, 1.5 * dt);
}

function moverGota(m: Morte, g: Gota, dt: number): void {
  if (g.parada) return;
  g.vy += GRAVIDADE * dt;
  g.vx *= 1 - 0.4 * dt;
  g.x += g.vx * dt;
  g.y += g.vy * dt;
  if (g.y + g.tam - 1 < g.chao) return;
  if (g.sangue) {
    manchar(m, Math.round(g.x), g.chao, g.tam);
    g.parada = true;
    return;
  }
  g.y = g.chao - g.tam + 1;
  if (Math.abs(g.vy) < 45) { g.parada = true; g.vy = 0; return; }
  g.vy = -g.vy * 0.28;
  g.vx *= 0.5;
}

function manchar(m: Morte, x: number, y: number, tam: number): void {
  const pinta = (i: number, j: number, c: number) => {
    if (i < 0 || j < 0 || i >= PALCO_L || j >= PALCO_A) return;
    m.manchas[j * PALCO_L + i] = c;
  };
  pinta(x, y, m.aleatorio() < 0.5 ? SANGUE_ESCURO : SANGUE_VIVO);
  // Respingo: a gota grande se espalha para o lado.
  if (tam > 1 || m.aleatorio() < 0.3) pinta(x + (m.aleatorio() < 0.5 ? -1 : 1), y, SANGUE_ESCURO);
}

function moverPeca(m: Morte, p: Peca, dt: number): void {
  if (p.jorro > 0) {
    p.jorro -= dt;
    sangrar(m, p, dt);
  }
  if (p.modo === 'parada') return;

  if (p.modo === 'tomba') {
    if (p.espera > 0) { p.espera -= dt; return; }
    p.va += p.lado * (3 + 16 * Math.abs(Math.sin(p.ang))) * dt;
    p.ang += p.va * dt;
    if (Math.abs(p.ang) >= Math.PI / 2) {
      p.ang = p.lado * Math.PI / 2;
      p.va = -p.va * 0.22;
      if (Math.abs(p.va) < 0.5) assentar(m, p, true);
    }
    return;
  }

  if (p.jeito === 'plana') {
    // Desce devagar, balançando de um lado para o outro.
    p.vy = Math.min(p.vy + GRAVIDADE * 0.22 * dt, 42);
    p.vx += Math.sin(m.t * 6 + (p.fase ?? 0)) * 140 * dt;
    p.vx *= 1 - Math.min(1, 2.4 * dt);
    p.ang = Math.sin(m.t * 5 + (p.fase ?? 0)) * 0.5;
  } else {
    p.vy += GRAVIDADE * dt;
    p.ang += p.va * dt;
  }
  p.cx += p.vx * dt; p.ox += p.vx * dt;
  p.cy += p.vy * dt; p.oy += p.vy * dt;
  const hh = meiaAltura(p, quantizar(p.ang));
  if (p.cy + hh < p.chao) return;

  // Bateu no chão.
  const corrige = p.chao - hh - p.cy;
  p.cy += corrige; p.oy += corrige;
  if (p.morta) { p.px = p.morta; p.morta = undefined; }

  if (p.jeito === 'crava') { cravar(m, p); return; }
  if (p.jeito === 'plana') { assentar(m, p); return; }
  if (p.jeito === 'miolo' && p.vy > 60) {
    sujarDeRosa(m, Math.round(p.cx), p.chao);
    m.eventos.push({ tipo: 'plof' });
  }

  if (Math.abs(p.vy) > 60) {
    m.eventos.push({ tipo: 'baque', forca: Math.min(1, Math.abs(p.vy) / 320) });
    // O miolo é mole: quica mais.
    p.vy = -p.vy * (p.jeito === 'miolo' ? 0.5 : 0.36);
    p.vx *= 0.7;
    p.va = p.vx / Math.max(2, hh);
    // O baque espirra sangue (só no que é carne).
    if (!p.jeito || p.jeito === 'miolo') {
      for (let i = 0; i < 6; i++) {
        m.gotas.push(gota(m, p.cx, p.cy + hh - 1, (m.aleatorio() - 0.5) * 90, -40 - m.aleatorio() * 70, SANGUE[i % 4], 1, true));
      }
    }
    return;
  }
  // Rolando: o atrito freia, o giro acompanha o chão.
  p.vy = 0;
  p.vx *= 1 - Math.min(1, 3.2 * dt);
  p.va = p.vx / Math.max(2, hh);
  if (Math.abs(p.vx) < 5) assentar(m, p);
}

/** O machado: para na hora, com a lâmina para baixo, enterrado uns pixels. */
function cravar(m: Morte, p: Peca): void {
  p.modo = 'parada';
  p.vx = 0; p.vy = 0; p.va = 0;
  // A lâmina fica na ponta direita da grade: girar 90° a põe para baixo.
  // Um pouco torto, como quem caiu de qualquer jeito.
  p.ang = Math.PI / 2 - Math.PI / 12;
  const hh = meiaAltura(p, quantizar(p.ang));
  const corrige = p.chao - hh - p.cy + 3;
  p.cy += corrige; p.oy += corrige;
  m.eventos.push({ tipo: 'crava' });
  for (let i = 0; i < 8; i++) {
    m.gotas.push(gota(m, p.cx, p.chao - 1, (m.aleatorio() - 0.5) * 80, -60 - m.aleatorio() * 60, TERRA[i % 2], 1, false));
  }
}

/** O cérebro bateu: suja o chão de rosa. */
function sujarDeRosa(m: Morte, x: number, y: number): void {
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) === 3 && m.aleatorio() < 0.5) continue;
    const yy = y + (m.aleatorio() < 0.3 ? -1 : 0);
    if (x + i >= 0 && x + i < PALCO_L && yy >= 0 && yy < PALCO_A) m.manchas[yy * PALCO_L + x + i] = MIOLO[i & 1];
  }
}

/** Parou: deita certinho num ângulo reto e abre a poça. */
function assentar(m: Morte, p: Peca, tombou = false): void {
  p.modo = 'parada';
  p.va = 0; p.vx = 0; p.vy = 0;
  // Quem tombou já está deitado, preso no calcanhar; o resto se acomoda.
  if (!tombou) {
    const reto = p.comprida ? Math.PI : Math.PI / 2;
    p.ang = Math.round(p.ang / reto) * reto;
    const hh = meiaAltura(p, p.ang);
    const corrige = p.chao - hh - p.cy;
    p.cy += corrige; p.oy += corrige;
  }
  if (p.poca > 0) {
    const onde = p.ferida ? noPalco(p, p.ferida.x, p.ferida.y) : { x: p.cx, y: p.cy };
    m.pocas.push({ cx: Math.round(onde.x), cy: p.chao, r: 1, max: p.poca });
  }
  if (tombou) m.eventos.push({ tipo: 'baque', forca: 0.8 });
  // A bag: parou, abriu, e a pizza pula para fora.
  if (p.jeito === 'abre') {
    p.jeito = 'cai';
    m.pecas.push(pizza(m, p.cx, p.cy - 2, p.chao + 1));
    m.eventos.push({ tipo: 'pop' });
  }
}

function sangrar(m: Morte, p: Peca, dt: number): void {
  if (!p.ferida) return;
  // Mais forte no começo, pingando no fim.
  const forca = Math.min(1, p.jorro);
  m.sobra += 70 * forca * dt;
  const q = quantizar(p.ang);
  // «Para cima» da peça, girado junto.
  const ux = Math.sin(q), uy = -Math.cos(q);
  const de = noPalco(p, p.ferida.x, p.ferida.y);
  while (m.sobra >= 1) {
    m.sobra -= 1;
    const v = (70 + m.aleatorio() * 90) * (0.4 + 0.6 * forca);
    m.gotas.push(gota(
      m, de.x, de.y,
      ux * v + (m.aleatorio() - 0.5) * 50 + p.vx * 0.5,
      uy * v + (m.aleatorio() - 0.5) * 30 + p.vy * 0.5,
      SANGUE[Math.floor(m.aleatorio() * SANGUE.length)], 1, true,
    ));
  }
}

// ── A pintura ───────────────────────────────────────────────────────────────

export function acabou(m: Morte): boolean {
  return m.t >= DURACAO_S;
}

/** Pinta a cena inteira na grade `buf` (PALCO_L × PALCO_A). */
export function desenhar(m: Morte, buf: Uint32Array): void {
  buf.fill(0);
  if (!(m.t < FLASH_S && m.flash)) desenharChao(m, buf, false);
  desenharResto(m, buf, false);
}

/**
 * Só o chão: as poças e as manchas. É o que fica depois, apagado, como
 * resquício de que morreu um zumbi ali (Cleber, 07/10/2026).
 */
export function desenharChao(m: Morte, buf: Uint32Array, limpar = true): void {
  if (limpar) buf.fill(0);
  for (const poca of m.pocas) pintarPoca(buf, poca);
  for (let k = 0; k < m.manchas.length; k++) if (m.manchas[k]) buf[k] = m.manchas[k];
}

/** Tudo menos o chão: o clarão, as peças, os pedaços e o sangue no ar. */
export function desenharResto(m: Morte, buf: Uint32Array, limpar = true): void {
  if (limpar) buf.fill(0);
  // O tranco do tiro: o palco treme um pixel nos primeiros instantes.
  const tremeu = m.t > FLASH_S && m.t < 0.24;
  const tx = tremeu ? (Math.floor(m.t * 60) % 2 ? 1 : -1) : 0;
  const ty = tremeu ? (Math.floor(m.t * 45) % 2 ? 1 : 0) : 0;

  if (m.t < FLASH_S && m.flash) {
    const f = m.flash;
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      if (f.px[j * f.w + i]) por(buf, ORIGEM_X + f.x0 + i, ORIGEM_Y + f.y0 + j, BRANCO);
    }
    return;
  }

  for (const p of m.pecas) pintarPeca(buf, p, tx, ty, m.t);
  for (const g of m.gotas) {
    const x = Math.round(g.x) + tx, y = Math.round(g.y) + ty;
    for (let j = 0; j < g.tam; j++) for (let i = 0; i < g.tam; i++) por(buf, x + i, y + j, g.cor);
  }
}

function por(buf: Uint32Array, x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= PALCO_L || y >= PALCO_A) return;
  buf[y * PALCO_L + x] = c;
}

function pintarPoca(buf: Uint32Array, p: Poca): void {
  const r = Math.round(p.r);
  if (r < 1) return;
  const ry = Math.max(1, Math.round(r * 0.3));
  for (let j = -ry; j <= ry; j++) {
    const meia = Math.round(r * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2)));
    for (let i = -meia; i <= meia; i++) {
      const borda = i === -meia || i === meia || j === -ry || j === ry;
      por(buf, p.cx + i, p.cy + j, borda ? SANGUE_ESCURO : SANGUE_VIVO);
    }
  }
  // O brilho da poça molhada, no alto à esquerda (a luz da arte toda).
  if (r >= 4) {
    por(buf, p.cx - Math.round(r * 0.4), p.cy - Math.max(0, ry - 1), SANGUE_BRILHO);
    if (r >= 8) por(buf, p.cx - Math.round(r * 0.4) + 1, p.cy - Math.max(0, ry - 1), SANGUE_BRILHO);
  }
}

function pintarPeca(buf: Uint32Array, p: Peca, tx: number, ty: number, t: number): void {
  // De pé, antes de tombar, o corpo estremece.
  const treme = p.modo === 'tomba' && p.espera > 0 ? (Math.floor(t * 16) % 2) : 0;
  const q = quantizar(p.ang);
  if (q === 0) {
    const x0 = Math.round(p.ox) + tx + treme, y0 = Math.round(p.oy) + ty;
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
      const c = p.px[j * p.w + i];
      if (c) por(buf, x0 + i, y0 + j, c);
    }
    return;
  }
  // Girada: para cada pixel do palco em volta, qual pixel da peça cai nele.
  const c = Math.cos(q), s = Math.sin(q);
  const cantos = [[0, 0], [p.w, 0], [0, p.h], [p.w, p.h]].map(([i, j]) => {
    const dx = p.ox + i - p.cx, dy = p.oy + j - p.cy;
    return [p.cx + c * dx - s * dy, p.cy + s * dx + c * dy];
  });
  const xs = cantos.map(k => k[0]), ys = cantos.map(k => k[1]);
  const xmin = Math.floor(Math.min(...xs)), xmax = Math.ceil(Math.max(...xs));
  const ymin = Math.floor(Math.min(...ys)), ymax = Math.ceil(Math.max(...ys));
  for (let Y = ymin; Y < ymax; Y++) for (let X = xmin; X < xmax; X++) {
    const dx = X + 0.5 - p.cx, dy = Y + 0.5 - p.cy;
    const sx = c * dx + s * dy + p.cx - p.ox;
    const sy = -s * dx + c * dy + p.cy - p.oy;
    const i = Math.floor(sx), j = Math.floor(sy);
    if (i < 0 || j < 0 || i >= p.w || j >= p.h) continue;
    const cor = p.px[j * p.w + i];
    if (cor) por(buf, X + tx, Y + ty, cor);
  }
}
