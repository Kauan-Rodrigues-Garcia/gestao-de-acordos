/**
 * carta.ts — as cartas de quem bateu no Cavalo da Guerra (pedido de
 * 27/10/2026: «o top 1 a 3 diferente do 4 a 10, e do 11 em diante diferente;
 * algo bonito, relembrando a guerra, minimalista e com efeitos»).
 *
 * Uma carta de 1080 × 1512 (5:7, o tamanho das cartas da Bruxa), desenhada num
 * canvas para virar PNG. Três artes, uma por faixa do ranking:
 *
 *  - LENDA (1º a 3º): o sol vermelho do fim da batalha, a foto num círculo
 *    dentro dele e o Cavalo da Guerra empinado no horizonte, em silhueta, só
 *    com a crina de fogo e os olhos acesos. As lanças da tropa na linha do
 *    chão. O metal é do lugar: ouro, prata, bronze. (A referência é o pôster
 *    de «Ran», do Kurosawa: um sol, silhuetas e mais nada.)
 *  - LINHA DE FRENTE (4º a 10º): aço escuro, um corte de espada atravessando
 *    a carta por trás da foto, o número do lugar vazado ao fundo e o cavalo
 *    vermelho a galope saindo do canto do quadro.
 *  - TROPA (11º em diante): cinza de fumaça, a foto num quadro de parede, um
 *    pouco desbotada, como retrato de campanha, e o selo de cera com duas
 *    espadas cruzadas. Brasa pouca, cinza caindo.
 *
 * O cavalo é o mesmo desenho do chefe (`cavaloDaGuerra.js`), em escala
 * inteira e sem suavizar. Só a foto é suavizada. Os números são os do
 * ranking que o banco devolveu quando ele caiu (`banco.ts` desta pasta).
 */
import { CAVALEIROS, CCHAO, CH, CMEIO, CPIV, CW, MAT, construirCavalo, criarDestino, type Pose } from '../cavaloDaGuerra.js';

export const LARGURA_CARTA = 1080;
export const ALTURA_CARTA = 1512;
/** Até aqui é LENDA; até `TOPO_FRENTE`, LINHA DE FRENTE; depois, TROPA. */
export const TOPO_LENDA = 3;
export const TOPO_FRENTE = 10;

export type Faixa = 'lenda' | 'frente' | 'tropa';
export const faixaDaPosicao = (posicao: number): Faixa => posicao <= TOPO_LENDA ? 'lenda' : posicao <= TOPO_FRENTE ? 'frente' : 'tropa';

/** O que a carta mostra de uma pessoa. */
export interface DadosDaCartaGuerra {
  /** O lugar no ranking da guerra: 1 em diante. */
  posicao: number;
  nome: string;
  setor: string | null;
  /** O dano do ranking (o bruto, antes do ritmo). */
  dano: number;
  /** A soma do dano de todo mundo: «x% do dano da tropa». */
  danoTotal: number;
  /** Quantas pessoas acertaram o chefe. */
  participantes: number;
  /** Quando ele caiu. */
  quando: Date | null;
}

/** O recorte da foto, como o das cartas da Bruxa: `zoom` 1 cobre a janela; `px`/`py` como o `object-position`. */
export interface Enquadramento {
  zoom: number;
  px: number;
  py: number;
}
export const ENQUADRAMENTO_PADRAO: Enquadramento = { zoom: 1, px: 0.5, py: 0.3 };
export const ZOOM_MAXIMO = 4;

/** A janela da foto em cada arte (px da carta): o círculo da LENDA, o quadro da FRENTE e o retrato da TROPA. */
export const JANELAS: Record<Faixa, { w: number; h: number }> = {
  lenda: { w: 360, h: 360 },
  frente: { w: 620, h: 700 },
  tropa: { w: 540, h: 620 },
};

/** O tamanho da foto desenhada numa janela com esse zoom (o editor do recorte usa para arrastar certo). */
export function tamanhoDaFoto(foto: { naturalWidth: number; naturalHeight: number }, zoom: number, janela: { w: number; h: number }): { dw: number; dh: number } {
  const s = Math.max(janela.w / foto.naturalWidth, janela.h / foto.naturalHeight) * Math.min(Math.max(zoom, 1), ZOOM_MAXIMO);
  return { dw: foto.naturalWidth * s, dh: foto.naturalHeight * s };
}

/** Os títulos, sem gênero. Do 11º em diante eles se revezam. */
export const TITULOS_LENDA: readonly string[] = ['Lenda da Guerra', 'Lâmina Vermelha', 'Fúria de Fogo'];
export const TITULOS_FRENTE: readonly string[] = [
  'Escudo de Ferro', 'Lança Certeira', 'Coragem em Brasa', 'Aço Implacável',
  'Trovão de Cascos', 'Chama Indomável', 'Muralha Viva',
];
export const TITULOS_TROPA: readonly string[] = [
  'Coração de Batalha', 'Brasa Acesa', 'Passo Firme', 'Voz da Tropa',
  'Fogo no Olhar', 'Estandarte Erguido', 'Ferro e Coragem', 'Sangue Frio',
];

export function tituloDaPosicao(posicao: number): string {
  const p = Math.max(posicao, 1);
  if (p <= TOPO_LENDA) return TITULOS_LENDA[p - 1];
  if (p <= TOPO_FRENTE) return TITULOS_FRENTE[p - TOPO_LENDA - 1];
  return TITULOS_TROPA[(p - TOPO_FRENTE - 1) % TITULOS_TROPA.length];
}

const FRASE: Record<Faixa, string> = {
  lenda: 'Derrubou o Cavalo da Guerra e entrou para a história da Corrida.',
  frente: 'Esteve na linha de frente quando o Cavalo da Guerra caiu.',
  tropa: 'Lutou ao lado de todos até o Cavalo da Guerra cair.',
};

const ROMANO = ['I', 'II', 'III'];

const inteiro = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** A parte do dano da tropa, em % com uma casa. */
export function parteDoDano(dano: number, total: number): string {
  if (total <= 0) return '—';
  const p = Math.min(100, (dano / total) * 100);
  if (p > 0 && p < 0.1) return '< 0,1%';
  return `${p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function dataDaCarta(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** «03 - Maria Silva.png», com zeros pela quantidade de gente (como as cartas da Bruxa). */
export function nomeDoArquivo(d: Pick<DadosDaCartaGuerra, 'posicao' | 'nome' | 'participantes'>): string {
  const casas = Math.max(2, String(Math.max(d.participantes, d.posicao)).length);
  const visivel = [...d.nome].filter(ch => ch.charCodeAt(0) >= 32).join('');
  const nome = visivel.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Sem nome';
  return `${String(d.posicao).padStart(casas, '0')} - ${nome}.png`;
}

// ── Fontes e foto ─────────────────────────────────────────────────────────────

const SERIFA = '"Cinzel", "Times New Roman", serif';
const ITALICO = '"Cormorant Garamond", Georgia, serif';

/** Cinzel (letra de inscrição romana) e Cormorant itálico, no próprio site (OFL), como as outras fontes. */
const FONTES = `@font-face {
  font-family: 'Cinzel';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url('/fonts/cinzel.woff2') format('woff2');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: italic;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/cormorant-italico.woff2') format('woff2');
}`;

/** Declara e baixa as fontes da carta (canvas não espera fonte sozinho). */
export async function prepararFontes(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('guerra-fontes-carta')) {
    const estilo = document.createElement('style');
    estilo.id = 'guerra-fontes-carta';
    estilo.textContent = FONTES;
    document.head.appendChild(estilo);
  }
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`700 64px ${SERIFA}`),
    document.fonts.load(`400 64px ${SERIFA}`),
    document.fonts.load(`italic 500 64px ${ITALICO}`),
  ]).catch((): void => undefined);
}

/** A foto do perfil pronta para o canvas (`crossOrigin` para o PNG poder sair). Sem foto ou com erro: `null`. */
export function carregarFoto(url: string | null, esperaMs = 10_000): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    const fim = (ok: boolean) => { clearTimeout(t); resolve(ok && img.naturalWidth > 0 ? img : null); };
    const t = setTimeout(() => fim(false), esperaMs);
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => fim(true);
    img.onerror = () => fim(false);
    img.src = url;
  });
}

// ── Pedacinhos de desenho ────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;
const W = LARGURA_CARTA, H = ALTURA_CARTA;

function novoCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')!];
}

/** Um sorteio que se repete (a mesma carta sai igual toda vez). */
function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const espacar = (c: Ctx, px: number) => { (c as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`; };

/** Texto com espaçamento entre letras, centrado de verdade (o espaço depois da última letra sai da conta). */
function escrever(c: Ctx, texto: string, x: number, y: number, fonte: string, cor: string, espaco = 0, alinhar: CanvasTextAlign = 'center'): number {
  c.font = fonte;
  espacar(c, espaco);
  c.textAlign = alinhar;
  c.fillStyle = cor;
  c.fillText(texto, alinhar === 'center' ? x + espaco / 2 : x, y);
  const largura = c.measureText(texto).width - espaco;
  espacar(c, 0);
  return largura;
}

/** O maior corpo (até `max`) em que o texto cabe na largura. */
function caber(c: Ctx, texto: string, molde: (px: number) => string, max: number, largura: number, espaco = 0, min = 20): number {
  for (let px = max; px > min; px -= 2) {
    c.font = molde(px);
    espacar(c, espaco);
    const w = c.measureText(texto).width;
    espacar(c, 0);
    if (w <= largura) return px;
  }
  return min;
}

/** Um fio com as pontas sumindo (o separador da carta). */
function fio(c: Ctx, x0: number, x1: number, y: number, cor: string, alfa = 1): void {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, cor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.globalAlpha = alfa;
  c.fillStyle = g;
  c.fillRect(x0, y - 1, x1 - x0, 2);
  c.restore();
}

/** Um losango pequeno (o enfeite dos fios). */
function losango(c: Ctx, x: number, y: number, r: number, cor: string): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fillStyle = cor;
  c.fill();
}

let graoGuardado: HTMLCanvasElement | null = null;
/** O grão de filme por cima de tudo (tira a cara de vetor liso). */
function grao(c: Ctx, alfa: number): void {
  if (!graoGuardado) {
    const [cv, x] = novoCanvas(256, 256);
    const img = x.createImageData(256, 256), r = sorteio(91);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    graoGuardado = cv;
  }
  c.save();
  c.globalAlpha = alfa;
  c.globalCompositeOperation = 'overlay';
  c.fillStyle = c.createPattern(graoGuardado, 'repeat')!;
  c.fillRect(0, 0, W, H);
  c.restore();
}

/** O escurecido das bordas. */
function vinheta(c: Ctx, forca: number, cx = W / 2, cy = H * 0.45): void {
  const g = c.createRadialGradient(cx, cy, H * 0.25, cx, cy, H * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${forca})`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

/** Brasas subindo: um ponto quente, o brilho em volta e o rastro para baixo. Mais perto do chão. */
function brasas(c: Ctx, r: () => number, n: number, area: { x: number; y: number; w: number; h: number }, tamanho: number, quente = true): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = area.x + r() * area.w;
    const y = area.y + area.h * Math.sqrt(r());
    const s = tamanho * (0.35 + r() * r() * 1.4);
    const a = 0.25 + r() * 0.75;
    const cor = quente ? (r() < 0.25 ? [255, 214, 140] : [255, 96 + r() * 70, 30]) : [255, 150, 90];
    const brilho = c.createRadialGradient(x, y, 0, x, y, s * 5);
    brilho.addColorStop(0, `rgba(${cor[0]},${cor[1]},${cor[2]},${a * 0.32})`);
    brilho.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = brilho;
    c.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
    // o rastro: a brasa sobe torta, então ele cai para baixo e um pouco de lado
    const inclina = (r() - 0.5) * 0.6, rastro = s * (3 + r() * 6);
    const g = c.createLinearGradient(x, y, x - inclina * rastro, y + rastro);
    g.addColorStop(0, `rgba(${cor[0]},${cor[1]},${cor[2]},${a * 0.8})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.strokeStyle = g;
    c.lineWidth = s * 0.9;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - inclina * rastro, y + rastro);
    c.stroke();
    c.fillStyle = `rgba(${cor[0]},${cor[1]},${cor[2]},${a})`;
    c.beginPath();
    c.arc(x, y, s * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Cinza caindo (pontos frios, sem brilho). */
function cinzas(c: Ctx, r: () => number, n: number, cor: string): void {
  c.save();
  c.fillStyle = cor;
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.15 + r() * 0.45;
    const x = r() * W, y = r() * H, s = 1 + r() * 2.6;
    c.beginPath();
    c.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Fumaça: manchas grandes e moles, numa faixa. */
function fumaca(c: Ctx, r: () => number, n: number, y0: number, y1: number, cor: [number, number, number], alfa: number): void {
  c.save();
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = y0 + r() * (y1 - y0), rx = 160 + r() * 320, ry = rx * (0.25 + r() * 0.25);
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${cor[0]},${cor[1]},${cor[2]},${alfa * (0.4 + r() * 0.6)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }
  c.restore();
}

/** A foto cobrindo a janela, com o recorte. Sem foto: as iniciais. */
function desenharFoto(c: Ctx, foto: HTMLImageElement | null, enq: Enquadramento, nome: string, x: number, y: number, w: number, h: number, corIniciais: string): void {
  if (foto) {
    const { dw, dh } = tamanhoDaFoto(foto, enq.zoom, { w, h });
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(foto, x + (w - dw) * enq.px, y + (h - dh) * enq.py, dw, dh);
    return;
  }
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#2a1416');
  g.addColorStop(1, '#0c0607');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const ini = iniciais(nome);
  const px = Math.round(Math.min(w, h) * 0.36);
  c.font = `700 ${px}px ${SERIFA}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = corIniciais;
  c.fillText(ini, x + w / 2, y + h / 2 + px * 0.04);
  c.textBaseline = 'alphabetic';
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const a = partes[0][0], b = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (a + b).toLocaleUpperCase('pt-BR');
}

// ── O cavalo ─────────────────────────────────────────────────────────────────

const FOGO = new Set([MAT.CRINA, MAT.RABO, MAT.FOGO_PE]);

/**
 * O Cavalo da Guerra numa pose, em duas camadas da grade dele (CW × CH): o
 * corpo (numa cor só, com a borda acesa como contraluz; ou, sem cor, o
 * desenho do chefe) e o que é luz (o fogo e os olhos, nas cores dele).
 */
function cavaloEmCamadas(pose: Pose, corpo: [number, number, number] | null, borda: [number, number, number] | null = null): { silhueta: HTMLCanvasElement; luz: HTMLCanvasElement } {
  const d = criarDestino();
  const src = construirCavalo(pose, CAVALEIROS.guerra, d);
  const orig = src.getContext('2d')!.getImageData(0, 0, CW, CH);
  const [sv, sx] = novoCanvas(CW, CH), [lv, lx] = novoCanvas(CW, CH);
  const si = sx.createImageData(CW, CH), li = lx.createImageData(CW, CH);
  for (let i = 0; i < CW * CH; i++) {
    const o = i * 4;
    if (!orig.data[o + 3]) continue;
    const k = d.g[i];
    if (FOGO.has(k) || k === MAT.OLHO) {
      li.data[o] = orig.data[o]; li.data[o + 1] = orig.data[o + 1]; li.data[o + 2] = orig.data[o + 2]; li.data[o + 3] = orig.data[o + 3];
      continue;
    }
    // sem cor de corpo, fica o desenho do chefe como ele é
    if (!corpo || !borda) {
      for (let j = 0; j < 4; j++) si.data[o + j] = orig.data[o + j];
      continue;
    }
    // a contraluz: o pixel do corpo que encosta no vazio (ou no fogo) acende com a cor da borda
    const x = i % CW, y = (i / CW) | 0;
    const vazio = (a: number, b: number) => a < 0 || b < 0 || a >= CW || b >= CH || !orig.data[(b * CW + a) * 4 + 3] || FOGO.has(d.g[b * CW + a]);
    const cor = vazio(x - 1, y) || vazio(x + 1, y) || vazio(x, y - 1) || vazio(x, y + 1) ? borda : corpo;
    si.data[o] = cor[0]; si.data[o + 1] = cor[1]; si.data[o + 2] = cor[2];
    si.data[o + 3] = 255;
  }
  sx.putImageData(si, 0, 0);
  lx.putImageData(li, 0, 0);
  return { silhueta: sv, luz: lv };
}

/**
 * Põe o cavalo na carta com o casco de trás em (x, chao), na escala `s`
 * (inteira, pixel nítido), girado `giro` em volta do casco (empinar).
 * A luz sai duas vezes: nítida e borrada por cima (o brilho do fogo).
 */
function porCavalo(c: Ctx, camadas: { silhueta: HTMLCanvasElement; luz: HTMLCanvasElement }, x: number, chao: number, s: number, giro: number, brilho: number): void {
  const px = CMEIO + CPIV, py = CCHAO;
  const no = (img: HTMLCanvasElement) => {
    c.save();
    c.translate(x, chao);
    c.rotate(giro);
    c.imageSmoothingEnabled = false;
    c.drawImage(img, -px * s, -py * s, CW * s, CH * s);
    c.restore();
  };
  no(camadas.silhueta);
  no(camadas.luz);
  if (brilho > 0) {
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = brilho;
    c.filter = `blur(${Math.round(s * 7)}px)`;
    no(camadas.luz);
    c.restore();
  }
}

// ── As molduras ──────────────────────────────────────────────────────────────

interface Metal { base: string; luz: string; sombra: string; texto: string }
const METAL_LENDA: Metal[] = [
  { base: '#e8b84a', luz: '#fff0bf', sombra: '#6b4a0c', texto: '#f6d98a' },   // ouro
  { base: '#c9d0dc', luz: '#ffffff', sombra: '#4a5262', texto: '#e4e9f1' },   // prata
  { base: '#cf8a55', luz: '#ffd6b3', sombra: '#5a2e12', texto: '#eab08a' },   // bronze
];

/** O cantinho de esquadro da moldura fina. */
function cantos(c: Ctx, m: number, braco: number, cor: string, largura: number): void {
  c.save();
  c.strokeStyle = cor;
  c.lineWidth = largura;
  c.lineCap = 'square';
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    c.beginPath();
    c.moveTo(x, y + dy * braco);
    c.lineTo(x, y);
    c.lineTo(x + dx * braco, y);
    c.stroke();
  }
  c.restore();
}

/** A moldura fina: um fio em volta e os cantos mais fortes. */
function molduraFina(c: Ctx, cor: string, alfa: number, m = 34): void {
  c.save();
  c.globalAlpha = alfa;
  c.strokeStyle = cor;
  c.lineWidth = 1.5;
  c.strokeRect(m, m, W - m * 2, H - m * 2);
  c.restore();
  cantos(c, m - 8, 46, cor, 3);
}

/** Os números de baixo: duas ou três colunas, número grande e o rótulo. */
function numeros(c: Ctx, colunas: { valor: string; rotulo: string }[], y: number, corValor: string, corRotulo: string, corFio: string, corpo = 54): void {
  const largura = 820, x0 = (W - largura) / 2, passo = largura / colunas.length;
  colunas.forEach((col, i) => {
    const cx = x0 + passo * (i + 0.5);
    const px = caber(c, col.valor, p => `700 ${p}px ${SERIFA}`, corpo, passo - 30);
    escrever(c, col.valor, cx, y, `700 ${px}px ${SERIFA}`, corValor, 1);
    escrever(c, col.rotulo.toLocaleUpperCase('pt-BR'), cx, y + 40, `400 20px ${SERIFA}`, corRotulo, 5);
    if (i > 0) {
      c.fillStyle = corFio;
      c.fillRect(x0 + passo * i, y - 50, 1.5, 100);
    }
  });
}

/** Nome, setor, título e frase: o bloco de baixo, igual nas três (muda a cor). */
function blocoDoNome(c: Ctx, d: DadosDaCartaGuerra, y: number, cores: { nome: string; setor: string; frase: string }, corpoNome = 76): number {
  const nome = d.nome.trim() || 'Sem nome';
  const px = caber(c, nome.toLocaleUpperCase('pt-BR'), p => `700 ${p}px ${SERIFA}`, corpoNome, 900, 2, 36);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.85)';
  c.shadowBlur = 18;
  escrever(c, nome.toLocaleUpperCase('pt-BR'), W / 2, y, `700 ${px}px ${SERIFA}`, cores.nome, 2);
  c.restore();
  let yy = y + 50;
  if (d.setor) {
    escrever(c, d.setor.toLocaleUpperCase('pt-BR'), W / 2, yy, `400 24px ${SERIFA}`, cores.setor, 7);
    yy += 22;
  }
  yy += 52;
  const fpx = caber(c, FRASE[faixaDaPosicao(d.posicao)], p => `italic 500 ${p}px ${ITALICO}`, 40, 900, 0, 26);
  escrever(c, FRASE[faixaDaPosicao(d.posicao)], W / 2, yy, `italic 500 ${fpx}px ${ITALICO}`, cores.frase);
  return yy;
}

function rodape(c: Ctx, d: DadosDaCartaGuerra, cor: string, y = H - 64): void {
  const data = dataDaCarta(d.quando);
  const texto = data ? `GUERRA NA CORRIDA  ·  ${data.replace(/\//g, ' · ')}` : 'GUERRA NA CORRIDA';
  escrever(c, texto, W / 2, y, `400 20px ${SERIFA}`, cor, 6);
}

// LENDA — o sol, a foto dentro dele e o cavalo no horizonte.
function cartaLenda(c: Ctx, d: DadosDaCartaGuerra, foto: HTMLImageElement | null, enq: Enquadramento): void {
  const m = METAL_LENDA[Math.min(d.posicao, 3) - 1];
  const r = sorteio(1000 + d.posicao);
  const HORIZONTE = 1020, SOL = { x: W / 2, y: 710, r: 440 };
  const FOTO = { x: W / 2, y: 460, r: JANELAS.lenda.w / 2 };

  // o céu: quase preto em cima, a brasa do poente embaixo
  const ceu = c.createLinearGradient(0, 0, 0, HORIZONTE);
  ceu.addColorStop(0, '#080405');
  ceu.addColorStop(0.55, '#1c0607');
  ceu.addColorStop(1, '#3a0a08');
  c.fillStyle = ceu;
  c.fillRect(0, 0, W, HORIZONTE);
  const halo = c.createRadialGradient(SOL.x, SOL.y, SOL.r * 0.8, SOL.x, SOL.y, SOL.r * 1.9);
  halo.addColorStop(0, 'rgba(200,24,16,0.45)');
  halo.addColorStop(1, 'rgba(200,24,16,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, W, HORIZONTE);

  // o sol, cortado no horizonte
  c.save();
  c.beginPath();
  c.rect(0, 0, W, HORIZONTE);
  c.clip();
  const sol = c.createRadialGradient(SOL.x, SOL.y - SOL.r * 0.45, SOL.r * 0.1, SOL.x, SOL.y, SOL.r);
  sol.addColorStop(0, '#ff6a32');
  sol.addColorStop(0.45, '#e4261c');
  sol.addColorStop(0.85, '#a50d12');
  sol.addColorStop(1, '#7c070c');
  c.fillStyle = sol;
  c.beginPath();
  c.arc(SOL.x, SOL.y, SOL.r, 0, Math.PI * 2);
  c.fill();
  // a fumaça da batalha passando na frente dele, em faixas
  for (let i = 0; i < 4; i++) {
    const y = SOL.y + 60 + i * 52 + r() * 16, h = 4 + i * 3 + r() * 4;
    c.fillStyle = `rgba(30,4,6,${0.14 + i * 0.07})`;
    c.beginPath();
    c.ellipse(SOL.x + (r() - 0.5) * 300, y, 360 + r() * 260, h, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // a foto: um círculo dentro do sol, com o anel do metal
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 50;
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(FOTO.x, FOTO.y, FOTO.r, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.arc(FOTO.x, FOTO.y, FOTO.r, 0, Math.PI * 2);
  c.clip();
  desenharFoto(c, foto, enq, d.nome, FOTO.x - FOTO.r, FOTO.y - FOTO.r, FOTO.r * 2, FOTO.r * 2, m.texto);
  // a luz do sol batendo de baixo
  const brasaFoto = c.createLinearGradient(0, FOTO.y, 0, FOTO.y + FOTO.r);
  brasaFoto.addColorStop(0, 'rgba(255,60,20,0)');
  brasaFoto.addColorStop(1, 'rgba(255,60,20,0.28)');
  c.fillStyle = brasaFoto;
  c.fillRect(FOTO.x - FOTO.r, FOTO.y, FOTO.r * 2, FOTO.r);
  c.restore();
  // o anel: o metal com luz em cima e sombra embaixo, e um fio fino por fora
  const anel = c.createLinearGradient(0, FOTO.y - FOTO.r, 0, FOTO.y + FOTO.r);
  anel.addColorStop(0, m.luz);
  anel.addColorStop(0.45, m.base);
  anel.addColorStop(1, m.sombra);
  c.strokeStyle = anel;
  c.lineWidth = 9;
  c.beginPath();
  c.arc(FOTO.x, FOTO.y, FOTO.r + 4, 0, Math.PI * 2);
  c.stroke();
  c.save();
  c.globalAlpha = 0.55;
  c.strokeStyle = m.base;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(FOTO.x, FOTO.y, FOTO.r + 26, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) losango(c, FOTO.x + Math.cos(a) * (FOTO.r + 26), FOTO.y + Math.sin(a) * (FOTO.r + 26), 7, m.base);

  // o chão e o reflexo do sol nele
  const chao = c.createLinearGradient(0, HORIZONTE, 0, H);
  chao.addColorStop(0, '#120405');
  chao.addColorStop(0.25, '#070203');
  chao.addColorStop(1, '#040102');
  c.fillStyle = chao;
  c.fillRect(0, HORIZONTE, W, H - HORIZONTE);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const y = HORIZONTE + 6 + i * i * 2.2, w = (SOL.r * 1.5) * (1 - i / 11);
    c.fillStyle = `rgba(200,30,18,${0.32 * (1 - i / 9)})`;
    c.fillRect(SOL.x - w / 2, y, w, 2 + i * 0.4);
  }
  c.restore();

  // a tropa no horizonte: lanças e estandartes, pequenas, dos dois lados
  c.fillStyle = '#050102';
  for (const lado of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = W / 2 + lado * (300 + i * 26 + r() * 14), alt = 70 + r() * 90 - i * 3;
      c.fillRect(x - 1.5, HORIZONTE - alt, 3, alt);
      if (i % 3 === 1) {
        c.beginPath();
        c.moveTo(x, HORIZONTE - alt);
        c.lineTo(x + lado * 34, HORIZONTE - alt + 8);
        c.lineTo(x + lado * 24, HORIZONTE - alt + 14);
        c.lineTo(x, HORIZONTE - alt + 20);
        c.fill();
      } else {
        c.beginPath();
        c.moveTo(x - 5, HORIZONTE - alt + 6);
        c.lineTo(x, HORIZONTE - alt - 12);
        c.lineTo(x + 5, HORIZONTE - alt + 6);
        c.fill();
      }
    }
    // os escudos da linha, encostados uns nos outros
    for (let i = 0; i < 12; i++) {
      const x = W / 2 + lado * (290 + i * 22);
      c.beginPath();
      c.ellipse(x, HORIZONTE - 14, 13, 18, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.fillRect(0, HORIZONTE - 4, W, 8);

  // o Cavalo da Guerra empinado, em silhueta contra o sol
  // (empinado ele fica mais bravo, mas a silhueta embola; em pé, de perfil, lê de longe)
  const cav = cavaloEmCamadas({ t: 0.35, modo: 'parado', p: 0, furia: 1, jaw: 0.55, cab: 0, by: 0, feridas: [], num: '' }, [7, 2, 3], [196, 46, 24]);
  porCavalo(c, cav, W / 2 - 130, HORIZONTE + 4, 3, 0, 0.55);

  brasas(c, r, 70, { x: 0, y: 260, w: W, h: HORIZONTE - 200 }, 4);
  brasas(c, r, 26, { x: 0, y: HORIZONTE - 80, w: W, h: 260 }, 3);
  vinheta(c, 0.7, W / 2, 620);

  // em cima: o lugar em algarismo romano, entre dois fios
  const romano = ROMANO[d.posicao - 1];
  c.save();
  c.shadowColor = m.base;
  c.shadowBlur = 30;
  escrever(c, romano, W / 2, 168, `700 104px ${SERIFA}`, m.texto, 4);
  c.restore();
  fio(c, 110, 420, 132, m.base, 0.9);
  fio(c, 660, 970, 132, m.base, 0.9);
  escrever(c, tituloDaPosicao(d.posicao).toLocaleUpperCase('pt-BR'), W / 2, 220, `400 26px ${SERIFA}`, m.texto, 9);

  // embaixo
  const yFrase = blocoDoNome(c, d, 1122, { nome: '#f6ece0', setor: '#b49a86', frase: '#e5d2c2' });
  numeros(c, [
    { valor: inteiro(d.dano), rotulo: 'de dano' },
    { valor: parteDoDano(d.dano, d.danoTotal), rotulo: 'do total' },
    { valor: `${d.posicao}º`, rotulo: `de ${inteiro(d.participantes)}` },
  ], yFrase + 104, m.texto, '#a8907e', 'rgba(232,184,74,0.35)', 56);
  rodape(c, d, '#8a7462');
  molduraFina(c, m.base, 0.45);
  grao(c, 0.09);
}

// LINHA DE FRENTE — aço, o corte da espada e o cavalo a galope.
function cartaFrente(c: Ctx, d: DadosDaCartaGuerra, foto: HTMLImageElement | null, enq: Enquadramento): void {
  const r = sorteio(2000 + d.posicao);
  const VERMELHO = '#d8382c';
  const FOTO = { x: 230, y: 170, ...JANELAS.frente };

  const fundo = c.createLinearGradient(0, 0, W, H);
  fundo.addColorStop(0, '#16171c');
  fundo.addColorStop(0.5, '#0d0e12');
  fundo.addColorStop(1, '#0a0a0d');
  c.fillStyle = fundo;
  c.fillRect(0, 0, W, H);
  const brasaAlta = c.createRadialGradient(W * 0.8, 160, 0, W * 0.8, 160, 760);
  brasaAlta.addColorStop(0, 'rgba(170,28,20,0.30)');
  brasaAlta.addColorStop(1, 'rgba(170,28,20,0)');
  c.fillStyle = brasaAlta;
  c.fillRect(0, 0, W, H);
  fumaca(c, r, 10, 700, 1150, [60, 52, 54], 0.22);

  // o corte da espada: do alto à direita até embaixo à esquerda, fino nas pontas
  const A = { x: W + 20, y: 110 }, B = { x: -20, y: 1010 };
  const comp = Math.hypot(B.x - A.x, B.y - A.y), nx = -(B.y - A.y) / comp, ny = (B.x - A.x) / comp;
  const corte = (larg: number) => {
    c.beginPath();
    c.moveTo(A.x, A.y);
    for (let i = 0; i <= 40; i++) {
      const u = i / 40, e = Math.sin(u * Math.PI) ** 0.8 * larg;
      c.lineTo(A.x + (B.x - A.x) * u + nx * e, A.y + (B.y - A.y) * u + ny * e);
    }
    for (let i = 40; i >= 0; i--) {
      const u = i / 40, e = Math.sin(u * Math.PI) ** 0.8 * larg;
      c.lineTo(A.x + (B.x - A.x) * u - nx * e * 0.4, A.y + (B.y - A.y) * u - ny * e * 0.4);
    }
    c.closePath();
  };
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.shadowColor = 'rgba(255,50,30,1)';
  c.shadowBlur = 60;
  c.fillStyle = 'rgba(220,40,28,0.85)';
  corte(16);
  c.fill();
  c.shadowBlur = 18;
  c.fillStyle = 'rgba(255,200,170,0.95)';
  corte(5);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = '#ffffff';
  corte(1.6);
  c.fill();
  c.restore();
  // as faíscas onde o corte passa
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const u = 0.08 + r() * 0.84, x = A.x + (B.x - A.x) * u, y = A.y + (B.y - A.y) * u;
    const ang = Math.atan2(ny, nx) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.2, len = 10 + r() * 46;
    const g = c.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.addColorStop(0, 'rgba(255,220,180,0.9)');
    g.addColorStop(1, 'rgba(255,80,30,0)');
    c.strokeStyle = g;
    c.lineWidth = 1.5 + r() * 1.5;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }
  c.restore();

  // a foto: um quadro reto com o bloco vermelho deslocado atrás (como impressão fora de registro)
  c.fillStyle = '#8a1a16';
  c.fillRect(FOTO.x + 18, FOTO.y + 18, FOTO.w, FOTO.h);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)';
  c.shadowBlur = 40;
  c.fillStyle = '#000';
  c.fillRect(FOTO.x, FOTO.y, FOTO.w, FOTO.h);
  c.restore();
  c.save();
  c.beginPath();
  c.rect(FOTO.x, FOTO.y, FOTO.w, FOTO.h);
  c.clip();
  desenharFoto(c, foto, enq, d.nome, FOTO.x, FOTO.y, FOTO.w, FOTO.h, VERMELHO);
  const sombra = c.createLinearGradient(0, FOTO.y + FOTO.h * 0.55, 0, FOTO.y + FOTO.h);
  sombra.addColorStop(0, 'rgba(10,10,13,0)');
  sombra.addColorStop(1, 'rgba(10,10,13,0.85)');
  c.fillStyle = sombra;
  c.fillRect(FOTO.x, FOTO.y, FOTO.w, FOTO.h);
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 1;
  c.strokeRect(FOTO.x + 0.5, FOTO.y + 0.5, FOTO.w - 1, FOTO.h - 1);

  // o cavalo a galope, vermelho-escuro, saindo do canto de baixo da foto
  const cav = cavaloEmCamadas({ t: 0.6, modo: 'galope', p: 0.15, furia: 1, jaw: 0.2, cab: 0, by: -1, feridas: [], num: '' }, null);
  porCavalo(c, cav, FOTO.x - 30, FOTO.y + FOTO.h + 46, 2, 0, 0.5);

  // em cima: «Nº 4» e o título
  escrever(c, `Nº ${d.posicao}`, FOTO.x, 122, `700 60px ${SERIFA}`, VERMELHO, 3, 'left');
  escrever(c, tituloDaPosicao(d.posicao).toLocaleUpperCase('pt-BR'), FOTO.x + FOTO.w, 116, `400 24px ${SERIFA}`, '#c9c3c0', 8, 'right');
  c.fillStyle = VERMELHO;
  c.fillRect(FOTO.x, 140, FOTO.w, 2);

  brasas(c, r, 34, { x: 0, y: 300, w: W, h: 1100 }, 3);
  vinheta(c, 0.55);

  const yFrase = blocoDoNome(c, d, 1100, { nome: '#f1eeec', setor: '#8f8a88', frase: '#cfc8c4' }, 72);
  numeros(c, [
    { valor: inteiro(d.dano), rotulo: 'de dano' },
    { valor: parteDoDano(d.dano, d.danoTotal), rotulo: 'do total' },
    { valor: `${d.posicao}º`, rotulo: `de ${inteiro(d.participantes)}` },
  ], yFrase + 104, '#ffffff', '#8a8482', 'rgba(216,56,44,0.5)', 50);
  rodape(c, d, '#6e6866');
  molduraFina(c, VERMELHO, 0.35);
  grao(c, 0.08);
}

/** Duas espadas cruzadas em relevo na cera (a cabeça do cavalo, pequena assim, virava borrão). */
function espadasCruzadas(c: Ctx, x: number, y: number, r: number): void {
  const espada = () => {
    c.beginPath();
    c.moveTo(0, -r);                     // a ponta
    c.lineTo(r * 0.09, -r * 0.82);
    c.lineTo(r * 0.09, r * 0.42);
    c.lineTo(-r * 0.09, r * 0.42);
    c.lineTo(-r * 0.09, -r * 0.82);
    c.closePath();
    c.rect(-r * 0.34, r * 0.42, r * 0.68, r * 0.1);   // a guarda
    c.rect(-r * 0.055, r * 0.52, r * 0.11, r * 0.32); // o cabo
    c.moveTo(r * 0.12, r * 0.92);
    c.arc(0, r * 0.92, r * 0.12, 0, Math.PI * 2);     // o pomo
    c.fill();
  };
  for (const [dx, dy, cor] of [[-2, -2, 'rgba(255,140,120,0.35)'], [2, 3, 'rgba(40,2,2,0.55)'], [0, 0, '#6e0f0d']] as const) {
    c.fillStyle = cor;
    for (const a of [-Math.PI / 4, Math.PI / 4]) {
      c.save();
      c.translate(x + dx, y + dy);
      c.rotate(a);
      espada();
      c.restore();
    }
  }
}

// TROPA — o retrato de campanha e o selo de cera.
function cartaTropa(c: Ctx, d: DadosDaCartaGuerra, foto: HTMLImageElement | null, enq: Enquadramento): void {
  const r = sorteio(3000 + d.posicao);
  const LATAO = '#b89466', CERA = '#9c1c1a';
  const FOTO = { x: 270, y: 220, ...JANELAS.tropa }, PASSE = 22;

  const fundo = c.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, '#1b1918');
  fundo.addColorStop(0.6, '#131212');
  fundo.addColorStop(1, '#0d0c0c');
  c.fillStyle = fundo;
  c.fillRect(0, 0, W, H);
  fumaca(c, r, 14, 820, 1350, [70, 64, 60], 0.28);
  fumaca(c, r, 6, 0, 300, [60, 56, 54], 0.15);

  // um estandarte rasgado, alto e fino, de cada lado da foto
  for (const x of [150, W - 150]) {
    c.fillStyle = 'rgba(120,24,22,0.55)';
    c.fillRect(x - 1.5, 180, 3, 380);
    c.beginPath();
    const lado = x < W / 2 ? 1 : -1;
    c.moveTo(x, 200);
    c.lineTo(x + lado * 54, 200);
    c.lineTo(x + lado * 54, 450);
    c.lineTo(x + lado * 40, 422);
    c.lineTo(x + lado * 28, 458);
    c.lineTo(x + lado * 14, 426);
    c.lineTo(x, 450);
    c.closePath();
    c.fillStyle = 'rgba(110,20,20,0.42)';
    c.fill();
  }

  // o quadro: passe-partout, fio de latão e a foto um pouco desbotada
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.65)';
  c.shadowBlur = 40;
  c.shadowOffsetY = 14;
  c.fillStyle = '#211e1c';
  c.fillRect(FOTO.x - PASSE, FOTO.y - PASSE, FOTO.w + PASSE * 2, FOTO.h + PASSE * 2);
  c.restore();
  c.strokeStyle = LATAO;
  c.globalAlpha = 0.7;
  c.lineWidth = 1.5;
  c.strokeRect(FOTO.x - PASSE + 6, FOTO.y - PASSE + 6, FOTO.w + PASSE * 2 - 12, FOTO.h + PASSE * 2 - 12);
  c.globalAlpha = 1;
  c.save();
  c.beginPath();
  c.rect(FOTO.x, FOTO.y, FOTO.w, FOTO.h);
  c.clip();
  c.filter = 'saturate(0.6) sepia(0.18) contrast(1.06)';
  desenharFoto(c, foto, enq, d.nome, FOTO.x, FOTO.y, FOTO.w, FOTO.h, LATAO);
  c.filter = 'none';
  const sombra = c.createRadialGradient(FOTO.x + FOTO.w / 2, FOTO.y + FOTO.h * 0.4, FOTO.w * 0.3, FOTO.x + FOTO.w / 2, FOTO.y + FOTO.h * 0.4, FOTO.w * 0.85);
  sombra.addColorStop(0, 'rgba(20,16,14,0)');
  sombra.addColorStop(1, 'rgba(20,16,14,0.55)');
  c.fillStyle = sombra;
  c.fillRect(FOTO.x, FOTO.y, FOTO.w, FOTO.h);
  c.restore();

  // o selo de cera, com a cabeça do cavalo em relevo
  const S = { x: FOTO.x + FOTO.w + 4, y: FOTO.y + FOTO.h + 4, r: 88 };
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 18;
  c.shadowOffsetY = 6;
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2, rr = S.r + Math.sin(i * 2.7) * 3 + (r() - 0.5) * 5;
    c.lineTo(S.x + Math.cos(a) * rr, S.y + Math.sin(a) * rr);
  }
  c.closePath();
  const cera = c.createRadialGradient(S.x - 22, S.y - 26, 4, S.x, S.y, S.r);
  cera.addColorStop(0, '#d0403a');
  cera.addColorStop(0.6, CERA);
  cera.addColorStop(1, '#5e0d0c');
  c.fillStyle = cera;
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(60,6,6,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(S.x, S.y, S.r - 14, 0, Math.PI * 2);
  c.stroke();
  espadasCruzadas(c, S.x, S.y, S.r - 26);

  // em cima
  escrever(c, `LUGAR ${d.posicao} DE ${inteiro(d.participantes)}`, W / 2, 130, `400 26px ${SERIFA}`, LATAO, 9);
  fio(c, 240, 840, 156, LATAO, 0.6);

  cinzas(c, r, 140, '#bdb3aa');
  brasas(c, r, 12, { x: 0, y: 700, w: W, h: 700 }, 2.4);
  vinheta(c, 0.6);

  escrever(c, tituloDaPosicao(d.posicao).toLocaleUpperCase('pt-BR'), W / 2, 950, `400 24px ${SERIFA}`, '#c9524a', 8);
  const yFrase = blocoDoNome(c, d, 1030, { nome: '#ece4da', setor: '#8c8178', frase: '#c4b8ac' }, 66);
  numeros(c, [
    { valor: inteiro(d.dano), rotulo: 'de dano' },
    { valor: parteDoDano(d.dano, d.danoTotal), rotulo: 'do total' },
  ], yFrase + 110, '#e9dccb', '#857a71', 'rgba(184,148,102,0.4)', 48);
  rodape(c, d, '#6c635c');
  molduraFina(c, LATAO, 0.3);
  grao(c, 0.1);
}

/** A carta pronta, num canvas de 1080 × 1512. */
export function desenharCarta(d: DadosDaCartaGuerra, foto: HTMLImageElement | null, enq: Enquadramento = ENQUADRAMENTO_PADRAO): HTMLCanvasElement {
  const [cv, c] = novoCanvas(W, H);
  c.textBaseline = 'alphabetic';
  const faixa = faixaDaPosicao(d.posicao);
  if (faixa === 'lenda') cartaLenda(c, d, foto, enq);
  else if (faixa === 'frente') cartaFrente(c, d, foto, enq);
  else cartaTropa(c, d, foto, enq);
  return cv;
}
