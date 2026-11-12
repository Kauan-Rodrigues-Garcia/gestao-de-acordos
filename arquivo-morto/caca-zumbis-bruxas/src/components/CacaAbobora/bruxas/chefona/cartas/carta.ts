/**
 * carta.ts — a CARTA ÉPICA de quem ficou no top 10 da Bruxa do Pântano
 * (pedido do Kauan, 19/10/2026: «uma arte foda, que apareça a foto da pessoa,
 * o ranking que ela participou, agradecendo por ter participado de um evento
 * único; bem detalhado, com o visual da bruxa, como se fosse um card épico»).
 *
 * Uma carta de colecionador de 1080 × 1512 (5:7), desenhada num canvas para
 * virar PNG. Tudo o que é da bruxa vem da arte que a luta já usa: a sprite do
 * Minecraft (`montarBruxaMC`), a garrafa, o totem, a teia, os itens, a fonte do
 * jogo e a placa de conquista (`desenharPlaca`). A arte em pixel é ampliada em
 * escala inteira e sem suavizar; só a foto é suavizada.
 *
 * O metal da moldura sai da posição: 1º ouro, 2º diamante, 3º esmeralda, do 4º
 * ao 10º ametista (a cor do manto dela) e, do 11º em diante, cobre (todo mundo
 * que tirou vida tem carta desde 19/10/2026). É só visual: os números são os
 * que o banco gravou na rodada (`banco.ts` desta pasta). A bruxa fica de
 * braços cruzados, sem garrafa na mão, e a foto aceita recorte
 * (`Enquadramento`, ajustado no editor de `CartasDoPantano.tsx`).
 */
import { carregarFonte, carregarFontesPixel } from '@/components/Halloween/fonte';
import { canvasDaImagem, miniatura } from '../../pixels';
import { GARRAFA, NOME_CHEFONA, PIXEL_MC, PONTA_DO_CHAPEU, acaso, coresDaPocao, montarBruxaMC, type Item } from '../arte';
import { desenharPlaca } from '../conquista';
import { escreverMC, larguraTextoMC } from '../fonteMC';
import {
  CORACAO_CHEIO_MC, GLOWSTONE_MC, OLHO_MC, REDSTONE_MC, TEIA_MC, TOTEM_MC,
} from '../texturasMC';

export const LARGURA_CARTA = 1080;
export const ALTURA_CARTA = 1512;
/** Até aqui a carta é do top (título próprio, «TOP» no escudo); depois, «LUGAR». */
export const TOPO_CARTA = 10;

/** O que a carta mostra de uma pessoa. */
export interface DadosDaCarta {
  /** O lugar no ranking da rodada: 1 em diante (todo mundo que tirou vida tem carta). */
  posicao: number;
  nome: string;
  setor: string | null;
  dano: number;
  acertos: number;
  criticos: number;
  /** A vida máxima da rodada (para «quanto da vida dela foi seu»). */
  vidaMax: number;
  /** Quantas pessoas tiraram vida dela na rodada. */
  participantes: number;
  /** Foi o golpe final. */
  golpeFinal: boolean;
  /** Quando ela caiu. */
  quando: Date | null;
}

/**
 * O recorte da foto na janela (o editor da carta ajusta): `zoom` 1 = a foto
 * cobre a janela inteira; `px`/`py` de 0 a 1 = que parte da foto sobra à
 * vista quando ela é maior que a janela (0 = a borda esquerda/de cima, 1 = a
 * direita/de baixo), como o `object-position` do CSS.
 */
export interface Enquadramento {
  zoom: number;
  px: number;
  py: number;
}

/** O padrão: centrada, e mais de cima (rosto costuma ficar no alto da foto). */
export const ENQUADRAMENTO_PADRAO: Enquadramento = { zoom: 1, px: 0.5, py: 0.3 };
export const ZOOM_MAXIMO = 4;

/** A janela da foto na carta (px da carta). */
export const JANELA = { x: (LARGURA_CARTA - 520) / 2 + 10, y: 214, w: 520, h: 584 } as const;

/** O tamanho da foto desenhada na janela com esse zoom. */
export function tamanhoDaFoto(foto: { naturalWidth: number; naturalHeight: number }, zoom: number): { dw: number; dh: number } {
  const s = Math.max(JANELA.w / foto.naturalWidth, JANELA.h / foto.naturalHeight) * Math.min(Math.max(zoom, 1), ZOOM_MAXIMO);
  return { dw: foto.naturalWidth * s, dh: foto.naturalHeight * s };
}

export interface Metal {
  nome: string;
  sombra: string;
  meio: string;
  base: string;
  luz: string;
  brilho: string;
  /** O texto em cima da fita do nome. */
  textoFita: string;
  sombraFita: string;
}

const OURO: Metal = {
  nome: 'Ouro', sombra: '#4a2c00', meio: '#b87800', base: '#f0b400', luz: '#ffe88a', brilho: '#fff6c8',
  textoFita: '#3a2200', sombraFita: '#ffe88a',
};
const DIAMANTE: Metal = {
  nome: 'Diamante', sombra: '#0b3f4a', meio: '#1f9fb0', base: '#4fe0e8', luz: '#b8fbff', brilho: '#eaffff',
  textoFita: '#06303a', sombraFita: '#b8fbff',
};
const ESMERALDA: Metal = {
  nome: 'Esmeralda', sombra: '#063d1a', meio: '#109a3e', base: '#2fd860', luz: '#a8ffbf', brilho: '#e6ffee',
  textoFita: '#043014', sombraFita: '#a8ffbf',
};
const AMETISTA: Metal = {
  nome: 'Ametista', sombra: '#2a0650', meio: '#6a24b0', base: '#9d4ee8', luz: '#dcb6ff', brilho: '#f5e8ff',
  textoFita: '#ffffff', sombraFita: '#2a0650',
};

/** Do 11º em diante: o cobre do jogo. */
const COBRE: Metal = {
  nome: 'Cobre', sombra: '#4a2210', meio: '#a8532c', base: '#e07a4a', luz: '#ffb98f', brilho: '#ffe3d2',
  textoFita: '#3a1606', sombraFita: '#ffb98f',
};

export function metalDaPosicao(posicao: number): Metal {
  if (posicao > TOPO_CARTA) return COBRE;
  return posicao === 1 ? OURO : posicao === 2 ? DIAMANTE : posicao === 3 ? ESMERALDA : AMETISTA;
}

/** O título de cada lugar (a conquista da placa). Sem gênero: serve para todo mundo. */
export const TITULOS: readonly string[] = [
  'Pesadelo da Bruxa',
  'Terror do Pântano',
  'Mira de Esmeralda',
  'Fúria Encantada',
  'Quebra-Garrafas',
  'Golpe Certeiro',
  'Coragem de Ferro',
  'Alma do Pântano',
  'Chuva de Feitiços',
  'Lenda do Top 10',
];

/** Do 11º em diante, os títulos se revezam (também sem gênero). */
export const TITULOS_DEPOIS: readonly string[] = [
  'Coragem no Pântano',
  'Mira Afiada',
  'Faísca de Redstone',
  'Escudo de Ferro',
  'Veneno no Ar',
  'Olho da Aranha',
  'Força da Lua',
  'Eco do Pântano',
];

export function tituloDaPosicao(posicao: number): string {
  if (posicao > TOPO_CARTA) return TITULOS_DEPOIS[(posicao - TOPO_CARTA - 1) % TITULOS_DEPOIS.length];
  return TITULOS[Math.max(posicao, 1) - 1];
}

/** Quanto da vida máxima foi dela, em % com uma casa (nunca passa de 100). */
export function parteDaVida(dano: number, vidaMax: number): string {
  if (vidaMax <= 0) return '—';
  const p = Math.min(100, (dano / vidaMax) * 100);
  return `${p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function dataDaCarta(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * O nome do arquivo, com o lugar na frente e o nome da pessoa como está no
 * cadastro: «03 - Maria Silva.png». O lugar leva zeros à esquerda pela
 * quantidade de gente, para a pasta ordenar certo (01…25, 001…120). Tira só
 * o que o Windows não aceita em nome de arquivo.
 */
export function nomeDoArquivo(d: Pick<DadosDaCarta, 'posicao' | 'nome' | 'participantes'>): string {
  const casas = Math.max(2, String(Math.max(d.participantes, d.posicao)).length);
  const visivel = [...d.nome].filter(ch => ch.charCodeAt(0) >= 32).join('');
  const nome = visivel.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Sem nome';
  return `${String(d.posicao).padStart(casas, '0')} - ${nome}.png`;
}

// ── Fontes e foto ─────────────────────────────────────────────────────────────

/** Declara e baixa as fontes da carta (canvas não espera fonte sozinho). */
export async function prepararFontes(): Promise<void> {
  carregarFonte();
  carregarFontesPixel();
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    document.fonts.load('500 64px "Pixelify Sans"'),
    document.fonts.load('64px "Press Start 2P"'),
    document.fonts.load('64px "Creepster"'),
  ]).catch((): void => undefined);
}

/**
 * A foto do perfil pronta para o canvas. Com `crossOrigin` para o PNG poder
 * sair (o balde `perfis` é público e libera). Sem foto ou com erro: `null`, e
 * a carta desenha as iniciais.
 */
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

export type Ctx = CanvasRenderingContext2D;

const W = LARGURA_CARTA, H = ALTURA_CARTA;
/** O pixel da moldura e dos enfeites. */
const U = 6;
/** Onde começa o miolo (dentro da moldura). */
const M = 36;

export const PIXEL = '"Pixelify Sans", "Press Start 2P", monospace';
export const ARCADE = '"Press Start 2P", "Pixelify Sans", monospace';
export const TERROR = '"Creepster", "Pixelify Sans", cursive';

export function novoCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/** Retângulo com os cantos em degrau (n degraus de d px), o canto da carta. */
export function degraus(c: Ctx, x: number, y: number, w: number, h: number, d: number, n: number, cor: string): void {
  c.fillStyle = cor;
  for (let k = 0; k <= n; k++) c.fillRect(x + k * d, y + (n - k) * d, w - 2 * k * d, h - 2 * (n - k) * d);
}

export function caminhoDegraus(x: number, y: number, w: number, h: number, d: number, n: number): Path2D {
  const p = new Path2D();
  for (let k = 0; k <= n; k++) p.rect(x + k * d, y + (n - k) * d, w - 2 * k * d, h - 2 * (n - k) * d);
  return p;
}

/** A janela em arco (o topo é meia-lua em degraus de `passo`). */
function caminhoArco(x: number, y: number, w: number, h: number, passo: number): Path2D {
  const r = w / 2, cx = x + r, p = new Path2D();
  for (let k = 0; k * passo < r; k++) {
    const meio = k * passo + passo / 2;
    const dist = r - meio;
    const meia = Math.min(r, Math.ceil(Math.sqrt(Math.max(0, r * r - dist * dist)) / passo) * passo);
    p.rect(cx - meia, y + k * passo, meia * 2, passo + 1);
  }
  p.rect(x, y + r, w, h - r);
  return p;
}

/** Um item do jogo ampliado em escala inteira, sem borrar. */
export function item(c: Ctx, it: Item, x: number, y: number, escala: number, espelhar = false): void {
  const img = miniatura(it)[espelhar ? 1 : 0];
  c.imageSmoothingEnabled = false;
  c.drawImage(img, Math.round(x), Math.round(y), img.width * escala, img.height * escala);
}

/** Um halo redondo em blocos, em anéis cada vez mais fracos (luz sem degradê). */
export function halo(c: Ctx, cx: number, cy: number, raio: number, cor: string, alfa: number, b = U): void {
  c.save();
  c.fillStyle = cor;
  for (const [f, a] of [[1, 0.35], [0.72, 0.6], [0.45, 1]] as const) {
    c.globalAlpha = alfa * a;
    const r = raio * f;
    for (let y = -r; y <= r; y += b) for (let x = -r; x <= r; x += b) {
      if (x * x + y * y <= r * r) c.fillRect(Math.round((cx + x) / b) * b, Math.round((cy + y) / b) * b, b, b);
    }
  }
  c.restore();
}

/** O canvas pintado de uma cor só, no formato dele (o contorno e o brilho). */
export function silhueta(src: HTMLCanvasElement, cor: string): HTMLCanvasElement {
  const cv = novoCanvas(src.width, src.height);
  const c = cv.getContext('2d')!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = cor;
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

/** Desenha um canvas de pixel ampliado com contorno e aura em volta. */
export function comAura(c: Ctx, src: HTMLCanvasElement, x: number, y: number, s: number, contorno: string, aura: string | null): void {
  c.imageSmoothingEnabled = false;
  const w = src.width * s, h = src.height * s;
  if (aura) {
    const a = silhueta(src, aura);
    c.save();
    for (const [raio, alfa] of [[4, 0.12], [3, 0.18], [2, 0.26]] as const) {
      c.globalAlpha = alfa;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        c.drawImage(a, x + dx * raio * s, y + dy * raio * s, w, h);
      }
    }
    c.restore();
  }
  const sil = silhueta(src, contorno);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(sil, x + dx * s, y + dy * s, w, h);
  c.drawImage(src, x, y, w, h);
}

/** A estrelinha de 4 pontas do brilho (em pixel). */
export function brilho(c: Ctx, x: number, y: number, b: number, cor: string, alfa = 1): void {
  c.save();
  c.globalAlpha = alfa;
  c.fillStyle = cor;
  c.fillRect(x - b / 2, y - b * 2.5, b, b * 5);
  c.fillRect(x - b * 2.5, y - b / 2, b * 5, b);
  c.fillStyle = '#ffffff';
  c.fillRect(x - b / 2, y - b / 2, b, b);
  c.restore();
}

/** O maior tamanho de fonte (até `max`) em que o texto cabe na largura. */
export function caber(c: Ctx, texto: string, molde: (px: number) => string, max: number, largura: number, min = 12): number {
  for (let px = max; px > min; px -= 2) {
    c.font = molde(px);
    if (c.measureText(texto).width <= largura) return px;
  }
  c.font = molde(min);
  return min;
}

export function textoComSombra(c: Ctx, texto: string, x: number, y: number, cor: string, sombra: string, d: number): void {
  c.fillStyle = sombra;
  c.fillText(texto, x + d, y + d);
  c.fillStyle = cor;
  c.fillText(texto, x, y);
}

/** Texto da fonte do Minecraft ampliado (escala inteira), centrado em `cx`. */
export function mc(c: Ctx, texto: string, cx: number, y: number, escala: number, cor: string, sombra: string, alinhar: 'centro' | 'esquerda' = 'centro'): number {
  const w = larguraTextoMC(texto);
  const x = alinhar === 'centro' ? Math.round(cx - (w * escala) / 2) : Math.round(cx);
  c.save();
  c.translate(x, Math.round(y));
  c.scale(escala, escala);
  escreverMC(c, texto, 0, 0, cor, sombra);
  c.restore();
  return w * escala;
}

/** Quebra o texto em linhas da fonte do jogo (largura em pixels da fonte). */
export function quebrarMC(texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/)) {
    const tenta = atual ? `${atual} ${palavra}` : palavra;
    if (larguraTextoMC(tenta) > largura && atual) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tenta;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const [a, b] = [partes[0], partes.length > 1 ? partes[partes.length - 1] : ''];
  return (a[0] + (b[0] ?? '')).toUpperCase();
}

// ── As camadas da carta ──────────────────────────────────────────────────────

/** A moldura de metal com relevo, os cantos em degrau e as gemas nos lados. */
function moldura(c: Ctx, m: Metal): void {
  const d = 8, n = 3;
  degraus(c, 0, 0, W, H, d, n, '#05030a');
  degraus(c, U, U, W - U * 2, H - U * 2, d, n, m.meio);
  degraus(c, U, U, W - U * 3, H - U * 3, d, n, m.luz);
  degraus(c, U * 2, U * 2, W - U * 4, H - U * 4, d, n, m.base);
  // As riscas do metal escovado (pixel a pixel, sempre iguais).
  c.save();
  c.clip(caminhoDegraus(U * 2, U * 2, W - U * 4, H - U * 4, d, n));
  for (let y = U * 2; y < H; y += U) for (let x = U * 2; x < W; x += U) {
    const r = acaso(x, y, 7);
    if (r < 0.1) { c.fillStyle = m.luz; c.fillRect(x, y, U, U); }
    else if (r > 0.92) { c.fillStyle = m.meio; c.fillRect(x, y, U, U); }
  }
  c.restore();
  // O fio escuro de dentro.
  degraus(c, M - U, M - U, W - (M - U) * 2, H - (M - U) * 2, d, n - 1, '#05030a');
  // As gemas no meio de cada lado: a pedra verde do chapéu dela.
  const gema = (cx: number, cy: number) => {
    c.fillStyle = '#05030a';
    c.fillRect(cx - U * 2, cy - U * 3, U * 4, U * 6);
    c.fillRect(cx - U * 3, cy - U * 2, U * 6, U * 4);
    c.fillStyle = '#0c3a12';
    c.fillRect(cx - U, cy - U * 2, U * 2, U * 4);
    c.fillRect(cx - U * 2, cy - U, U * 4, U * 2);
    c.fillStyle = '#0b8a1a';
    c.fillRect(cx - U, cy - U, U * 2, U * 2);
    c.fillStyle = '#16c826';
    c.fillRect(cx - U, cy - U, U, U);
  };
  gema(W / 2, U * 3);
  gema(W / 2, H - U * 3);
  gema(U * 3, H / 2);
  gema(W - U * 3, H / 2);
}

/** O céu do pântano: faixas com pontilhado entre elas, estrelas e a lua atrás da foto. */
function ceu(c: Ctx, m: Metal, foco: { x: number; y: number }): void {
  const faixas = ['#04080a', '#060d0c', '#08130f', '#0a1912', '#0d2016', '#10271a', '#132f1e', '#163722', '#1a3f26'];
  const alto = Math.ceil((H - M * 2) / faixas.length / U) * U;
  faixas.forEach((cor, i) => {
    c.fillStyle = cor;
    c.fillRect(M, M + i * alto, W - M * 2, alto + U);
    // O pontilhado da troca de faixa (o degradê do jogo, sem degradê).
    if (i > 0) {
      c.fillStyle = faixas[i - 1];
      const y = M + i * alto;
      for (let x = M; x < W - M; x += U * 2) c.fillRect(x + ((x / U / 2) % 2 ? U : 0), y, U, U);
    }
  });

  // Os raios atrás da janela, na cor do metal.
  c.save();
  c.translate(foco.x, foco.y);
  for (let i = 0; i < 18; i++) {
    c.rotate((Math.PI * 2) / 18);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-70, -1100);
    c.lineTo(70, -1100);
    c.closePath();
    c.fillStyle = m.luz;
    c.globalAlpha = i % 2 ? 0.035 : 0.07;
    c.fill();
  }
  c.restore();

  // Estrelas: quadradinhos de 1 pixel e alguns brilhos de 4 pontas.
  for (let i = 0; i < 90; i++) {
    const x = M + acaso(i, 1, 3) * (W - M * 2), y = M + acaso(i, 2, 3) * 820;
    const r = acaso(i, 3, 3);
    c.fillStyle = r > 0.8 ? m.brilho : '#ffffff';
    c.globalAlpha = 0.25 + r * 0.6;
    const t = r > 0.93 ? U : U / 2;
    c.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, t, t);
  }
  c.globalAlpha = 1;

  // A lua cheia, em blocos, logo atrás do arco da foto: vira auréola.
  const b = U * 2, R = 300, lx = foco.x, ly = foco.y - 210;
  for (const [extra, alfa] of [[72, 0.05], [48, 0.08], [24, 0.12]] as const) {
    c.fillStyle = '#c8f0a0';
    c.globalAlpha = alfa;
    for (let y = -R - extra; y <= R + extra; y += b) for (let x = -R - extra; x <= R + extra; x += b) {
      if (x * x + y * y <= (R + extra) ** 2) c.fillRect(lx + x, ly + y, b, b);
    }
  }
  c.globalAlpha = 1;
  for (let y = -R; y <= R; y += b) for (let x = -R; x <= R; x += b) {
    const dd = x * x + y * y;
    if (dd > R * R) continue;
    const borda = dd > (R - b * 2) ** 2;
    const cratera = [[-90, -60, 70], [110, 40, 50], [-20, 120, 60], [60, -150, 36], [-160, 70, 30]]
      .some(([cx, cy, cr]) => (x - cx) ** 2 + (y - cy) ** 2 <= cr * cr);
    c.fillStyle = borda ? '#b9cf8c' : cratera ? (acaso(x, y, 5) > 0.5 ? '#bed49a' : '#b3c98c') : (acaso(x, y, 9) > 0.85 ? '#e9f4cc' : '#dbe9b6');
    c.fillRect(lx + x, ly + y, b, b);
  }
}

/** O pântano lá embaixo: a água com reflexo, a névoa, as vitórias-régias e as taboas. */
function pantano(c: Ctx, topo: number): void {
  const fundo = H - M;
  c.fillStyle = '#071a17';
  c.fillRect(M, topo, W - M * 2, fundo - topo);
  for (let i = 0; i < 70; i++) {
    const x = M + acaso(i, 11, 2) * (W - M * 2), y = topo + U * 2 + acaso(i, 12, 2) * (fundo - topo - U * 4);
    c.fillStyle = acaso(i, 13, 2) > 0.6 ? '#1d5a48' : '#123c32';
    c.fillRect(Math.round(x / U) * U, Math.round(y / U) * U, U * (3 + Math.floor(acaso(i, 14, 2) * 6)), U);
  }
  // A beirada com mato.
  for (let x = M; x < W - M; x += U) {
    const alto = 1 + Math.floor(acaso(x, 21, 2) * 3);
    c.fillStyle = acaso(x, 22, 2) > 0.5 ? '#0f3a1c' : '#0b2d16';
    c.fillRect(x, topo - alto * U, U, alto * U);
  }
  // Vitórias-régias.
  const regia = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y += U) for (let x = -r * 2; x <= r * 2; x += U) {
      if ((x / 2) ** 2 + y * y > r * r) continue;
      if (x > 0 && Math.abs(y) < U && x > r * 0.4) continue; // o corte da folha
      c.fillStyle = y < 0 && x < 0 ? '#4fa63a' : (acaso(x + cx, y + cy, 4) > 0.8 ? '#3a8a30' : '#2f7a2a');
      c.fillRect(cx + x, cy + y, U, U);
    }
  };
  regia(150, topo + 70, 24);
  regia(320, topo + 150, 18);
  regia(930, topo + 110, 22);
  regia(780, topo + 210, 16);
  // As taboas dos cantos.
  const taboa = (x: number, base: number, alto: number) => {
    c.fillStyle = '#0d2a12';
    c.fillRect(x, base - alto, U, alto);
    c.fillStyle = '#5a3a1a';
    c.fillRect(x - U / 2, base - alto, U * 2, U * 6);
    c.fillStyle = '#7a5226';
    c.fillRect(x - U / 2, base - alto, U, U * 3);
  };
  [[60, 180], [84, 230], [108, 160], [972, 200], [996, 250], [1020, 170]].forEach(([x, a]) => taboa(x, topo + 40, a));
  // A névoa verde por cima (faixas soltas, transparentes).
  for (let i = 0; i < 14; i++) {
    const y = topo - 60 + acaso(i, 31, 2) * 180, x = M + acaso(i, 32, 2) * (W - M * 2) - 200;
    c.fillStyle = '#7dff9a';
    c.globalAlpha = 0.035 + acaso(i, 33, 2) * 0.04;
    c.fillRect(Math.round(x / U) * U, Math.round(y / U) * U, 240 + acaso(i, 34, 2) * 360, U * (2 + Math.floor(acaso(i, 35, 2) * 4)));
  }
  c.globalAlpha = 1;
}

/** A janela em arco com a foto (ou as iniciais), a moldura e a pedra do topo. */
function janela(c: Ctx, m: Metal, foto: HTMLImageElement | null, enq: Enquadramento, nome: string, x: number, y: number, w: number, h: number): void {
  const p = 6;
  for (const [e, cor] of [[30, '#05030a'], [24, m.luz], [18, m.base], [10, m.meio], [5, '#05030a']] as const) {
    c.fillStyle = cor;
    c.fill(caminhoArco(x - e, y - e, w + e * 2, h + e * 2, p));
  }
  // As riscas do metal da janela.
  c.save();
  c.clip(caminhoArco(x - 18, y - 18, w + 36, h + 36, p));
  for (let yy = y - 24; yy < y + h + 24; yy += U) for (let xx = x - 24; xx < x + w + 24; xx += U) {
    const r = acaso(xx, yy, 17);
    if (r < 0.08) { c.fillStyle = m.luz; c.fillRect(xx, yy, U, U); }
  }
  c.restore();

  const area = caminhoArco(x, y, w, h, p);
  c.save();
  c.clip(area);
  c.fillStyle = '#0b1a12';
  c.fillRect(x, y, w, h);
  if (foto) {
    const { dw, dh } = tamanhoDaFoto(foto, enq.zoom);
    const lim = (v: number) => Math.min(1, Math.max(0, v));
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(foto, x + (w - dw) * lim(enq.px), y + (h - dh) * lim(enq.py), dw, dh);
  } else {
    // Sem foto: as iniciais grandes num fundo de musgo.
    for (let yy = y; yy < y + h; yy += U * 2) for (let xx = x; xx < x + w; xx += U * 2) {
      const r = acaso(xx, yy, 23);
      c.fillStyle = r > 0.7 ? '#12301c' : r > 0.4 ? '#0f2918' : '#0d2315';
      c.fillRect(xx, yy, U * 2, U * 2);
    }
    const ini = iniciais(nome);
    caber(c, ini, px => `500 ${px}px ${PIXEL}`, 260, w - 80);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    textoComSombra(c, ini, x + w / 2, y + h * 0.52, m.luz, '#05030a', 12);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }
  // A névoa do pântano subindo pela foto e o escuro das bordas (faixas, sem degradê).
  const nevoa = [[0.06, 160], [0.08, 110], [0.12, 66], [0.16, 30]] as const;
  for (const [alfa, alto] of nevoa) {
    c.fillStyle = '#0c3a1e';
    c.globalAlpha = alfa;
    c.fillRect(x, y + h - alto, w, alto);
  }
  for (const [alfa, borda] of [[0.18, U * 4], [0.22, U * 2], [0.3, U]] as const) {
    c.globalAlpha = alfa;
    c.fillStyle = '#000000';
    c.fillRect(x, y, borda, h);
    c.fillRect(x + w - borda, y, borda, h);
  }
  c.globalAlpha = 1;
  c.restore();

  // A pedra no alto do arco (a do chapéu dela, grande).
  const cx = x + w / 2, cy = y - 22, b = U;
  const losango = (r: number, cor: string) => {
    c.fillStyle = cor;
    for (let k = -r; k <= r; k++) c.fillRect(cx - (r - Math.abs(k)) * b - b / 2, cy + k * b - b / 2, ((r - Math.abs(k)) * 2 + 1) * b, b);
  };
  losango(6, '#05030a');
  losango(5, m.luz);
  losango(4, '#0c3a12');
  losango(3, '#0b8a1a');
  c.fillStyle = '#16c826';
  c.fillRect(cx - b * 2.5, cy - b * 1.5, b * 2, b);
  c.fillRect(cx - b * 1.5, cy - b * 2.5, b, b);
  c.fillStyle = '#c8ffd0';
  c.fillRect(cx - b * 1.5, cy - b * 1.5, b, b);
}

/** O medalhão da posição, no canto de cima da janela. */
function medalhao(c: Ctx, m: Metal, posicao: number, cx: number, cy: number): void {
  const w = 190, h = 214, x = cx - w / 2, y = cy - h / 2;
  // O escudo: retângulo em degraus com a ponta embaixo.
  const escudo = (e: number, cor: string) => {
    degraus(c, x - e, y - e, w + e * 2, h * 0.72 + e * 2, 8, 3, cor);
    c.fillStyle = cor;
    const base = y + h * 0.72 + e, meia = w / 2 + e;
    for (let k = 0; k * U < meia; k++) c.fillRect(cx - meia + k * U, base - U, (meia - k * U) * 2, U * 1.2 + (k === 0 ? 0 : U * 0.8));
    for (let k = 0; k * U < meia; k++) c.fillRect(cx - meia + k * U, base + k * U * 0.9 - U, (meia - k * U) * 2, U);
  };
  escudo(12, '#05030a');
  escudo(6, m.luz);
  escudo(0, m.base);
  escudo(-10, m.meio);
  escudo(-16, m.sombra);
  // As faíscas no metal.
  brilho(c, x + 20, y + 18, U, m.brilho, 0.9);
  brilho(c, x + w - 22, y + h * 0.62, U * 0.66, m.brilho, 0.8);

  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = `${posicao > TOPO_CARTA ? 22 : 26}px ${ARCADE}`;
  textoComSombra(c, posicao > TOPO_CARTA ? 'LUGAR' : 'TOP', cx, y + 56, m.luz, '#05030a', 3);
  const num = String(posicao);
  const [tam, desce] = num.length === 1 ? [96, 162] : num.length === 2 ? [64, 152] : [44, 142];
  c.font = `${tam}px ${ARCADE}`;
  textoComSombra(c, num, cx + (num.length === 1 ? 6 : 4), y + desce, '#ffffff', '#05030a', num.length > 2 ? 5 : 7);
  c.textAlign = 'left';
}

/**
 * A bruxa de pé ao lado da janela, de braços cruzados, como no jogo (o
 * primeiro quadro). Sem garrafa na mão: pedido do Kauan, 19/10/2026.
 */
function bruxa(c: Ctx, x: number, y: number, s: number): { largura: number; altura: number } {
  const img = canvasDaImagem(montarBruxaMC(0, 0), true);
  // A luz roxa atrás dela: o chapéu preto não some no céu escuro.
  halo(c, x + (img.width * s) / 2, y + (img.height * s) * 0.26, 200, '#7a2fd0', 0.5);
  // A fumaça roxa da ponta do chapéu.
  const px = x + (img.width - PONTA_DO_CHAPEU.x * PIXEL_MC) * s, py = y + PONTA_DO_CHAPEU.y * PIXEL_MC * s;
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    c.fillStyle = acaso(i, 41, 2) > 0.5 ? '#8b3fd1' : '#5e2c74';
    c.globalAlpha = 0.85 - t * 0.7;
    const q = U * (1 + Math.round(acaso(i, 42, 2)));
    c.fillRect(px + 40 * t + Math.sin(i) * 18, py - 30 - t * 200, q, q);
  }
  c.globalAlpha = 1;
  comAura(c, img, x, y, s, '#0d0a12', '#9a4dff');
  // As faíscas roxas em volta dela.
  brilho(c, x - 10, y + 120, U, '#dcb6ff', 0.9);
  brilho(c, x + img.width * s + 4, y + 210, U * 0.66, '#dcb6ff', 0.8);
  brilho(c, x + 20, y + 330, U * 0.66, '#ffffff', 0.7);
  return { largura: img.width * s, altura: img.height * s };
}

/** As poções e os drops flutuando do outro lado. */
function flutuantes(c: Ctx, m: Metal): void {
  const cores = ['#f82423', '#2e5299', '#f9a72b', '#8932b8'];
  const pos: [number, number, number][] = [[64, 420, 5], [152, 530, 4], [66, 630, 5], [160, 730, 4]];
  pos.forEach(([x, y, s], i) => {
    const it: Item = { nome: 'Poção', linhas: GARRAFA, cores: coresDaPocao(cores[i]) };
    halo(c, x + 8 * s, y + 9 * s, 13 * s, cores[i], 0.45);
    comAura(c, miniatura(it)[i % 2], x, y, s, '#0d0a12', null);
  });
  item(c, REDSTONE_MC, 182, 452, 3);
  brilho(c, 140, 410, U, m.brilho, 0.9);
  brilho(c, 236, 680, U * 0.66, m.brilho, 0.8);
  brilho(c, 54, 590, U * 0.66, '#ffffff', 0.7);
}

/** A fita do nome, com as pontas dobradas. */
function fita(c: Ctx, m: Metal, nome: string, setor: string | null, cy: number): void {
  const w = 780, h = 104, x = (W - w) / 2, y = cy - h / 2;
  // As pontas dobradas, atrás, com o corte em V (linha a linha, em pixel).
  const linhas = 16, ty = y + 26, tw = 120;
  for (const lado of [-1, 1]) {
    const px = lado < 0 ? x - 76 : x + w - 44;
    for (const [borda, cor] of [[1, '#05030a'], [0, m.meio]] as const) {
      for (let r = -borda; r < linhas + borda; r++) {
        const meio = (linhas - 1) / 2;
        const corte = Math.round(Math.max(0, 1 - Math.abs(r - meio) / meio) * 6) * U - borda * U;
        const x0 = lado < 0 ? px + corte : px - borda * U;
        const x1 = lado < 0 ? px + tw + borda * U : px + tw - corte;
        c.fillStyle = cor;
        c.fillRect(x0, ty + r * U, x1 - x0, U);
      }
    }
    // A dobra: a sombra onde a ponta entra atrás da fita.
    c.fillStyle = m.sombra;
    c.fillRect(lado < 0 ? px + tw - U * 6 : px, ty, U * 6, linhas * U);
  }
  degraus(c, x, y, w, h, U, 2, '#05030a');
  degraus(c, x + U, y + U, w - U * 2, h - U * 2, U, 1, m.luz);
  degraus(c, x + U * 2, y + U * 2, w - U * 3, h - U * 3, U, 1, m.meio);
  degraus(c, x + U * 2, y + U * 2, w - U * 4, h - U * 4, U, 1, m.base);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  caber(c, nome, px => `500 ${px}px ${PIXEL}`, 62, w - 90, 26);
  textoComSombra(c, nome, W / 2, cy + 2, m.textoFita, m.sombraFita, 3);
  if (setor) {
    c.font = `500 26px ${PIXEL}`;
    const t = setor.toUpperCase().split('').join(' ');
    caber(c, t, px => `500 ${px}px ${PIXEL}`, 26, w - 120, 14);
    textoComSombra(c, t, W / 2, y + h + 34, m.luz, '#05030a', 2);
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

/** As quatro caixas de número, no estilo da dica de item do jogo (fundo escuro, borda roxa). */
function numeros(c: Ctx, m: Metal, d: DadosDaCarta, y: number): void {
  const caixas: [Item, string, string][] = [
    [REDSTONE_MC, d.dano.toLocaleString('pt-BR'), 'de dano'],
    [OLHO_MC, d.acertos.toLocaleString('pt-BR'), 'acertos'],
    [GLOWSTONE_MC, d.criticos.toLocaleString('pt-BR'), 'críticos'],
    [CORACAO_CHEIO_MC, parteDaVida(d.dano, d.vidaMax), 'da vida dela'],
  ];
  const w = 222, h = 124, gap = 14, x0 = (W - (w * 4 + gap * 3)) / 2;
  caixas.forEach(([it, valor, rotulo], i) => {
    const x = x0 + i * (w + gap);
    c.fillStyle = '#100010';
    c.globalAlpha = 0.94;
    c.fillRect(x, y, w, h);
    c.globalAlpha = 1;
    // A borda dupla da dica do jogo: clara em cima, escura embaixo.
    c.fillStyle = m.base;
    c.fillRect(x + U, y + U, w - U * 2, U / 2);
    c.fillRect(x + U, y + U, U / 2, h / 2 - U);
    c.fillRect(x + w - U * 1.5, y + U, U / 2, h / 2 - U);
    c.fillStyle = m.sombra;
    c.fillRect(x + U, y + h - U * 1.5, w - U * 2, U / 2);
    c.fillRect(x + U, y + h / 2, U / 2, h / 2 - U);
    c.fillRect(x + w - U * 1.5, y + h / 2, U / 2, h / 2 - U);
    c.fillStyle = '#05030a';
    c.fillRect(x - U / 2, y, U / 2, h);
    c.fillRect(x + w, y, U / 2, h);
    c.fillRect(x, y - U / 2, w, U / 2);
    c.fillRect(x, y + h, w, U / 2);

    const img = miniatura(it)[0];
    const s = Math.max(1, Math.floor(48 / Math.max(img.width, img.height)));
    item(c, it, x + 20 + (48 - img.width * s) / 2, y + 22 + (48 - img.height * s) / 2, s);
    c.textBaseline = 'middle';
    // Press Start nos números: no Pixelify o 5 e o 9 parecem S.
    caber(c, valor, px => `${px}px ${ARCADE}`, 30, w - 96, 14);
    textoComSombra(c, valor, x + 80, y + 50, '#ffffff', '#3f3f3f', 3);
    c.textBaseline = 'alphabetic';
    mc(c, rotulo, x + 20, y + 86, 2, '#c6c6c6', '#3f3f3f', 'esquerda');
  });
}

/** O carimbo do golpe final, torto em cima da foto. */
function carimbo(c: Ctx, cx: number, cy: number): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(-0.12);
  const w = 330, h = 78;
  c.fillStyle = '#05030a';
  c.fillRect(-w / 2 - U, -h / 2 - U, w + U * 2, h + U * 2);
  c.fillStyle = '#ff5555';
  c.fillRect(-w / 2, -h / 2, w, h);
  c.fillStyle = '#aa0000';
  c.fillRect(-w / 2 + U, -h / 2 + U, w - U * 2, h - U * 2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `26px ${ARCADE}`;
  textoComSombra(c, 'GOLPE FINAL', 0, 3, '#ffffff', '#3f0000', 3);
  c.restore();
}

/**
 * A carta inteira. `foto` já carregada (`carregarFoto`) e fontes prontas
 * (`prepararFontes`): o canvas não espera nada.
 */
export function desenharCarta(d: DadosDaCarta, foto: HTMLImageElement | null, enq: Enquadramento = ENQUADRAMENTO_PADRAO): HTMLCanvasElement {
  const cv = novoCanvas(W, H);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const m = metalDaPosicao(d.posicao);

  // A janela da foto.
  const { x: jx, y: jy, w: jw, h: jh } = JANELA;
  const doTopo = d.posicao <= TOPO_CARTA;

  moldura(c, m);
  c.save();
  c.clip(caminhoDegraus(M, M, W - M * 2, H - M * 2, 8, 2));
  ceu(c, m, { x: jx + jw / 2, y: jy + jh / 2 });
  pantano(c, 800);
  // A teia nos cantos de cima.
  c.globalAlpha = 0.5;
  item(c, TEIA_MC, M, M, 6);
  item(c, TEIA_MC, W - M - 16 * 6, M, 6, true);
  c.globalAlpha = 1;

  // O título no alto, na fonte do jogo.
  mc(c, doTopo ? 'Top 10 - Caça às Bruxas - Halloween 2026' : 'Caça às Bruxas - Halloween 2026', W / 2, 58, 3, m.luz, '#05030a');
  const escala = Math.min(6, Math.floor(820 / larguraTextoMC(NOME_CHEFONA)));
  mc(c, NOME_CHEFONA, W / 2, 96, escala, '#80ff20', '#1f3f08');

  flutuantes(c, m);
  janela(c, m, foto, enq, d.nome, jx, jy, jw, jh);
  bruxa(c, 806, 388, 5);
  medalhao(c, m, d.posicao, 172, 290);
  if (d.golpeFinal) carimbo(c, jx + jw / 2, jy + jh - 56);

  // A metade de baixo: um véu escuro por cima do pântano, e o que a carta diz.
  c.fillStyle = '#030605';
  c.globalAlpha = 0.6;
  c.fillRect(M, 940, W - M * 2, H - M - 940);
  c.globalAlpha = 1;
  fita(c, m, d.nome, d.setor, 862);
  numeros(c, m, d, 984);

  // A placa de conquista do jogo, com o título do lugar.
  const placa = desenharPlaca(
    {
      titulo: 'Desafio concluído!',
      nome: tituloDaPosicao(d.posicao),
      // A fonte do jogo não tem «º».
      descricao: doTopo ? `Top ${d.posicao} contra a ${NOME_CHEFONA}` : `Ajudou a derrubar a ${NOME_CHEFONA}`,
      raridade: d.posicao === 1 ? '★ Raridade lendária ★' : '★ Raridade épica ★',
    },
    miniatura(TOTEM_MC)[0],
  );
  const ps = Math.min(3, Math.floor(860 / placa.width));
  const yp = 1122;
  c.imageSmoothingEnabled = false;
  c.drawImage(placa, Math.round((W - placa.width * ps) / 2), yp, placa.width * ps, placa.height * ps);

  // O agradecimento.
  const yt = yp + placa.height * ps + 18;
  c.textAlign = 'center';
  caber(c, 'Obrigado por fazer parte de um evento único!', px => `${px}px ${TERROR}`, 48, W - 140, 30);
  textoComSombra(c, 'Obrigado por fazer parte de um evento único!', W / 2, yt + 32, '#80ff20', '#05030a', 3);
  c.textAlign = 'left';
  const frase = `A ${NOME_CHEFONA} caiu, e o seu nome ficou na história: ${doTopo ? 'top' : 'lugar'} ${d.posicao} entre ${d.participantes} pessoas na caçada.`;
  quebrarMC(frase, Math.floor((W - 200) / 3)).forEach((l, i) => mc(c, l, W / 2, yt + 48 + i * 30, 3, '#d6e4cf', '#05030a'));

  // O rodapé.
  c.font = `13px ${ARCADE}`;
  c.fillStyle = m.luz;
  c.globalAlpha = 0.8;
  c.textAlign = 'left';
  const casas = Math.max(2, String(d.participantes).length);
  c.fillText(`Nº ${String(d.posicao).padStart(casas, '0')}/${String(Math.max(d.participantes, d.posicao)).padStart(casas, '0')}`, M + 30, H - M - 12);
  c.textAlign = 'right';
  c.fillText(`${m.nome.toUpperCase()}${d.quando ? `  ·  ${dataDaCarta(d.quando)}` : ''}`, W - M - 30, H - M - 12);
  c.globalAlpha = 1;
  c.textAlign = 'left';
  c.restore();
  return cv;
}
