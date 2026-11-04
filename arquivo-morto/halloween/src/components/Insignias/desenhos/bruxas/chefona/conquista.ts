/**
 * conquista.ts — a PLACA de conquista épica de quem ajudou a derrubar a
 * chefona (pedido do Kauan, 15/10/2026: «algo foda igual do Minecraft
 * aparecendo achievement, a raridade épica; pode pegar referências do
 * mine/mods»).
 *
 * Antes era a toast pequena do canto (160 × 32). Agora é a placa grande no
 * alto da tela, como a do mod «Advancement Plaques», montada com as peças da
 * tela de conquistas do jogo (`texturasMC.ts`):
 *
 *   - a MOLDURA DE DESAFIO dourada (a de pontas, das conquistas difíceis) com
 *     o ícone dentro;
 *   - a barra DOURADA da conquista obtida, com o nome em branco;
 *   - a caixa escura embaixo: «Desafio concluído!» na cor dos desafios (§d),
 *     a descrição e a RARIDADE ÉPICA (o roxo claro das coisas épicas do jogo).
 *
 * Em volta, o que os mods fazem: raios girando atrás, o reflexo passando pela
 * placa e a explosão de estrelinhas (essas o palco solta). Só visual.
 */
import { NOME_CHEFONA, type Item } from './arte';
import { escreverMC, larguraTextoMC } from './fonteMC';
import { BARRA_CONQUISTA_MC, CAIXA_CONQUISTA_MC, MOLDURA_DESAFIO_MC } from './texturasMC';
import { miniatura } from '../pixels';

/** A cor dos desafios do jogo (§d) e a sombra dela; a da raridade épica é a mesma. */
export const COR_DESAFIO = '#ff55ff';
export const SOMBRA_DESAFIO = '#3f153f';
/** Quanto a placa fica na tela (ms). */
export const PLACA_MS = 7000;
/** Cada pixel da placa vira tantos px da tela (a escala da interface do jogo). */
export const ESCALA_PLACA = 3;

/**
 * A conquista de quem ajudou a derrubar a chefona (o desafio do Minecraft).
 * O álbum de insígnias (`Insignias/`) mostra a mesma placa no hover.
 */
export const CONQUISTA = {
  titulo: 'Desafio concluído!',
  nome: 'Quem Mandou Jogar Poção?',
  descricao: `Ajudou a derrubar a ${NOME_CHEFONA}`,
  raridade: '★ Raridade épica ★',
} as const;

export interface TextosDaPlaca {
  titulo: string;
  nome: string;
  descricao: string;
  raridade: string;
}

/** As caixas da tela de conquistas têm 3 px de margem vazia em cima e embaixo, e borda de 3. */
const MARGEM = 3;
const BORDA = 3;

/** Desenha a caixa do jogo esticada sem deformar os cantos (as 9 fatias). */
function fatiar(c: CanvasRenderingContext2D, it: Item, x: number, y: number, w: number, h: number): void {
  const img = miniatura(it)[0];
  const sw = img.width, sh = img.height - MARGEM * 2, b = BORDA;
  const sx = [0, b, sw - b], sl = [b, sw - b * 2, b];
  const sy = [MARGEM, MARGEM + b, MARGEM + sh - b], sa = [b, sh - b * 2, b];
  const dx = [x, x + b, x + w - b], dl = [b, w - b * 2, b];
  const dy = [y, y + b, y + h - b], da = [b, h - b * 2, b];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (dl[i] > 0 && da[j] > 0) c.drawImage(img, sx[i], sy[j], sl[i], sa[j], dx[i], dy[j], dl[i], da[j]);
  }
}

/** O tamanho da placa (px da interface), pelo texto mais comprido. */
export function tamanhoDaPlaca(t: TextosDaPlaca): { largura: number; altura: number } {
  const texto = Math.max(larguraTextoMC(t.nome) + 34, ...[t.titulo, t.descricao, t.raridade].map(s => larguraTextoMC(s) + 22));
  return { largura: Math.max(200, texto + 8), altura: 62 };
}

/** A placa em pixels da interface: a barra dourada, a caixa da descrição e a moldura com o ícone. */
export function desenharPlaca(t: TextosDaPlaca, icone: HTMLCanvasElement): HTMLCanvasElement {
  const { largura: W, altura: H } = tamanhoDaPlaca(t);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  // A caixa escura da descrição, embaixo, e a barra dourada por cima dela.
  fatiar(c, CAIXA_CONQUISTA_MC, 13, 16, W - 13, H - 16);
  fatiar(c, BARRA_CONQUISTA_MC, 13, 3, W - 13, 20);
  escreverMC(c, t.nome, 32, 9, '#ffffff', '#3f3f3f');
  escreverMC(c, t.titulo, 20, 26, COR_DESAFIO, SOMBRA_DESAFIO);
  escreverMC(c, t.descricao, 20, 37, '#c6c6c6', '#3f3f3f');
  escreverMC(c, t.raridade, 20, 48, COR_DESAFIO, SOMBRA_DESAFIO);
  // A moldura de desafio (26 × 26) na ponta da barra, com o ícone de 16 no meio.
  c.drawImage(miniatura(MOLDURA_DESAFIO_MC)[0], 0, 0);
  c.drawImage(icone, 5, 5);
  return cv;
}

/**
 * A placa pronta para a página: os raios girando atrás, o brilho, o canvas e
 * o reflexo que passa por cima. Some sozinha em `PLACA_MS` (quem chama tira
 * o elemento depois).
 */
export function montarPlaca(t: TextosDaPlaca, icone: HTMLCanvasElement): HTMLDivElement {
  const cv = desenharPlaca(t, icone);
  cv.className = 'bxc-placa-cv';
  const el = document.createElement('div');
  el.className = 'bxc-placa';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', `${t.titulo} ${t.nome}. ${t.descricao}. ${t.raridade}`);
  el.style.setProperty('--bxc-placa-w', `${cv.width * ESCALA_PLACA}px`);
  el.style.setProperty('--bxc-placa-ms', `${PLACA_MS}ms`);
  const raios = document.createElement('div');
  raios.className = 'bxc-placa-raios';
  const corpo = document.createElement('div');
  corpo.className = 'bxc-placa-corpo';
  const reflexo = document.createElement('div');
  reflexo.className = 'bxc-placa-reflexo';
  // O reflexo passa só por cima das caixas (a moldura de pontas fica de fora).
  reflexo.style.left = `${(13 / cv.width) * 100}%`;
  reflexo.style.top = `${(3 / cv.height) * 100}%`;
  corpo.append(cv, reflexo);
  el.append(raios, corpo);
  return el;
}
