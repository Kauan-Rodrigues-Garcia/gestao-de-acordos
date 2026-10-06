/**
 * Gotham Square, como na cena do filme: vista da rua para cima, prédios altos
 * de pedra escura sumindo na névoa, a torre do meio com «GOTHAM EMPIRE» em
 * neon no alto, janelas acesas e os telões presos às fachadas.
 *
 * Tudo é posto a partir da geometria dos prédios (`PREDIOS`): os nomes no topo
 * medem a largura do topo; os letreiros verticais encostam na quina de um
 * prédio, com suporte; os telões ficam na face da torre e do prédio baixo, com
 * moldura de metal — e as imagens deles são recortes dos telões da própria cena
 * do filme (`teloes/`). Alguns passam cenas do próprio filme em 8 bits, como
 * um gif (`cenas8bit/`: quadros da abertura, reduzidos a 64 × 27 pixels e 24
 * cores, desenhados sem suavizar). No alto do prédio baixo corre um letreiro
 * de notícias.
 *
 * Três camadas: a cidade (pintada uma vez, quando a tela muda de tamanho), os
 * telões (pintados quando as imagens chegam) — as duas em etapas, um pedaço por
 * quadro, para não congelar a página na entrada — e a de cima, a 30 quadros por
 * segundo: o letreiro corrido, as lâmpadas da marquise e o neon dos letreiros.
 * Na cidade fica o tubo apagado; o neon aceso (letra e halo) é um desenho à
 * parte, posto por cima a cada quadro — quando o letreiro falha ele some e o
 * tubo apagado aparece, como neon de verdade (antes era um retângulo escuro
 * por cima, e o halo ficava aceso em volta dele). Falham mais conforme a música
 * avança (`piscar`, de 0 a 1). As luzes saem daqui para acender a chuva.
 */
import { useEffect, useRef } from 'react';
import type { Luz } from './chuva';
import cafe from './teloes/cafe.jpg';
import oito from './teloes/oito.jpg';
import garrafa from './teloes/garrafa.jpg';
import morangos from './teloes/morangos.jpg';
import figura from './teloes/figura.jpg';
import praca from './cenas8bit/praca.png';
import multidao from './cenas8bit/multidao.png';
import mascara from './cenas8bit/mascara.png';
import metro from './cenas8bit/metro.png';
import sinal from './cenas8bit/sinal.png';

/** Largura e altura de cada quadro das cenas em 8 bits (a tira tem os quadros lado a lado). */
const QUADRO_W = 64, QUADRO_H = 27;

type RGB = [number, number, number];
/** O neon aceso de um letreiro, desenhado à parte (para ele poder piscar), e onde ele vai. */
type Neon = { x: number; y: number; img: HTMLCanvasElement };
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;

function semeado(semente: number) {
  let x = semente;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

// ── A planta da praça (frações da largura e da altura) ───────────────────────

interface Predio { x: number; w: number; topo: number; coroa?: { recuo: number; topo: number }; cor: string; janelas: number }
const PREDIOS = {
  paredao: { x: 0, w: 0.08, topo: 0, cor: '#020505', janelas: 0 },
  esquerda: { x: 0.17, w: 0.15, topo: 0.12, coroa: { recuo: 0.1, topo: 0.08 }, cor: '#050a0a', janelas: 0.1 },
  baixoEsq: { x: 0.32, w: 0.125, topo: 0.6, cor: '#060b0b', janelas: 0.06 },
  torre: { x: 0.445, w: 0.11, topo: 0.16, cor: '#040808', janelas: 0.07 },
  baixoDir: { x: 0.555, w: 0.135, topo: 0.5, cor: '#070c0c', janelas: 0.12 },
  direita: { x: 0.69, w: 0.16, topo: 0.07, coroa: { recuo: 0.1, topo: 0.03 }, cor: '#050a0a', janelas: 0.1 },
} satisfies Record<string, Predio>;

/**
 * Telão: a imagem, e onde ele fica (centro x, topo y, largura — frações; a
 * altura vem da proporção da imagem). `giro`: inclinado, como o da esquina.
 * `gif`: passa uma cena em 8 bits (`src` é a tira de quadros) a cada `ms`;
 * `prop` é a altura sobre a largura da tela.
 */
interface Telao { src: string; cx: number; y: number; w: number; giro?: number; gif?: { ms: number; prop: number } }
const TELOES: Telao[] = [
  // Na face da torre, de cima para baixo, como na cena.
  { src: cafe, cx: 0.5, y: 0.27, w: 0.074 },
  { src: praca, cx: 0.493, y: 0.37, w: 0.092, gif: { ms: 520, prop: 0.5 } },
  { src: oito, cx: 0.474, y: 0.5, w: 0.045 },
  { src: garrafa, cx: 0.527, y: 0.5, w: 0.05 },
  // No prédio baixo da direita.
  { src: morangos, cx: 0.585, y: 0.6, w: 0.056 },
  { src: figura, cx: 0.648, y: 0.58, w: 0.05 },
  { src: metro, cx: 0.63, y: 0.86, w: 0.07, gif: { ms: 640, prop: 0.45 } },
  // No prédio baixo da esquerda e no da direita.
  { src: multidao, cx: 0.385, y: 0.7, w: 0.075, gif: { ms: 700, prop: 0.48 } },
  { src: mascara, cx: 0.77, y: 0.64, w: 0.072, gif: { ms: 600, prop: 0.5 } },
  // Na esquina da esquerda, inclinado para a praça: o bat-sinal pela persiana.
  { src: sinal, cx: 0.112, y: 0.46, w: 0.07, giro: -0.42, gif: { ms: 560, prop: 0.62 } },
];

/** Um telão já posto na tela, em px. */
type Caixa2 = { x: number; y: number; w: number; h: number; img?: HTMLImageElement; giro: number; gif?: { ms: number; prop: number }; desfase: number };

/** Desenha o quadro `i` de uma cena em 8 bits cobrindo a tela (corta as sobras), sem suavizar. */
function quadroDaCena(cx: CanvasRenderingContext2D, b: Caixa2, i: number) {
  if (!b.img || !b.img.naturalWidth) return;
  const n = Math.max(1, Math.round(b.img.naturalWidth / QUADRO_W));
  const k = ((i % n) + n) % n;
  const alvo = b.h / b.w, fonte = QUADRO_H / QUADRO_W;
  let sx = k * QUADRO_W, sy = 0, sw = QUADRO_W, sh = QUADRO_H;
  if (alvo > fonte) { sw = QUADRO_H / alvo; sx += (QUADRO_W - sw) / 2; } else { sh = QUADRO_W * alvo; sy = (QUADRO_H - sh) / 2; }
  const antes = cx.imageSmoothingEnabled;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(b.img, sx, sy, sw, sh, b.x, b.y, b.w, b.h);
  cx.imageSmoothingEnabled = antes;
}

/** Letreiro vertical encostado na quina de um prédio: de que lado e em que altura. */
interface Lamina { predio: keyof typeof PREDIOS; lado: 'esq' | 'dir'; y: number; texto: string; cor: RGB }
const LAMINAS: Lamina[] = [
  { predio: 'paredao', lado: 'dir', y: 0.2, texto: 'HOTEL', cor: [255, 170, 40] },
  { predio: 'esquerda', lado: 'dir', y: 0.34, texto: 'GOTHAM', cor: [44, 255, 154] },
  { predio: 'esquerda', lado: 'esq', y: 0.72, texto: 'CAFÉ', cor: [255, 90, 31] },
  { predio: 'direita', lado: 'esq', y: 0.26, texto: 'CINEMA', cor: [25, 211, 255] },
  { predio: 'baixoDir', lado: 'dir', y: 0.62, texto: 'BAR', cor: [255, 63, 176] },
];

const NOTICIAS = 'GCN  •  PREFEITO DON MITCHELL JR. É ENCONTRADO MORTO EM CASA  •  POLÍCIA INVESTIGA CARTAS «PARA O BATMAN»  •  CHUVA FORTE ATÉ O FIM DA SEMANA  •  ELEIÇÃO PARA PREFEITO CONTINUA  •  ';

// ── Pintura ──────────────────────────────────────────────────────────────────

/** O tamanho de fonte que faz o texto caber em `largura` (sem passar de `max`). */
function caber(cx: CanvasRenderingContext2D, texto: string, largura: number, max: number, peso = 700) {
  cx.font = `${peso} 100px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  return Math.min(max, (largura / cx.measureText(texto).width) * 100);
}

/** O tubo apagado: a letra escura na cor do neon, sem brilho. */
function tubo(cx: CanvasRenderingContext2D, texto: string, x: number, y: number, tam: number, cor: RGB, espaco = 0) {
  cx.save();
  cx.font = `700 ${tam}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  if (espaco) cx.letterSpacing = `${espaco}px`;
  cx.fillStyle = css([cor[0] * 0.35 | 0, cor[1] * 0.35 | 0, cor[2] * 0.35 | 0], 0.55); cx.fillText(texto, x, y);
  cx.restore();
}

/** Texto em neon: halo largo, corpo da cor e um miolo quase branco. */
function neon(cx: CanvasRenderingContext2D, texto: string, x: number, y: number, tam: number, cor: RGB, espaco = 0) {
  cx.save();
  cx.font = `700 ${tam}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  if (espaco) cx.letterSpacing = `${espaco}px`;
  cx.shadowColor = css(cor, 0.95);
  cx.shadowBlur = tam * 1.1; cx.fillStyle = css(cor, 0.9); cx.fillText(texto, x, y);
  cx.shadowBlur = tam * 0.35; cx.fillStyle = css([Math.min(255, cor[0] + 130), Math.min(255, cor[1] + 130), Math.min(255, cor[2] + 130)]); cx.fillText(texto, x, y);
  cx.restore();
}

function janelas(cx: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, chance: number, esc: number) {
  const pw = 1.6 * esc, ph = 2.4 * esc, gx = 5 * esc, gy = 7 * esc;
  for (let yy = y + gy; yy < y + h - gy; yy += gy) for (let xx = x + gx * 0.6; xx < x + w - gx * 0.6; xx += gx) {
    if (r() > chance) continue;
    const quente = r() < 0.82;
    cx.fillStyle = quente ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 50 | 0},${(0.2 + r() * 0.5).toFixed(2)})` : `rgba(170,215,255,${(0.15 + r() * 0.35).toFixed(2)})`;
    cx.fillRect(xx, yy, pw, ph);
  }
}

/** Uma etapa da montagem: um pedaço do desenho, feito num quadro só (ver `CidadeGotham`). */
type Etapa = () => void;

/**
 * A cidade, em etapas (do fundo para a frente, na ordem em que se pintam): o céu e os
 * prédios ao longe; os prédios da praça; os letreiros apagados, a rua e a névoa; e, um
 * por etapa, o neon aceso de cada letreiro (`aoAcender`; entram na fila por `mais`,
 * depois da etapa que os mede). `luzes` vai sendo preenchido conforme as etapas rodam.
 */
function etapasDaCidade(cv: HTMLCanvasElement, W: number, H: number, aoAcender: (n: Neon) => void, mais: (e: Etapa[]) => void): { etapas: Etapa[]; luzes: Luz[] } {
  const cx = cv.getContext('2d');
  const luzes: Luz[] = [];
  if (!cx) return { etapas: [], luzes };
  const neons: Etapa[] = [];
  /** O neon aceso de um letreiro num desenho à parte (a caixa dele mais a margem do halo): fica para uma etapa própria. */
  const acender = (x: number, y: number, w: number, h: number, margem: number, desenhar: (c: CanvasRenderingContext2D) => void) => {
    neons.push(() => {
      const img = document.createElement('canvas'), x0 = Math.floor(x - margem), y0 = Math.floor(y - margem);
      img.width = Math.ceil(w + 2 * margem); img.height = Math.ceil(h + 2 * margem);
      const c = img.getContext('2d');
      if (!c) return;
      c.translate(-x0, -y0); desenhar(c);
      aoAcender({ x: x0, y: y0, img });
    });
  };
  const r = semeado(1789);
  const esc = Math.max(0.7, Math.min(1.6, W / 1200));
  const t = PREDIOS.torre, tx = t.x * W, tw = t.w * W;

  const ceuEAoLonge: Etapa = () => {
    cx.clearRect(0, 0, W, H);

    // Céu: verde-petróleo quase preto em cima, a névoa esquentando embaixo com o brilho da praça.
    const ceu = cx.createLinearGradient(0, 0, 0, H);
    ceu.addColorStop(0, '#010303'); ceu.addColorStop(0.45, '#050d0c'); ceu.addColorStop(0.8, '#0f1413'); ceu.addColorStop(1, '#1b1712');
    cx.fillStyle = ceu; cx.fillRect(0, 0, W, H);
    const brilho = cx.createRadialGradient(W * 0.5, H * 0.9, 0, W * 0.5, H * 0.9, W * 0.7);
    brilho.addColorStop(0, 'rgba(255,190,130,.16)'); brilho.addColorStop(1, 'rgba(255,190,130,0)');
    cx.fillStyle = brilho; cx.fillRect(0, 0, W, H);

    // Prédios ao longe, apagados pela névoa.
    for (let x = -20; x < W; x += (25 + r() * 50) * esc) {
      const w = (22 + r() * 60) * esc, h = H * (0.25 + r() * 0.4), y = H * 0.84 - h;
      cx.fillStyle = '#0d1716'; cx.fillRect(x, y, w, h);
      janelas(cx, r, x, y, w, h, 0.05, esc * 0.7);
    }
    cx.fillStyle = 'rgba(40,62,58,.2)'; cx.fillRect(0, 0, W, H);
  };

  const predios: Etapa = () => {
    // Os prédios da praça.
    for (const p of Object.values(PREDIOS) as Predio[]) {
      const x = p.x * W, w = p.w * W, y = p.topo * H;
      cx.fillStyle = p.cor;
      cx.fillRect(x, y, w, H - y);
      if (p.coroa) cx.fillRect(x + w * p.coroa.recuo, p.coroa.topo * H, w * (1 - 2 * p.coroa.recuo), H);
      if (p.janelas) janelas(cx, r, x, y, w, H * 0.7, p.janelas, esc);
      // Cornija: uma linha de luz fria na borda de cima (a névoa pegando na pedra).
      cx.fillStyle = 'rgba(120,160,150,.12)'; cx.fillRect(x, y, w, Math.max(1, esc));
    }
    // A torre em degraus.
    cx.fillStyle = t.cor;
    cx.fillRect(tx + tw * 0.14, H * 0.07, tw * 0.72, H); cx.fillRect(tx + tw * 0.3, 0, tw * 0.4, H);
    // As janelas em arco do prédio baixo da direita (o hotel antigo da cena).
    const bd = PREDIOS.baixoDir;
    for (let i = 0; i < 4; i++) {
      const ax = (bd.x + bd.w * (0.18 + i * 0.2)) * W, ay = (bd.topo + 0.055) * H, aw = bd.w * W * 0.1;
      cx.fillStyle = 'rgba(255,214,150,.45)'; cx.fillRect(ax, ay, aw, aw * 1.6);
      cx.beginPath(); cx.arc(ax + aw / 2, ay, aw / 2, Math.PI, 0); cx.fill();
    }
  };

  const letreirosERua: Etapa = () => {
    // Os nomes no alto, medidos para caber no topo de cada prédio.
    const meio = { x: tx + tw / 2, w: tw * 0.72 * 0.86 };
    const tamTorre = caber(cx, 'EMPIRE', meio.w, 30 * esc);
    tubo(cx, 'GOTHAM', meio.x, H * 0.098, tamTorre, [255, 52, 40]);
    tubo(cx, 'EMPIRE', meio.x, H * 0.098 + tamTorre * 1.05, tamTorre, [255, 52, 40]);
    acender(meio.x - meio.w / 2, H * 0.098 - tamTorre * 0.7, meio.w, tamTorre * 2.5, tamTorre * 2.2, c => {
      neon(c, 'GOTHAM', meio.x, H * 0.098, tamTorre, [255, 52, 40]);
      neon(c, 'EMPIRE', meio.x, H * 0.098 + tamTorre * 1.05, tamTorre, [255, 52, 40]);
    });
    luzes.push({ x: meio.x, y: H * 0.11, r: 40 * esc, cor: [255, 60, 40], forca: 0.8 });
    const nomes: [Predio, string, RGB][] = [[PREDIOS.esquerda, 'GAZETA', [255, 40, 50]], [PREDIOS.direita, 'WAYNE', [235, 240, 255]]];
    for (const [p, nome, cor] of nomes) {
      const c = p.coroa!, cw = p.w * W * (1 - 2 * c.recuo), ccx = (p.x + p.w / 2) * W;
      const tam = caber(cx, nome, cw * 0.78, 34 * esc);
      tubo(cx, nome, ccx, c.topo * H + tam * 0.95, tam, cor, tam * 0.08);
      acender(ccx - cw * 0.45, c.topo * H + tam * 0.3, cw * 0.9, tam * 1.4, tam * 2.2, g => neon(g, nome, ccx, c.topo * H + tam * 0.95, tam, cor, tam * 0.08));
      luzes.push({ x: ccx, y: c.topo * H + tam, r: 45 * esc, cor, forca: 0.7 });
    }

    // Letreiros verticais: lâmina encostada na quina, com dois suportes.
    for (const l of LAMINAS) {
      const p = PREDIOS[l.predio] as Predio;
      const t2 = 14 * esc, larg = t2 * 1.7, alt = t2 * (l.texto.length + 0.9);
      const quina = (l.lado === 'dir' ? p.x + p.w : p.x) * W;
      const x = l.lado === 'dir' ? quina + 3 * esc : quina - 3 * esc - larg, y = l.y * H;
      cx.fillStyle = '#1a1d1d';
      for (const sy of [y + alt * 0.15, y + alt * 0.85]) cx.fillRect(Math.min(quina, x), sy, Math.abs(x - quina), 1.5 * esc);
      cx.fillStyle = '#060909'; cx.fillRect(x, y, larg, alt);
      cx.strokeStyle = css(l.cor, 0.5); cx.lineWidth = esc; cx.strokeRect(x + 1.5 * esc, y + 1.5 * esc, larg - 3 * esc, alt - 3 * esc);
      [...l.texto].forEach((ch, i) => tubo(cx, ch, x + larg / 2, y + t2 * (i + 0.95), t2, l.cor));
      acender(x, y, larg, alt, t2 * 2.2, g => [...l.texto].forEach((ch, i) => neon(g, ch, x + larg / 2, y + t2 * (i + 0.95), t2, l.cor)));
      luzes.push({ x: x + larg / 2, y: y + alt / 2, r: 32 * esc, cor: l.cor, forca: 0.6 });
    }

    // Primeiro plano: a rotunda da direita, quase preta, com frisos.
    cx.fillStyle = '#020505';
    cx.beginPath(); cx.moveTo(W * 0.86, H); cx.quadraticCurveTo(W * 0.86, H * 0.42, W * 0.93, H * 0.36); cx.lineTo(W, H * 0.33); cx.lineTo(W, H); cx.closePath(); cx.fill();
    cx.strokeStyle = 'rgba(80,140,130,.18)'; cx.lineWidth = 1.2 * esc;
    for (let i = 0; i < 6; i++) { const y = H * (0.42 + i * 0.09); cx.beginPath(); cx.moveTo(W * 0.88, y); cx.quadraticCurveTo(W * 0.94, y - H * 0.03, W, y - H * 0.04); cx.stroke(); }

    // A rua: faróis e lanternas desfocados lá embaixo (gradiente, não `filter`: blur em canvas é caro).
    for (let i = 0; i < 70 * esc; i++) {
      const x = W * (0.1 + r() * 0.78), y = H * (0.9 + r() * 0.09), vermelho = r() < 0.4, raio = (2 + r() * 3) * esc;
      const g = cx.createRadialGradient(x, y, 0, x, y, raio);
      g.addColorStop(0, vermelho ? 'rgba(255,40,30,.75)' : 'rgba(255,225,160,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
    }
    luzes.push({ x: W * 0.5, y: H * 0.95, r: W * 0.3, cor: [255, 200, 140], forca: 0.45 });

    // Névoa: escurece em cima; embaixo, acesa pelos telões.
    const nevoa = cx.createLinearGradient(0, 0, 0, H);
    nevoa.addColorStop(0, 'rgba(0,4,4,.5)'); nevoa.addColorStop(0.45, 'rgba(60,85,80,.08)'); nevoa.addColorStop(1, 'rgba(255,200,150,.05)');
    cx.fillStyle = nevoa; cx.fillRect(0, 0, W, H);
    const miolo = cx.createRadialGradient(W * 0.53, H * 0.55, 0, W * 0.53, H * 0.55, W * 0.3);
    miolo.addColorStop(0, 'rgba(190,215,205,.13)'); miolo.addColorStop(1, 'rgba(150,180,170,0)');
    cx.fillStyle = miolo; cx.fillRect(0, 0, W, H);
  };

  return { etapas: [ceuEAoLonge, predios, () => { letreirosERua(); mais(neons.splice(0)); }], luzes };
}

/**
 * A cor média de uma imagem (para o brilho na névoa e a luz na chuva), guardada por
 * imagem. Lida num canvas só, fora da placa de vídeo (`willReadFrequently`): ler um
 * pixel de um canvas da placa trava a página esperando por ela — eram ~190 ms na
 * primeira vez que a Dashboard abria o tema.
 */
const coresMedias = new Map<string, RGB>();
let leitor: CanvasRenderingContext2D | null | undefined;
function corMedia(img: HTMLImageElement): RGB {
  if (!img.complete || !img.naturalWidth) return [200, 200, 200];
  const guardada = coresMedias.get(img.src);
  if (guardada) return guardada;
  if (leitor === undefined) {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    leitor = c.getContext('2d', { willReadFrequently: true });
  }
  if (!leitor) return [200, 200, 200];
  leitor.clearRect(0, 0, 1, 1);
  leitor.drawImage(img, 0, 0, 1, 1);
  const d = leitor.getImageData(0, 0, 1, 1).data;
  // Puxa a saturação: a luz de telão na névoa é mais viva que a média da foto.
  const m = (d[0] + d[1] + d[2]) / 3;
  const cor = [d[0], d[1], d[2]].map(v => Math.max(0, Math.min(255, m + (v - m) * 1.6))) as RGB;
  coresMedias.set(img.src, cor);
  return cor;
}

/**
 * Os telões, em etapas: o brilho na névoa; depois, de três em três, moldura de metal, a
 * imagem e as linhas do LED; por fim o monumento na frente — e `fim` recebe as luzes e os
 * que passam cena (desenhados a cada quadro na camada de cima).
 */
function etapasDosTeloes(cv: HTMLCanvasElement, W: number, H: number, imgs: HTMLImageElement[], fim: (r: { luzes: Luz[]; gifs: Caixa2[] }) => void): Etapa[] {
  const cx = cv.getContext('2d');
  if (!cx) return [];
  const esc = Math.max(0.7, Math.min(1.6, W / 1200));
  const luzes: Luz[] = [];
  const caixas = TELOES.map((t, i) => {
    const img = imgs[i], w = t.w * W;
    const h = t.gif ? w * t.gif.prop : img && img.naturalWidth ? (w * img.naturalHeight) / img.naturalWidth : w * 0.7;
    return { x: t.cx * W - w / 2, y: t.y * H, w, h, img, giro: t.giro ?? 0, gif: t.gif, desfase: i * 977, cor: img ? corMedia(img) : [200, 200, 200] as RGB };
  });
  const brilho: Etapa = () => {
    cx.clearRect(0, 0, W, H);
    // O brilho que eles jogam na névoa (o dos gifs vem do primeiro quadro). Sem `filter: blur`
    // (em canvas é caríssimo: travava a montagem por segundos): pinta numa miniatura de 1/8,
    // reduz de novo para 1/32 e amplia as duas suavizadas — reduzir e ampliar em passos dá um
    // desfoque redondo, praticamente de graça.
    const miniatura = (escala: number) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W / escala)); c.height = Math.max(1, Math.round(H / escala));
      return c;
  };
  const m8 = miniatura(8), m32 = miniatura(32), x8 = m8.getContext('2d'), x32 = m32.getContext('2d');
  if (x8 && x32) {
    x8.scale(1 / 8, 1 / 8);
    for (const b of caixas) {
      if (!b.img) continue;
      if (b.gif) quadroDaCena(x8, { ...b, x: b.x - b.w * 0.25, y: b.y - b.h * 0.25, w: b.w * 1.5, h: b.h * 1.5 }, 0);
      else x8.drawImage(b.img, b.x - b.w * 0.25, b.y - b.h * 0.25, b.w * 1.5, b.h * 1.5);
    }
    x32.imageSmoothingQuality = 'high';
    x32.drawImage(m8, 0, 0, m32.width, m32.height);
    cx.save(); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.globalAlpha = 0.55; cx.drawImage(m32, 0, 0, W, H);
    cx.globalAlpha = 0.2; cx.drawImage(m8, 0, 0, W, H);
    cx.restore();
  }
  };
  // Vistos através da chuva: um pouco apagados (pintado uma vez, aqui; ver `.gt-telas`).
  const telao = (b: (typeof caixas)[number]) => {
    cx.save(); cx.globalAlpha = 0.92;
    const m = Math.max(2, 3 * esc);
    if (b.giro) { cx.save(); cx.translate(b.x + b.w / 2, b.y + b.h / 2); cx.rotate(b.giro); cx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
    // Moldura: metal escuro com uma luz na borda de cima.
    cx.fillStyle = '#0c0f0f'; cx.fillRect(b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m);
    cx.fillStyle = 'rgba(160,190,185,.25)'; cx.fillRect(b.x - m, b.y - m, b.w + 2 * m, Math.max(1, esc));
    // O gif é desenhado na camada de cima, a cada quadro; aqui fica o primeiro, de reserva.
    if (b.gif) quadroDaCena(cx, b, 0);
    else if (b.img) cx.drawImage(b.img, b.x, b.y, b.w, b.h);
    cx.fillStyle = 'rgba(0,0,0,.16)';
    for (let yy = b.y; yy < b.y + b.h; yy += 3) cx.fillRect(b.x, yy, b.w, 1);
    if (b.giro) cx.restore();
    // Os suportes de baixo, presos na fachada (o inclinado é preso de lado).
    luzes.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) * 1.1, cor: b.cor, forca: 0.55 });
    if (!b.giro) {
      cx.fillStyle = '#0a0d0d';
      cx.fillRect(b.x + b.w * 0.15, b.y + b.h + m, 2 * esc, 4 * esc); cx.fillRect(b.x + b.w * 0.85 - 2 * esc, b.y + b.h + m, 2 * esc, 4 * esc);
    }
    cx.restore();
  };
  const monumento: Etapa = () => {
    // O monumento no meio da praça, na frente dos telões.
    const mx = W * 0.5, mw = Math.max(5, W * 0.008);
    cx.fillStyle = '#030606';
    cx.fillRect(mx - mw / 2, H * 0.66, mw, H); cx.fillRect(mx - mw * 1.3, H * 0.9, mw * 2.6, H);
    cx.fillRect(mx - mw, H * 0.68, mw * 2, H * 0.01);
    cx.beginPath(); cx.ellipse(mx, H * 0.652, mw * 0.85, mw * 1.5, 0, 0, 6.2832); cx.fill();
    fim({ luzes, gifs: caixas.filter(b => b.gif) });
  };
  const deTres: Etapa[] = [];
  for (let i = 0; i < caixas.length; i += 3) deTres.push(() => caixas.slice(i, i + 3).forEach(telao));
  return [brilho, ...deTres, monumento];
}

export function CidadeGotham({ aoMudarLuzes, piscar }: { aoMudarLuzes: (l: Luz[]) => void; piscar: () => number }) {
  const fundo = useRef<HTMLCanvasElement>(null);
  const telas = useRef<HTMLCanvasElement>(null);
  const faixa = useRef<HTMLCanvasElement>(null);
  const avisar = useRef(aoMudarLuzes);
  avisar.current = aoMudarLuzes;
  const lerPiscar = useRef(piscar);
  lerPiscar.current = piscar;

  useEffect(() => {
    const f = fundo.current, tl = telas.current, fx = faixa.current, fc = fx?.getContext('2d');
    if (!f || !tl || !fx || !fc) return;
    let vivo = true, luzesCidade: Luz[] = [], luzesTeloes: Luz[] = [], letreiros: Neon[] = [], gifs: Caixa2[] = [];
    const imgs = TELOES.map(t => { const i = new Image(); i.src = t.src; return i; });
    let imagensProntas = false;
    const publicar = () => avisar.current([...luzesCidade, ...luzesTeloes]);

    // A montagem em etapas (pedido de 06/10/2026): pintar tudo de uma vez congelava a página
    // por 300 a 470 ms num computador fraco, bem quando o tema começa a entrar. Uma etapa por
    // quadro, com o navegador desenhando entre elas; redimensionar começa uma fila nova.
    let fila: Etapa[] = [], vez = 0, rodando = false;
    const proxima = (minhaVez: number) => requestAnimationFrame(() => setTimeout(() => {
      if (!vivo || minhaVez !== vez) return;
      const etapa = fila.shift();
      if (!etapa) { rodando = false; return; }
      etapa();
      proxima(minhaVez);
    }, 0));
    const enfileirar = (etapas: Etapa[]) => {
      fila.push(...etapas);
      if (!rodando) { rodando = true; proxima(vez); }
    };
    const teloes = () => etapasDosTeloes(tl, tl.width, tl.height, imgs, r => { luzesTeloes = r.luzes; gifs = r.gifs; publicar(); });
    const ajustar = () => {
      const W = f.width = tl.width = fx.width = Math.max(1, f.clientWidth), H = f.height = tl.height = fx.height = Math.max(1, f.clientHeight);
      vez++; fila = []; rodando = false;
      letreiros = []; gifs = []; luzesTeloes = [];
      const cena = etapasDaCidade(f, W, H, n => letreiros.push(n), enfileirar);
      luzesCidade = cena.luzes;
      enfileirar([...cena.etapas, publicar]);
      // Os telões só quando as imagens chegarem (antes eram pintados vazios e de novo depois).
      if (imagensProntas) enfileirar(teloes());
    };
    ajustar();
    void Promise.all(imgs.map(i => i.decode().catch(() => {}))).then(() => {
      if (!vivo) return;
      imagensProntas = true;
      enfileirar(teloes());
    });
    // Redimensionar repinta a cidade inteira: espera a janela parar de mudar (e ignora o aviso
    // inicial do observador, que chega com o mesmo tamanho).
    let espera: ReturnType<typeof setTimeout> | undefined;
    const obs = new ResizeObserver(() => {
      if (f.clientWidth === f.width && f.clientHeight === f.height) return;
      clearTimeout(espera); espera = setTimeout(ajustar, 200);
    });
    obs.observe(f);

    // O letreiro corrido de notícias, na base do prédio baixo da direita.
    let ultimo = 0, deslocamento = 0;
    // Um letreiro falhando (mais vezes conforme a música avança): qual, desde quando e o
    // desenho da falha — [ms, apagado?], sempre terminando aceso.
    let falha: { i: number; t0: number; passos: [number, boolean][] } | null = null;
    const PADROES: [number, boolean][][] = [
      [[0, true], [90, false], [160, true], [260, false]],
      [[0, true], [60, false], [110, true], [170, false], [230, true], [300, false]],
      [[0, true], [1400, false]],
    ];
    const correr = (agora: number) => {
      if (!vivo) return;
      if (agora - ultimo >= 32) {
        ultimo = agora;
        const W = fx.width, H = fx.height, esc = Math.max(0.7, Math.min(1.6, W / 1200));
        // No alto do prédio baixo, logo abaixo da cornija, de quina a quina.
        const p = PREDIOS.baixoDir, x = p.x * W, w = p.w * W, y = (p.topo + 0.012) * H, h = 13 * esc;
        fc.clearRect(0, 0, W, H);
        // O neon aceso — menos o do letreiro que está falhando agora.
        let apagado = -1;
        if (!falha && letreiros.length && Math.random() < lerPiscar.current() * 0.03) {
          falha = { i: Math.floor(Math.random() * letreiros.length), t0: agora, passos: PADROES[Math.floor(Math.random() * PADROES.length)] };
        }
        if (falha) {
          const t = agora - falha.t0;
          let apaga = false, fim = true;
          for (const [quando, a] of falha.passos) { if (t >= quando) apaga = a; else { fim = false; break; } }
          if (apaga) apagado = falha.i;
          if (fim && !apaga) falha = null;
        }
        letreiros.forEach((l, i) => { if (i !== apagado) fc.drawImage(l.img, l.x, l.y); });
        // Os telões que passam cenas do filme: o quadro da vez, sem suavizar, com as linhas do LED.
        for (const b of gifs) {
          fc.save();
          if (b.giro) { fc.translate(b.x + b.w / 2, b.y + b.h / 2); fc.rotate(b.giro); fc.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
          quadroDaCena(fc, b, Math.floor((agora + b.desfase) / b.gif!.ms));
          fc.fillStyle = 'rgba(0,0,0,.18)';
          for (let yy = b.y; yy < b.y + b.h; yy += 3) fc.fillRect(b.x, yy, b.w, 1);
          fc.restore();
        }
        fc.save();
        fc.fillStyle = '#0b0703'; fc.fillRect(x, y, w, h);
        fc.beginPath(); fc.rect(x, y, w, h); fc.clip();
        fc.font = `700 ${Math.round(h * 0.78)}px "Arial Narrow", Arial, sans-serif`;
        fc.textBaseline = 'middle'; fc.fillStyle = '#ffb347'; fc.shadowColor = 'rgba(255,170,60,.9)'; fc.shadowBlur = 6 * esc;
        const larguraTexto = fc.measureText(NOTICIAS).width;
        deslocamento = (deslocamento + 1.4 * esc) % larguraTexto;
        for (let k = 0; k < 3; k++) fc.fillText(NOTICIAS, x + w - deslocamento + (k - 1) * larguraTexto, y + h / 2);
        fc.restore();
        // A marquise do teatro no prédio baixo da esquerda: lâmpadas correndo em volta do nome.
        const q = PREDIOS.baixoEsq, mx = (q.x + q.w * 0.08) * W, mw = q.w * W * 0.84, my = (q.topo + 0.03) * H, mh = 26 * esc;
        fc.fillStyle = '#120a04'; fc.fillRect(mx, my, mw, mh);
        const passo = 6 * esc, fase = Math.floor(agora / 120) % 3;
        let n = 0;
        for (let bx = mx + passo / 2; bx < mx + mw; bx += passo, n++) {
          for (const by of [my + 3 * esc, my + mh - 3 * esc]) {
            const acesa = (n + (by > my + mh / 2 ? 1 : 0)) % 3 === fase;
            fc.fillStyle = acesa ? '#ffe9b0' : 'rgba(255,190,90,.35)';
            fc.shadowColor = '#ffcf70'; fc.shadowBlur = acesa ? 6 * esc : 0;
            fc.beginPath(); fc.arc(bx, by, 1.3 * esc, 0, 6.2832); fc.fill();
          }
        }
        fc.shadowBlur = 0;
        fc.font = `700 ${Math.round(mh * 0.42)}px "Arial Narrow", Arial, sans-serif`;
        fc.textAlign = 'center'; fc.textBaseline = 'middle';
        fc.fillStyle = '#fff1d0'; fc.shadowColor = 'rgba(255,200,110,.9)'; fc.shadowBlur = 8 * esc;
        fc.fillText('TEATRO GOTHAM', mx + mw / 2, my + mh / 2);
        fc.shadowBlur = 0; fc.textAlign = 'start';
      }
      requestAnimationFrame(correr);
    };
    requestAnimationFrame(correr);
    return () => { vivo = false; obs.disconnect(); clearTimeout(espera); };
  }, []);

  return (
    <>
      <canvas ref={fundo} className="gt-cidade" />
      <canvas ref={telas} className="gt-cidade gt-telas" />
      <canvas ref={faixa} className="gt-cidade" />
    </>
  );
}
