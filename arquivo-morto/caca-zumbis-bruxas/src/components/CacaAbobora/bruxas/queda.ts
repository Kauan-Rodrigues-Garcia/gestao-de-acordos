/**
 * queda.ts — a morte da bruxa: o tiro, a queda da vassoura e o espatifar no chão.
 *
 * ## Os fofos não morrem (Cleber, 14/10/2026)
 *
 * A bruxinha fofa, a gatinha, o gato e a fantasminha (`Bruxa.fofa`) levam o
 * tiro e caem do mesmo jeito, mas sem sangue, sem estourar e sem perder braço:
 * no tiro saem estrelinhas, no chão sobe poeira (sem mancha), e ela fica
 * desacordada com as estrelinhas rodando na cabeça (`Queda.tonta`). A gincana
 * conta igual: quem acertou primeiro.
 *
 * Puro (sem DOM), como `../fisica.ts`: simula em pixels da arte, e quem pinta
 * (`palco.ts`) só lê o estado. Tudo anda em passos fixos de 1/120 s — a queda
 * é a mesma em qualquer computador.
 *
 * ## O corpo é um boneco de juntas
 *
 * O zumbi morre de pé, então bastava peça rígida. A bruxa cai de alto, e corpo
 * que cai de alto se dobra: cada junta de `JUNTAS` vira uma partícula (Verlet),
 * presas por varas (`VARAS`), e cada osso de `OSSOS` é desenhado entre duas
 * delas, girado em passos de 15° (nunca meio pixel). Os braços batem no ar, a
 * cabeça pende, e no chão o corpo se ajeita como se ajeita um corpo.
 *
 * ## As três mortes
 *
 *   cabeca    HEADSHOT: a cabeça estoura em pedaços, sangue e miolo; o
 *             pescoço jorra enquanto ela cai, mole, da vassoura.
 *   corpo     o tiro abre um buraco no peito: o sangue espirra para o lado
 *             do tiro, ela dá um tranco, solta a vassoura e cai sangrando.
 *   vassoura  o tiro parte a vassoura no meio do ar: as duas metades rodam,
 *             e ela cai inteira, se debatendo, gritando, até o chão.
 *
 * Nas três, o chão é o mesmo: bateu forte, ESPATIFA — sangue para todo lado,
 * poça que cresce, às vezes um braço solto. A vassoura que caiu sozinha às
 * vezes quebra no chão e às vezes não (`CHANCE_DE_QUEBRAR`). O chapéu desce
 * planando. Os enfeites caem cada um do seu jeito (`Solta` em `arte.ts`).
 *
 * ## Os sons
 *
 * A física não toca nada: anota em `eventos`, e quem desenha toca.
 */
import { cor32 } from '../fisica';
import {
  ALTURA, BOLETO, JUNTAS, LARGURA, OSSOS, QUADROS, juntasDa, montarEnfeite, montarQuadro,
  type Bruxa, type Enfeite, type Imagem, type Junta, type Miniatura, type NomeParte, type Solta,
} from './arte';

export type Morte = 'cabeca' | 'corpo' | 'vassoura';

export const GRAVIDADE = 520;
const PASSO = 1 / 120;
/** O clarão branco do tiro, antes de tudo voar. */
export const FLASH_S = 0.06;
/** Quanto a vassoura que cai sozinha quebra no chão. «Às vezes não quebra.» */
export const CHANCE_DE_QUEBRAR = 0.55;
/** A velocidade (px/s da arte) de queda a partir da qual o corpo espatifa. */
const ESPATIFA = 110;
/** O «raio» de cada junta: o desenho em volta dela não entra no chão. */
const RAIO = 3;
/** Passo do giro desenhado: 15°. */
export const PASSO_ANGULO = Math.PI / 12;

// ── Cores ──────────────────────────────────────────────────────────────────

const SANGUE = ['#6e0a12', '#9e1219', '#c8202a', '#e0262b'].map(cor32);
const SANGUE_ESCURO = cor32('#5a0810');
const SANGUE_VIVO = cor32('#b81a24');
const SANGUE_BRILHO = cor32('#ff6b6b');
const MIOLO = ['#f08aaa', '#c4527a'].map(cor32);
const OSSO = cor32('#efe6cc');
const BRANCO = cor32('#ffffff');
const LASCA = ['#c49563', '#8a5e33', '#f6dc8a'].map(cor32);
const VIDRO = ['#e8fff0', '#a8ffc8'].map(cor32);
/** As estrelinhas do tiro num fofo, e a poeira da queda. */
const ESTRELINHAS = ['#ffd34d', '#fff4a0', '#ffffff', '#ffb4e0'].map(cor32);
const POEIRA = ['#d8d0c4', '#b8b0a4', '#ece6dc'].map(cor32);

// ── Recortes ───────────────────────────────────────────────────────────────

/** Só a área com pixel de uma imagem, já em cor de `ImageData`. */
export interface Recorte {
  px: Uint32Array;
  w: number;
  h: number;
  /** Onde o recorte ficava no sprite (já espelhado, se for o caso). */
  x0: number;
  y0: number;
  /** Para o cache de giros de quem desenha. */
  id: number;
}

let ids = 1;

export function recortar(img: Imagem, espelhar: boolean): Recorte | null {
  const W = img.largura;
  const cor = (i: number, j: number) => img.cores[j * W + (espelhar ? W - 1 - i : i)];
  let x0 = W, y0 = img.altura, x1 = -1, y1 = -1;
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < W; i++) {
    if (!cor(i, j)) continue;
    x0 = Math.min(x0, i); y0 = Math.min(y0, j); x1 = Math.max(x1, i); y1 = Math.max(y1, j);
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const px = new Uint32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = cor(x0 + i, y0 + j);
    if (c) px[j * w + i] = cor32(c);
  }
  return { px, w, h, x0, y0, id: ids++ };
}

function deMiniatura(m: Miniatura): Recorte {
  const w = m.linhas[0].length, h = m.linhas.length;
  const px = new Uint32Array(w * h);
  m.linhas.forEach((l, j) => [...l].forEach((c, i) => { if (c !== '.') px[j * w + i] = cor32(m.cores[c]); }));
  return { px, w, h, x0: 0, y0: 0, id: ids++ };
}

/** Parte um recorte em dois numa coluna (a vassoura que quebra). */
function partir(r: Recorte, corte: number): [Recorte | null, Recorte | null] {
  const lado = (de: number, ate: number): Recorte | null => {
    if (ate <= de) return null;
    // Só as linhas com pixel: a metade da vara é baixinha, não do tamanho da palha.
    let j0 = r.h, j1 = -1;
    for (let j = 0; j < r.h; j++) for (let i = de; i < ate; i++) if (r.px[j * r.w + i]) { j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    if (j1 < 0) return null;
    const w = ate - de, h = j1 - j0 + 1;
    const px = new Uint32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px[j * w + i] = r.px[(j0 + j) * r.w + de + i];
    return { px, w, h, x0: r.x0 + de, y0: r.y0 + j0, id: ids++ };
  };
  return [lado(0, corte), lado(corte, r.w)];
}

// ── O estado ───────────────────────────────────────────────────────────────

interface Ponto { x: number; y: number; ax: number; ay: number; vivo: boolean }
interface Vara { a: number; b: number; len: number; rigidez: number; viva: boolean }

export interface Osso {
  nome: string;
  rec: Recorte;
  de: number;
  para: number;
  /** A junta `de` dentro do recorte (onde o giro acontece). */
  ax: number;
  ay: number;
  /** O ângulo de `de → para` no sprite parado: o giro desenhado é a diferença. */
  ang0: number;
  vivo: boolean;
}

export type Jeito = Solta | 'vassoura' | 'chapeu' | 'pedaco' | 'papel';

/** Uma peça rígida solta: a vassoura, o chapéu, um enfeite, um boleto. */
export interface Solto {
  rec: Recorte;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  ang: number;
  va: number;
  jeito: Jeito;
  modo: 'voa' | 'parada' | 'foi';
  chao: number;
  fase: number;
  /** A vassoura sem dono plana um pouco antes de cair. */
  sustentacao?: number;
  /** O gato: pulos que ainda faltam até sair da tela. */
  pulos?: number;
  /** A cor da poça quando quebra (a poção). */
  cor?: number;
}

interface Gota {
  x: number; y: number; vx: number; vy: number; cor: number; tam: number; sangue: boolean; chao: number; fim?: boolean;
  /** Some ao tocar o chão, sem manchar (estrelinha, poeira). */
  some?: boolean;
}

export interface Poca { cx: number; cy: number; r: number; max: number; cor: number; borda: number }

interface Jorro { de: () => { x: number; y: number; dx: number; dy: number } | null; ate: number; taxa: number; sobra: number }

export type Evento =
  | { tipo: 'espatifa'; forca: number }
  | { tipo: 'baque'; forca: number }
  | { tipo: 'quebra' }
  | { tipo: 'vidro' }
  | { tipo: 'miau' }
  | { tipo: 'cerebro' }
  | { tipo: 'grito' }
  /** O fofo levou o tiro (estrelinhas) e caiu desacordado. */
  | { tipo: 'bonk' }
  | { tipo: 'desmaia'; forca: number };

export interface Queda {
  t: number;
  morte: Morte;
  pontos: Ponto[];
  varas: Vara[];
  ossos: Osso[];
  soltos: Solto[];
  gotas: Gota[];
  pocas: Poca[];
  /** O chão sujo, pixel a pixel: chave `y * 4096 + x`. */
  manchas: Map<number, number>;
  /** As manchas que chegaram desde a última pintura (quem pinta esvazia). */
  novas: number[];
  jorros: Jorro[];
  eventos: Evento[];
  chao: number;
  /** Onde fica a parede da direita: o que passa dela some. */
  largura: number;
  /** O corpo já bateu no chão. */
  espatifou: boolean;
  /** A vassoura partida no ar: ela se debate. */
  debate: boolean;
  /** O clarão do tiro: a bruxa inteira, pintada de branco. */
  flash: { rec: Recorte; x: number; y: number } | null;
  explodir: (() => void) | null;
  aleatorio: () => number;
  /** Nada mais se mexe: quem desenha pode parar de simular. */
  quieta: boolean;
  calmaria: number;
  /** Fofo: não sangra; no chão, fica desacordado (estrelinhas rodando). */
  fofa: boolean;
  tonta: boolean;
  /** O fofo desacordado levou o segundo tiro no chão (`finalizar`): agora morreu. */
  finalizada: boolean;
  /** Troca o rosto pelo de olho apagado (só nos fofos; quem chama é `finalizar`). */
  apagarOlhos: (() => void) | null;
}

const NOMES_JUNTAS = Object.keys(JUNTAS) as Junta[];
const J = Object.fromEntries(NOMES_JUNTAS.map((n, i) => [n, i])) as Record<Junta, number>;

/** As varas do boneco: [a, b, rigidez]. As fracas seguram a postura sem travar. */
const VARAS: readonly [Junta, Junta, number][] = [
  ['cabeca', 'pescoco', 1],
  ['pescoco', 'quadril', 1],
  ['cabeca', 'quadril', 0.35],
  ['ombroF', 'pescoco', 1],
  ['ombroF', 'quadril', 0.8],
  ['maoF', 'ombroF', 1],
  ['ombroT', 'pescoco', 1],
  ['ombroT', 'quadril', 0.8],
  ['maoT', 'ombroT', 1],
  ['joelhoF', 'quadril', 1],
  ['joelhoF', 'pescoco', 0.25],
  ['peF', 'joelhoF', 1],
  ['peF', 'quadril', 0.2],
  ['joelhoT', 'quadril', 1],
  ['joelhoT', 'pescoco', 0.25],
  ['peT', 'joelhoT', 1],
  ['peT', 'quadril', 0.2],
];

/** Os membros que podem se soltar no chão: as varas que os prendem. */
const MEMBROS: Readonly<Record<string, readonly number[]>> = {
  bracoF: [3, 4],
  bracoT: [6, 7],
};

export interface Entrada {
  bruxa: Bruxa;
  quadro: number;
  /** 1 = olhava para a direita; -1 = esquerda (o sprite espelhado). */
  lado: number;
  /** O canto de cima à esquerda do sprite no mundo (px da arte). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  morte: Morte;
  /** O pixel do sprite onde o tiro pegou, no desenho virado para a DIREITA (o de `arte.ts`). */
  impacto: { x: number; y: number };
  chao: number;
  largura: number;
  semChapeu?: boolean;
  aleatorio?: () => number;
}

// ── Montar a queda ─────────────────────────────────────────────────────────

export function criarQueda(e: Entrada): Queda {
  const a = e.aleatorio ?? Math.random;
  const rnd = (de: number, ate: number) => de + a() * (ate - de);
  const esp = e.lado < 0;
  const q = QUADROS[((e.quadro % QUADROS.length) + QUADROS.length) % QUADROS.length];
  /** Pixel do sprite → mundo (o centro do pixel). */
  const mundo = (sx: number, sy: number) => ({ x: e.x + (esp ? LARGURA - (sx + 0.5) : sx + 0.5), y: e.y + sy + 0.5 });

  const m: Queda = {
    t: 0, morte: e.morte, pontos: [], varas: [], ossos: [], soltos: [], gotas: [], pocas: [],
    manchas: new Map(), novas: [], jorros: [], eventos: [], chao: e.chao, largura: e.largura,
    espatifou: false, debate: false, flash: null, explodir: null, aleatorio: a, quieta: false, calmaria: 0,
    fofa: !!e.bruxa.fofa, tonta: false, finalizada: false, apagarOlhos: null,
  };
  const juntas = juntasDa(e.bruxa);

  // O clarão: a bruxa inteira, branca, por um instante.
  const inteira = recortar(montarQuadro(e.bruxa, q, { semChapeu: e.semChapeu }), esp);
  if (inteira) {
    const branco = new Uint32Array(inteira.px.length);
    inteira.px.forEach((c, i) => { if (c) branco[i] = BRANCO; });
    m.flash = { rec: { ...inteira, px: branco, id: ids++ }, x: e.x + inteira.x0, y: e.y + inteira.y0 };
  }

  // As juntas, deslocadas como estavam no quadro (quem monta afunda um pixel).
  const deslocaDa = (j: Junta): readonly [number, number] => {
    const parte: NomeParte = j === 'cabeca' ? 'cabeca'
      : j === 'pescoco' || j === 'quadril' ? 'tronco'
        : j.startsWith('ombro') || j.startsWith('mao') ? (j.endsWith('F') ? 'bracoFrente' : 'bracoTras')
          : (j.endsWith('F') ? 'pernaFrente' : 'pernaTras');
    return q.desloca[parte] ?? [0, 0];
  };
  for (const n of NOMES_JUNTAS) {
    const [jx, jy] = juntas[n];
    const [dx, dy] = deslocaDa(n);
    const p = mundo(jx + dx, jy + dy);
    // Velocidade inicial = a do voo (Verlet guarda o ponto anterior).
    m.pontos.push({ x: p.x, y: p.y, ax: p.x - e.vx * PASSO, ay: p.y - e.vy * PASSO, vivo: true });
  }
  for (const [na, nb, rig] of VARAS) {
    const pa = m.pontos[J[na]], pb = m.pontos[J[nb]];
    m.varas.push({ a: J[na], b: J[nb], len: Math.hypot(pb.x - pa.x, pb.y - pa.y), rigidez: rig, viva: true });
  }

  // Os enfeites que se soltam: todos os que têm `solta`.
  const soltos = e.bruxa.enfeites.filter(en => en.solta && !(en.parte === 'chapeu' && e.semChapeu));
  const semEles = (en: Enfeite) => soltos.includes(en);

  // Os ossos: cada peça recortada do sprite, presa à junta de onde ela sai.
  for (const o of OSSOS) {
    const img = montarQuadro(e.bruxa, q, { quais: p => o.partes.includes(p), semChapeu: true, sem: semEles });
    const rec = recortar(img, esp);
    if (!rec) continue;
    const pa = m.pontos[J[o.de]], pb = m.pontos[J[o.para]];
    m.ossos.push({
      nome: o.nome, rec, de: J[o.de], para: J[o.para],
      ax: pa.x - e.x - rec.x0, ay: pa.y - e.y - rec.y0,
      ang0: Math.atan2(pb.y - pa.y, pb.x - pa.x), vivo: true,
    });
  }
  if (m.fofa) {
    m.apagarOlhos = () => {
      const cab = m.ossos.find(o => o.nome === 'cabeca');
      const def = OSSOS.find(o => o.nome === 'cabeca');
      if (!cab || !def) return;
      const rec = recortar(montarQuadro(e.bruxa, q, { quais: p => def.partes.includes(p), semChapeu: true, sem: semEles, morta: true }), esp);
      // Só troca se o recorte cai no mesmo lugar (o olho muda de cor, não de forma).
      if (rec && rec.x0 === cab.rec.x0 && rec.y0 === cab.rec.y0 && rec.w === cab.rec.w && rec.h === cab.rec.h) cab.rec = rec;
    };
  }

  // A vassoura: um corpo rígido só, a vara com a palha.
  const vassoura = recortar(montarQuadro(e.bruxa, q, { quais: p => p === 'vassoura' || p === 'palha', sem: semEles }), esp);
  // O chapéu.
  const chapeu = e.semChapeu ? null : recortar(montarQuadro(e.bruxa, q, { quais: p => p === 'chapeu', sem: semEles }), esp);
  const novoSolto = (rec: Recorte, extra: Partial<Solto>): Solto => ({
    rec, cx: e.x + rec.x0 + rec.w / 2, cy: e.y + rec.y0 + rec.h / 2,
    vx: e.vx, vy: e.vy, ang: 0, va: 0, jeito: 'cai', modo: 'voa',
    chao: e.chao + Math.round(rnd(-2, 3)), fase: rnd(0, Math.PI * 2), ...extra,
  });
  const imp = mundo(e.impacto.x, e.impacto.y);
  /** Para longe do tiro, no eixo x. */
  const longe = (x: number) => (x >= imp.x ? 1 : -1);

  m.explodir = () => {
    // O chapéu sempre voa: sobe girando e desce planando.
    if (chapeu) {
      m.soltos.push(novoSolto(chapeu, {
        jeito: 'chapeu', vx: e.vx * 0.3 + rnd(-40, 40), vy: rnd(-120, -90), va: rnd(-10, 10),
      }));
    }
    for (const en of soltos) {
      const r = recortar(montarEnfeite(e.bruxa, e.quadro, en), esp);
      if (!r) continue;
      const jeito = en.solta!;
      const base = novoSolto(r, { jeito, cor: cor32(e.bruxa.paleta.x ?? '#3aff6a') });
      const sx = longe(base.cx);
      const impulso: Record<Solta, Partial<Solto>> = {
        cai: { vx: e.vx * 0.5 + sx * rnd(30, 70), vy: rnd(-220, -160), va: rnd(-14, 14) },
        plana: { vx: e.vx * 0.3 + sx * rnd(15, 40), vy: rnd(-140, -90) },
        quebra: { vx: e.vx * 0.6 + sx * rnd(10, 30), vy: rnd(-120, -60), va: rnd(-8, 8) },
        gato: { vx: -e.lado * rnd(50, 80), vy: rnd(-230, -190), pulos: 6 },
      };
      m.soltos.push({ ...base, ...impulso[jeito] });
      if (jeito === 'gato') m.eventos.push({ tipo: 'miau' });
    }
    if (e.bruxa.papeis) {
      const boleto = deMiniatura(BOLETO);
      for (let i = 0; i < 7; i++) {
        const t = m.pontos[J.quadril];
        m.soltos.push({
          rec: boleto, cx: t.x, cy: t.y - 4, vx: e.vx * 0.4 + rnd(-90, 90), vy: rnd(-220, -110),
          ang: 0, va: 0, jeito: 'papel', modo: 'voa', chao: e.chao + Math.round(rnd(-2, 3)), fase: rnd(0, 7),
        });
      }
    }

    if (m.fofa) {
      // Fofo: estrelinhas no lugar do sangue, e o tranco do tiro. Nada estoura.
      for (let i = 0; i < 26; i++) {
        const ang = a() * Math.PI * 2, vel = rnd(50, 150);
        m.gotas.push({ ...gota(m, imp.x, imp.y, Math.cos(ang) * vel, Math.sin(ang) * vel - 40, ESTRELINHAS[i % ESTRELINHAS.length], i % 4 ? 1 : 2, false), some: true });
      }
      m.eventos.push({ tipo: 'bonk' });
      if (e.morte === 'cabeca') empurrar(m, ['cabeca', 'pescoco'], -e.lado * 90, -50);
      else if (e.morte === 'corpo') empurrar(m, ['pescoco', 'ombroF', 'ombroT', 'quadril'], -e.lado * 70, -60);
      else {
        m.debate = true;
        empurrar(m, NOMES_JUNTAS, 0, -70);
      }
    } else if (e.morte === 'cabeca') {
      // A cabeça estoura: cada pixel dela vira um pedaço.
      const cab = m.ossos.find(o => o.nome === 'cabeca');
      if (cab) {
        cab.vivo = false;
        estourar(m, cab, imp.x, imp.y, 0.85, 50, 190);
        m.pontos[J.cabeca].vivo = false;
      }
      espirrar(m, imp.x, imp.y, 50, 50, 170, 0);
      for (let i = 0; i < 12; i++) m.gotas.push(gota(m, imp.x, imp.y, rnd(-90, 90), rnd(-200, -60), MIOLO[i % 2], 2, false));
      for (let i = 0; i < 5; i++) m.gotas.push(gota(m, imp.x, imp.y, rnd(-100, 100), rnd(-190, -60), OSSO, 1, false));
      m.eventos.push({ tipo: 'cerebro' });
      // O pescoço jorra para cima (do quadril para o pescoço), enquanto ela cai.
      m.jorros.push({
        de: () => {
          const p = m.pontos[J.pescoco], b = m.pontos[J.quadril];
          const dx = p.x - b.x, dy = p.y - b.y, n = Math.hypot(dx, dy) || 1;
          return { x: p.x, y: p.y, dx: dx / n, dy: dy / n };
        },
        ate: 1.9, taxa: 80, sobra: 0,
      });
      // Um tranco para trás, pouco: ela estava indo para a frente.
      empurrar(m, ['pescoco', 'ombroF', 'ombroT'], -e.lado * 40, -30);
    } else if (e.morte === 'corpo') {
      // O furo no peito: espirra para o lado de fora do tiro.
      const sx = -e.lado;
      espirrar(m, imp.x, imp.y, 46, 60, 190, sx);
      const tronco = m.ossos.find(o => o.nome === 'tronco');
      if (tronco) estourarUmPouco(m, tronco, imp.x, imp.y);
      // A ferida: um ponto do tronco, girando com ele.
      const pn = m.pontos[J.pescoco], pq = m.pontos[J.quadril];
      const comp = Math.hypot(pq.x - pn.x, pq.y - pn.y) || 1;
      const ux = (pq.x - pn.x) / comp, uy = (pq.y - pn.y) / comp;
      const ox = imp.x - pn.x, oy = imp.y - pn.y;
      const ao = ox * ux + oy * uy, lat = -ox * uy + oy * ux;
      m.jorros.push({
        de: () => {
          const n = m.pontos[J.pescoco], b = m.pontos[J.quadril];
          const c = Math.hypot(b.x - n.x, b.y - n.y) || 1;
          const vx = (b.x - n.x) / c, vy = (b.y - n.y) / c;
          return { x: n.x + vx * ao - vy * lat, y: n.y + vy * ao + vx * lat, dx: -vy * Math.sign(lat || 1), dy: vx * Math.sign(lat || 1) };
        },
        ate: 1.6, taxa: 55, sobra: 0,
      });
      // O tranco do tiro: empurra o peito, o resto vem atrás.
      empurrar(m, ['pescoco', 'ombroF', 'ombroT'], sx * 70 - e.vx * 0.4, -60);
      empurrar(m, ['maoF', 'maoT'], sx * 30, -90);
    } else {
      // A vassoura partida no ar: ela sobe um tico com o tranco e cai se debatendo.
      m.debate = true;
      m.eventos.push({ tipo: 'grito' });
      empurrar(m, NOMES_JUNTAS, 0, -70);
    }

    // A vassoura: inteira e sem dono, ou em duas metades.
    if (vassoura) {
      const v = novoSolto(vassoura, { jeito: 'vassoura', sustentacao: 0.6, vx: e.vx * 1.1, vy: e.vy - 10, va: rnd(-0.6, 0.6) });
      if (e.morte === 'vassoura') {
        const corte = Math.max(2, Math.min(vassoura.w - 2, Math.round(imp.x - e.x - vassoura.x0)));
        for (const [i, metade] of partir(vassoura, corte).entries()) {
          if (!metade) continue;
          const s = i === 0 ? -1 : 1;
          m.soltos.push({
            ...novoSolto(metade, { jeito: 'pedaco' }),
            vx: e.vx * 0.7 + s * rnd(40, 80), vy: rnd(-170, -110), va: s * rnd(8, 14),
          });
        }
        lascas(m, imp.x, imp.y, 16);
        m.eventos.push({ tipo: 'quebra' });
      } else {
        m.soltos.push(v);
      }
    }
  };
  return m;
}

function gota(m: Queda, x: number, y: number, vx: number, vy: number, cor: number, tam: number, sangue: boolean): Gota {
  // O chão tem fundo: cada gota cai um pouco à frente ou atrás da linha.
  return { x, y, vx, vy, cor, tam, sangue, chao: m.chao + Math.round((m.aleatorio() - 0.4) * 7) };
}

function empurrar(m: Queda, quais: readonly Junta[], vx: number, vy: number): void {
  for (const n of quais) {
    const p = m.pontos[J[n]];
    p.ax -= vx * PASSO;
    p.ay -= vy * PASSO;
  }
}

/** Sangue para todo lado; `lado` puxa o esguicho para a direita (1) ou a esquerda (-1). */
function espirrar(m: Queda, x: number, y: number, n: number, vmin: number, vmax: number, lado: number): void {
  const a = m.aleatorio;
  for (let i = 0; i < n; i++) {
    const ang = a() * Math.PI * 2;
    const v = vmin + a() * (vmax - vmin);
    m.gotas.push(gota(m, x, y, Math.cos(ang) * v + lado * 90, Math.sin(ang) * v - 70, SANGUE[i % SANGUE.length], a() < 0.25 ? 2 : 1, true));
  }
}

function lascas(m: Queda, x: number, y: number, n: number): void {
  const a = m.aleatorio;
  for (let i = 0; i < n; i++) m.gotas.push(gota(m, x, y, (a() - 0.5) * 220, -60 - a() * 150, LASCA[i % LASCA.length], 1, false));
}

/** Pixel de um osso no mundo (com o giro de agora). */
function pixelNoMundo(m: Queda, o: Osso, i: number, j: number): { x: number; y: number } {
  const p = m.pontos[o.de], b = m.pontos[o.para];
  const giro = quantizar(Math.atan2(b.y - p.y, b.x - p.x) - o.ang0);
  const c = Math.cos(giro), s = Math.sin(giro);
  const dx = i + 0.5 - o.ax, dy = j + 0.5 - o.ay;
  return { x: p.x + c * dx - s * dy, y: p.y + s * dx + c * dy };
}

/** O osso inteiro vira pedaços que voam do tiro para fora. */
function estourar(m: Queda, o: Osso, ix: number, iy: number, fica: number, vmin: number, vmax: number): void {
  const a = m.aleatorio;
  for (let j = 0; j < o.rec.h; j++) for (let i = 0; i < o.rec.w; i++) {
    const c = o.rec.px[j * o.rec.w + i];
    if (!c || a() > fica) continue;
    const { x, y } = pixelNoMundo(m, o, i, j);
    let dx = x - ix, dy = y - iy;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n; dy /= n;
    const v = vmin + a() * (vmax - vmin);
    m.gotas.push(gota(m, x, y, dx * v + (a() - 0.5) * 50, dy * v - 60 - a() * 80, c, a() < 0.15 ? 2 : 1, false));
  }
}

/** O buraco do tiro no corpo: os pixels em volta do impacto saem voando. */
function estourarUmPouco(m: Queda, o: Osso, ix: number, iy: number): void {
  const a = m.aleatorio;
  let buracos = 0;
  for (let j = 0; j < o.rec.h; j++) for (let i = 0; i < o.rec.w; i++) {
    const c = o.rec.px[j * o.rec.w + i];
    if (!c) continue;
    const { x, y } = pixelNoMundo(m, o, i, j);
    const d = Math.hypot(x - ix, y - iy);
    if (d > 2.2) continue;
    // O furo fica: o pixel do meio vira sangue, o resto voa.
    o.rec.px[j * o.rec.w + i] = d < 1.2 ? SANGUE_ESCURO : SANGUE_VIVO;
    if (buracos++ < 10) m.gotas.push(gota(m, x, y, (a() - 0.5) * 160, -80 - a() * 100, c, 1, false));
  }
}

// ── O tempo passa ──────────────────────────────────────────────────────────

export function avancar(m: Queda, dt: number): void {
  let resto = Math.min(dt, 0.1);
  while (resto > 1e-6) {
    const h = Math.min(PASSO, resto);
    passo(m, h);
    resto -= h;
  }
}

function passo(m: Queda, dt: number): void {
  const antes = m.t;
  m.t += dt;
  if (antes < FLASH_S && m.t >= FLASH_S && m.explodir) {
    const ex = m.explodir;
    m.explodir = null;
    ex();
  }
  if (m.t < FLASH_S) return;
  moverBoneco(m, dt);
  for (const s of m.soltos) moverSolto(m, s, dt);
  m.soltos = m.soltos.filter(s => s.modo !== 'foi');
  for (const j of m.jorros) jorrar(m, j, dt);
  m.jorros = m.jorros.filter(j => j.ate > m.t);
  for (const g of m.gotas) moverGota(m, g, dt);
  m.gotas = m.gotas.filter(g => !g.fim && g.x > -10 && g.x < m.largura + 10);
  for (const p of m.pocas) p.r += (p.max - p.r) * Math.min(1, 1.2 * dt);

  // Quieta: nada voa, nenhuma poça crescendo. Quem desenha para de simular.
  const mexe = m.gotas.length > 0 || m.jorros.length > 0 || m.soltos.some(s => s.modo === 'voa')
    || m.pocas.some(p => p.max - p.r > 0.3) || !m.espatifou;
  m.calmaria = mexe ? 0 : m.calmaria + dt;
  m.quieta = m.calmaria > 0.6 && velocidadeDoBoneco(m) < 4;
}

function velocidadeDoBoneco(m: Queda): number {
  let v = 0;
  for (const p of m.pontos) if (p.vivo) v = Math.max(v, Math.hypot(p.x - p.ax, p.y - p.ay) / PASSO);
  return v;
}

function moverBoneco(m: Queda, dt: number): void {
  const ar = m.espatifou ? 0.96 : 0.998;
  // Se debatendo: as mãos e os pés levam trancos ao acaso enquanto ela cai.
  if (m.debate && !m.espatifou && Math.floor(m.t * 9) !== Math.floor((m.t - dt) * 9)) {
    for (const n of ['maoF', 'maoT', 'peF', 'peT'] as const) {
      const p = m.pontos[J[n]];
      p.ax -= (m.aleatorio() - 0.5) * 260 * PASSO;
      p.ay -= (m.aleatorio() - 0.6) * 260 * PASSO;
    }
  }
  let maisRapido = 0;
  for (const p of m.pontos) {
    if (!p.vivo) continue;
    const vx = (p.x - p.ax) * ar, vy = (p.y - p.ay) * ar;
    p.ax = p.x; p.ay = p.y;
    p.x += vx;
    p.y += vy + GRAVIDADE * dt * dt;
  }
  for (let k = 0; k < 6; k++) {
    for (const v of m.varas) {
      if (!v.viva) continue;
      const a = m.pontos[v.a], b = m.pontos[v.b];
      if (!a.vivo || !b.vivo) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const corr = ((d - v.len) / d) * 0.5 * v.rigidez;
      a.x += dx * corr; a.y += dy * corr;
      b.x -= dx * corr; b.y -= dy * corr;
    }
    // O chão (só a posição; a velocidade se acerta uma vez, abaixo).
    for (const p of m.pontos) {
      if (!p.vivo || p.y <= m.chao - RAIO) continue;
      if (k === 0) maisRapido = Math.max(maisRapido, (p.y - p.ay) / dt);
      p.y = m.chao - RAIO;
    }
  }
  for (const p of m.pontos) {
    if (!p.vivo || p.y < m.chao - RAIO - 0.1) continue;
    // Atrito: no chão, quase não desliza. E quica pouco.
    p.ax = p.x - (p.x - p.ax) * 0.55;
    if (p.ay < p.y) p.ay = p.y + (p.y - p.ay) * 0.12;
  }
  // Bateu forte (de pé ou de costas), ou o tronco chegou ao chão: espatifa.
  // Caindo de baixa altura, espatifa fraco — mas sempre suja o chão.
  if (!m.espatifou && (maisRapido > ESPATIFA || encostou(m))) espatifar(m, Math.max(maisRapido, 60));
}

/** O tronco (pescoço ou quadril) tocou o chão: é aí que espatifa. */
function encostou(m: Queda): boolean {
  return [J.pescoco, J.quadril, J.cabeca].some(i => m.pontos[i].vivo && m.pontos[i].y >= m.chao - RAIO - 0.1);
}

function espatifar(m: Queda, v: number): void {
  m.espatifou = true;
  const forca = Math.min(1, v / 320);
  const p = m.pontos[J.quadril], n = m.pontos[J.pescoco];
  const x = (p.x + n.x) / 2;
  if (m.fofa) {
    // Desacordado: uma nuvenzinha de poeira que não suja o chão, e as estrelinhas.
    m.eventos.push({ tipo: 'desmaia', forca });
    for (let i = 0; i < 18; i++) {
      const ang = Math.PI + m.aleatorio() * Math.PI, vel = 25 + m.aleatorio() * 70;
      m.gotas.push({ ...gota(m, x + (m.aleatorio() - 0.5) * 12, m.chao - 2, Math.cos(ang) * vel, Math.sin(ang) * vel * 0.6, POEIRA[i % POEIRA.length], 1, false), some: true });
    }
    m.tonta = true;
    return;
  }
  m.eventos.push({ tipo: 'espatifa', forca });
  const a = m.aleatorio;
  // O respingo: um leque baixo e largo, que suja o chão longe.
  const quantas = Math.round(40 + 50 * forca);
  for (let i = 0; i < quantas; i++) {
    const ang = Math.PI + a() * Math.PI;
    const vel = 50 + a() * (120 + 140 * forca);
    m.gotas.push(gota(m, x + (a() - 0.5) * 10, m.chao - 2, Math.cos(ang) * vel * 1.6, Math.sin(ang) * vel * 0.7, SANGUE[i % SANGUE.length], a() < 0.3 ? 2 : 1, true));
  }
  m.pocas.push({ cx: Math.round(x), cy: m.chao, r: 2, max: Math.round(12 + 10 * forca), cor: SANGUE_VIVO, borda: SANGUE_ESCURO });
  // O corpo sangra para a poça por um tempo.
  m.jorros.push({ de: () => ({ x: m.pontos[J.quadril].x, y: m.chao - 2, dx: 0, dy: -0.3 }), ate: m.t + 1.2, taxa: 25, sobra: 0 });
  // Bateu forte: às vezes um braço se solta.
  if (forca > 0.55 && a() < 0.45) {
    const nome = a() < 0.5 ? 'bracoF' : 'bracoT';
    for (const iv of MEMBROS[nome]) m.varas[iv].viva = false;
    const mao = m.pontos[J[nome === 'bracoF' ? 'maoF' : 'maoT']];
    mao.ax = mao.x - (a() - 0.5) * 3; mao.ay = mao.y + 2.2;
  }
}

// ── O fofo desacordado: finalizar ─────────────────────────────────────────

/**
 * Onde está quem desmaiou (px da arte), com folga para o clique: o retângulo
 * das juntas. `null` se não há desacordado para finalizar.
 */
export function caixaDoCorpo(m: Queda): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!m.tonta || m.finalizada) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of m.pontos) {
    if (!p.vivo) continue;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  if (x0 === Infinity) return null;
  const folga = RAIO + 3;
  // Em cima, folga a mais: as estrelinhas rodam sobre a cabeça.
  return { x0: x0 - folga, y0: y0 - folga - 6, x1: x1 + folga, y1: Math.min(m.chao + 2, y1 + folga) };
}

/**
 * O segundo tiro, em quem caiu desacordado (Cleber, 14/10/2026): o fofo, que
 * não morria, agora morre — as estrelinhas param, o olho apaga e, aí sim,
 * sangra no chão. Devolve `false` se não havia o que finalizar.
 */
export function finalizar(m: Queda, x: number, y: number): boolean {
  if (!m.tonta || m.finalizada) return false;
  m.finalizada = true;
  m.tonta = false;
  m.calmaria = 0;
  m.quieta = false;
  m.apagarOlhos?.();
  // A junta mais perto do tiro leva o tranco e passa a sangrar.
  let perto = J.quadril, d = Infinity;
  m.pontos.forEach((p, i) => {
    if (!p.vivo) return;
    const dd = Math.hypot(p.x - x, p.y - y);
    if (dd < d) { d = dd; perto = i; }
  });
  espirrar(m, x, y, 42, 50, 170, 0);
  const alvo = m.pontos[perto];
  alvo.ay -= 120 * PASSO;
  m.jorros.push({ de: () => ({ x: alvo.x, y: alvo.y - 1, dx: 0, dy: -1 }), ate: m.t + 1.2, taxa: 45, sobra: 0 });
  m.pocas.push({ cx: Math.round(alvo.x), cy: m.chao, r: 2, max: 16, cor: SANGUE_VIVO, borda: SANGUE_ESCURO });
  m.eventos.push({ tipo: 'cerebro' });
  return true;
}

function jorrar(m: Queda, j: Jorro, dt: number): void {
  const de = j.de();
  if (!de) return;
  // Forte no começo, pingando no fim.
  const resta = Math.max(0, Math.min(1, (j.ate - m.t) / 1.2));
  j.sobra += j.taxa * (0.25 + 0.75 * resta) * dt;
  while (j.sobra >= 1) {
    j.sobra -= 1;
    const v = (60 + m.aleatorio() * 90) * (0.4 + 0.6 * resta);
    m.gotas.push(gota(
      m, de.x, de.y,
      de.dx * v + (m.aleatorio() - 0.5) * 45, de.dy * v + (m.aleatorio() - 0.5) * 30,
      SANGUE[Math.floor(m.aleatorio() * SANGUE.length)], 1, true,
    ));
  }
}

function moverGota(m: Queda, g: Gota, dt: number): void {
  g.vy += GRAVIDADE * dt;
  g.vx *= 1 - 0.5 * dt;
  g.x += g.vx * dt;
  g.y += g.vy * dt;
  if (g.y + g.tam - 1 < g.chao) return;
  if (g.some) { g.fim = true; return; }
  if (!g.sangue && g.vy > 90) {
    // Pedaço quica uma vez antes de assentar.
    g.y = g.chao - g.tam + 1;
    g.vy = -g.vy * 0.3;
    g.vx *= 0.5;
    return;
  }
  for (let j = 0; j < g.tam; j++) for (let i = 0; i < g.tam; i++) manchar(m, Math.round(g.x) + i, g.chao - j, g.sangue ? (m.aleatorio() < 0.5 ? SANGUE_ESCURO : SANGUE_VIVO) : g.cor);
  // A gota grande respinga para o lado.
  if (g.sangue && (g.tam > 1 || m.aleatorio() < 0.3)) manchar(m, Math.round(g.x) + (m.aleatorio() < 0.5 ? -1 : 1), g.chao, SANGUE_ESCURO);
  g.fim = true;
}

function manchar(m: Queda, x: number, y: number, cor: number): void {
  if (x < 0 || y < 0 || x >= m.largura) return;
  const k = y * 4096 + x;
  m.manchas.set(k, cor);
  m.novas.push(k);
}

// ── As peças rígidas ───────────────────────────────────────────────────────

export function quantizar(a: number): number {
  return Math.round(a / PASSO_ANGULO) * PASSO_ANGULO;
}

/** Meia-altura da peça girada: quanto dela fica abaixo do centro. */
function meiaAltura(s: Solto): number {
  const q = quantizar(s.ang);
  return Math.abs((s.rec.w / 2) * Math.sin(q)) + Math.abs((s.rec.h / 2) * Math.cos(q));
}

function moverSolto(m: Queda, s: Solto, dt: number): void {
  if (s.modo !== 'voa') return;
  if (s.jeito === 'chapeu' || s.jeito === 'plana' || s.jeito === 'papel') {
    // Sobe com o tranco e desce devagar, balançando de um lado para o outro.
    const leve = s.jeito === 'papel' ? 0.16 : 0.22;
    s.vy = Math.min(s.vy + GRAVIDADE * leve * dt, s.jeito === 'papel' ? 40 : 90);
    s.vx += Math.sin(m.t * 6 + s.fase) * 150 * dt;
    s.vx *= 1 - Math.min(1, 2.2 * dt);
    s.ang = Math.sin(m.t * 5 + s.fase) * 0.45;
  } else {
    let g = GRAVIDADE;
    if (s.sustentacao && s.sustentacao > 0) {
      // A vassoura sem ninguém ainda plana um pouco, e embica.
      s.sustentacao -= dt;
      g *= 0.35;
      s.va += (s.vx >= 0 ? 1 : -1) * 1.4 * dt;
    }
    s.vy += g * dt;
    s.ang += s.va * dt;
  }
  s.cx += s.vx * dt;
  s.cy += s.vy * dt;
  if (s.cx < -60 || s.cx > m.largura + 60) { s.modo = 'foi'; return; }

  const hh = meiaAltura(s);
  if (s.cy + hh < s.chao) return;
  s.cy = s.chao - hh;

  const forte = s.vy;
  if (s.jeito === 'quebra') {
    s.modo = 'foi';
    m.eventos.push({ tipo: 'vidro' });
    m.pocas.push({ cx: Math.round(s.cx), cy: s.chao, r: 1, max: 7, cor: s.cor ?? SANGUE_VIVO, borda: s.cor ?? SANGUE_ESCURO });
    for (let i = 0; i < 10; i++) m.gotas.push(gota(m, s.cx, s.chao - 1, (m.aleatorio() - 0.5) * 140, -40 - m.aleatorio() * 90, i < 6 ? VIDRO[i % 2] : (s.cor ?? BRANCO), 1, false));
    return;
  }
  if (s.jeito === 'gato') { pularGato(m, s); return; }
  if (s.jeito === 'vassoura' && forte > 140 && m.aleatorio() < CHANCE_DE_QUEBRAR) {
    quebrarVassoura(m, s);
    return;
  }
  if (s.jeito === 'chapeu' || s.jeito === 'plana' || s.jeito === 'papel') { assentar(s); return; }
  if (Math.abs(s.vy) > 60) {
    m.eventos.push({ tipo: 'baque', forca: Math.min(1, Math.abs(s.vy) / 320) });
    s.vy = -s.vy * 0.3;
    s.vx *= 0.65;
    s.va = s.vx / Math.max(2, hh) * 0.5;
    return;
  }
  // Deslizando: o atrito freia.
  s.vy = 0;
  s.vx *= 1 - Math.min(1, 3.5 * dt);
  s.va *= 1 - Math.min(1, 4 * dt);
  if (Math.abs(s.vx) < 6) assentar(s);
}

/** Parou: deita num ângulo reto (comprida de lado, nunca em pé). */
function assentar(s: Solto): void {
  s.modo = 'parada';
  s.vx = 0; s.vy = 0; s.va = 0;
  // Vassoura e pedaço dela deitam sempre: vassoura em pé no chão é coisa de bruxa viva.
  const comprida = s.jeito === 'vassoura' || s.jeito === 'pedaco' || s.rec.w > s.rec.h * 1.6 || s.rec.h > s.rec.w * 1.6;
  const reto = comprida ? Math.PI : Math.PI / 2;
  s.ang = Math.round(s.ang / reto) * reto;
  s.cy = s.chao - meiaAltura(s);
}

/** A vassoura bateu de mau jeito: parte em duas, solta lascas. */
function quebrarVassoura(m: Queda, s: Solto): void {
  s.modo = 'foi';
  m.eventos.push({ tipo: 'quebra' });
  const corte = Math.round(s.rec.w * (0.45 + m.aleatorio() * 0.2));
  const [esq, dir] = partir(s.rec, corte);
  const c = Math.cos(quantizar(s.ang)), sn = Math.sin(quantizar(s.ang));
  for (const [i, metade] of [esq, dir].entries()) {
    if (!metade) continue;
    const lado = i === 0 ? -1 : 1;
    // O centro da metade, girado como a vassoura estava.
    const lx = metade.x0 - s.rec.x0 + metade.w / 2 - s.rec.w / 2;
    m.soltos.push({
      rec: metade, cx: s.cx + c * lx, cy: s.cy + sn * lx - 2,
      vx: s.vx * 0.4 + lado * (30 + m.aleatorio() * 40), vy: -90 - m.aleatorio() * 60,
      ang: s.ang, va: lado * (6 + m.aleatorio() * 6), jeito: 'pedaco', modo: 'voa', chao: s.chao, fase: 0,
    });
  }
  const x = s.cx + c * (corte - s.rec.w / 2);
  lascas(m, x, s.chao - 2, 14);
}

/** O gato: cai de pé (gato sempre cai de pé) e foge aos pulos. */
function pularGato(m: Queda, s: Solto): void {
  s.ang = 0; s.va = 0;
  const restam = (s.pulos ?? 0) - 1;
  s.pulos = restam;
  if (restam < 0) { s.modo = 'parada'; s.vx = 0; s.vy = 0; return; }
  // Para o lado de onde está mais perto da borda: some da tela mais rápido.
  const lado = s.vx === 0 ? (s.cx < m.largura / 2 ? -1 : 1) : Math.sign(s.vx);
  s.vx = lado * (110 + m.aleatorio() * 30);
  s.vy = -(120 + m.aleatorio() * 40);
}

// ── O chapéu que o tiro levou ──────────────────────────────────────────────

/**
 * Tiro no chapéu NÃO mata (09/10/2026): o chapéu voa, furado, e ela fica
 * brava. Vira uma queda só com ele (sem boneco), para cair do mesmo jeito.
 */
export function chapeuVoando(e: Omit<Entrada, 'morte'>): Queda {
  const a = e.aleatorio ?? Math.random;
  const esp = e.lado < 0;
  const m: Queda = {
    t: FLASH_S, morte: 'corpo', pontos: [], varas: [], ossos: [], soltos: [], gotas: [], pocas: [],
    manchas: new Map(), novas: [], jorros: [], eventos: [], chao: e.chao, largura: e.largura,
    espatifou: true, debate: false, flash: null, explodir: null, aleatorio: a, quieta: false, calmaria: 0,
    fofa: !!e.bruxa.fofa, tonta: false, finalizada: false, apagarOlhos: null,
  };
  const rec = recortar(montarQuadro(e.bruxa, e.quadro, { quais: p => p === 'chapeu' }), esp);
  if (!rec) return m;
  // O furo da bala: um buraco com a borda escura.
  const ix = Math.round((esp ? LARGURA - 1 - e.impacto.x : e.impacto.x) - rec.x0), iy = Math.round(e.impacto.y - rec.y0);
  const BORDA = cor32('#170f1f');
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const x = ix + i, y = iy + j;
    if (x < 0 || y < 0 || x >= rec.w || y >= rec.h || !rec.px[y * rec.w + x]) continue;
    rec.px[y * rec.w + x] = i === 0 && j === 0 ? 0 : BORDA;
  }
  m.soltos.push({
    rec, cx: e.x + rec.x0 + rec.w / 2, cy: e.y + rec.y0 + rec.h / 2,
    vx: e.vx * 0.4 + (a() - 0.5) * 60, vy: -100 - a() * 30, ang: 0, va: 0,
    jeito: 'chapeu', modo: 'voa', chao: e.chao + Math.round(a() * 3), fase: a() * 7,
  });
  return m;
}

// ── Para quem desenha ──────────────────────────────────────────────────────

/** O giro e o ponto de cada osso, agora. */
export function poseDoOsso(m: Queda, o: Osso): { x: number; y: number; giro: number } {
  const p = m.pontos[o.de], b = m.pontos[o.para];
  return { x: p.x, y: p.y, giro: quantizar(Math.atan2(b.y - p.y, b.x - p.x) - o.ang0) };
}

/** Onde está a cabeça (para as estrelinhas de quem desmaiou). */
export function cabecaDaQueda(m: Queda): { x: number; y: number } | null {
  const p = m.pontos[J.cabeca];
  return p && p.vivo ? { x: p.x, y: p.y } : null;
}

export function gotasNoAr(m: Queda): readonly Gota[] {
  return m.gotas;
}

export const CORES_DA_POCA = { brilho: SANGUE_BRILHO };

/** Para os testes e para o ensaio: a altura de onde o sprite parte. */
export const TAMANHO = { largura: LARGURA, altura: ALTURA };
