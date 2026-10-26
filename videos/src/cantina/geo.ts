// Onde fica cada peça das telas da cantina. As medidas são FIXAS (cada bloco é
// desenhado com a altura daqui), então cursor, câmera, realces e balões miram
// em coordenadas conhecidas, sem `npm run medir` — como no vídeo do Pix.
//
// Coordenadas da área principal (o `<main>` do app: começa em x = 240, y = 56,
// depois do menu e do cabeçalho). `noApp` leva para as do app (1600×874),
// descontando a rolagem da página.

import { CABECALHO, MENU_PASSO, MENU_TOPO, SIDEBAR } from '../app/layout';
import { entre, ms, SUAVE_IDA_VOLTA } from '../movimento';
import { T } from './tempos';

export type Ret = { x: number; y: number; l: number; a: number };

export const X0 = 24;
export const L = 1312;

// ── a aba Cantina (quem pede) ───────────────────────────────────────────
export const HERO = { x: X0, y: 20, l: L, a: 352 };
/** A vitrine, dentro do cabeçalho (p-2.5). */
export const VITRINE = { x: X0 + L - 10 - 500, y: HERO.y + 10, l: 500, a: HERO.a - 20 };

/** A coluna do cardápio e a do carrinho (lg:grid-cols-[1fr_360px] gap-6). */
export const ESQ_L = 928;
export const CARRINHO_X = X0 + ESQ_L + 24;
export const CARRINHO_L = 360;
export const FILTROS = { x: X0, y: HERO.y + HERO.a + 20, l: ESQ_L, a: 86 };
export const CHIPS = { x: X0, y: FILTROS.y + 52, l: 330, a: 34 };

export const CARD_L = 298;
export const CARD_A = 330;
export const CARD_IMG = 186;
const GRADE_Y = FILTROS.y + FILTROS.a + 16;
export const card = (i: number): Ret => ({
  x: X0 + (i % 3) * (CARD_L + 17),
  y: GRADE_Y + Math.floor(i / 3) * (CARD_A + 16),
  l: CARD_L,
  a: CARD_A,
});
export const btnAdicionar = (i: number): Ret => {
  const c = card(i);
  return { x: c.x + CARD_L - 14 - 116, y: c.y + CARD_A - 14 - 40, l: 116, a: 40 };
};

/** O carrinho: as alturas de cada bloco (o desenho usa as mesmas). */
export const CART = {
  topo: FILTROS.y,
  /** p-4 */
  pad: 16,
  titulo: 28,
  linha: 82,
  faixas: 70,
  nota: 58,
  total: 44,
  botao: 48,
};
const cx = CARRINHO_X + CART.pad;
const cl = CARRINHO_L - 2 * CART.pad;
const yLinhas = CART.topo + CART.pad + CART.titulo + 12;
export const cartLinha = (i: number): Ret => ({ x: cx, y: yLinhas + i * (CART.linha + 8), l: cl, a: CART.linha });
const yFaixas = yLinhas + 2 * (CART.linha + 8) - 8 + 16 + 28;
const FAIXA_L = (cl - 3 * 6) / 4;
export const faixa = (i: number): Ret => ({ x: cx + (i % 4) * (FAIXA_L + 6), y: yFaixas + Math.floor(i / 4) * 38, l: FAIXA_L, a: 32 });
export const FAIXAS_BOX = { x: cx, y: yFaixas - 28, l: cl, a: 28 + CART.faixas };
const yNota = yFaixas + CART.faixas + 16;
const yTotal = yNota + CART.nota + 16;
export const TOTAL_CART = { x: cx, y: yTotal, l: cl, a: CART.total };
export const BTN_REVISAR = { x: cx, y: yTotal + CART.total + 16, l: cl, a: CART.botao };
export const CARRINHO_A = BTN_REVISAR.y + CART.botao + 16 + 16 + CART.pad - CART.topo;

/** O diálogo «Confirmar pedido» (centrado na tela do app, não na página). */
export const DIALOGO = { x: 800 - 224, y: 437 - 200, l: 448, a: 400 };
export const BTN_CONFIRMAR = { x: DIALOGO.x + DIALOGO.l - 24 - 150, y: DIALOGO.y + DIALOGO.a - 24 - 40, l: 150, a: 40 };
export const REGRAS = { x: DIALOGO.x + 24, y: DIALOGO.y + 222, l: DIALOGO.l - 48, a: 84 };

/** O pedido aberto, na gaveta da direita (coordenadas do app). */
export const GAVETA = { x: 1600 - 448, y: 0, l: 448, a: 874 };
export const LINHA_TEMPO = { x: GAVETA.x + 24, y: 104, l: GAVETA.l - 48, a: 64 };

// ── o Painel da Cantina (quem atende) ───────────────────────────────────
export const CAB_PAINEL = { x: X0, y: 20, l: L, a: 56 };
export const BTN_EXPORTAR = { x: X0 + L - 146, y: 30, l: 146, a: 36 };
export const PRODUCAO = { x: X0, y: 92, l: L, a: 80 };
export const QUADRO_Y = 188;
export const COLUNA_L = (L - 3 * 16) / 4;
export const coluna = (i: number): Ret => ({ x: X0 + i * (COLUNA_L + 16), y: QUADRO_Y, l: COLUNA_L, a: 818 - QUADRO_Y - 16 });
/** Onde começam os cartões dentro da coluna (p-2.5 + título). */
export const COLUNA_CORPO = 10 + 28 + 8;
export const CARTAO_L = COLUNA_L - 20;
export const FAIXA_ROTULO = 18;
/** Altura de um cartão da fila: com botão (em andamento) ou sem (encerrado). */
export const alturaCartao = (itens: number, comBotao: boolean) => 124 + 20 * itens + (comBotao ? 56 : 0);

// ── fora da área principal ──────────────────────────────────────────────
/** O item «Cantina» no menu de quem pede (coordenadas do app): o 9º, o último. */
export const MENU_CANTINA = { x: 8, y: MENU_TOPO + 8 * MENU_PASSO, l: SIDEBAR - 16, a: MENU_PASSO - 2 };

// ── rolagem da aba Cantina ──────────────────────────────────────────────
/** Quanto a página sobe para mostrar duas fileiras de cards. */
export const ROLA = 300;
export function rolagemEm(f: number) {
  const ida = (de: number, para: number, ini: number) => entre(f, ini, ini + ms(900), de, para, SUAVE_IDA_VOLTA);
  if (f < T.fotos) return 0;
  if (f < T.sobe) return ida(0, ROLA, T.fotos);
  if (f < T.pedido) return ida(ROLA, 0, T.sobe);
  return ida(0, ROLA, T.pedido);
}

/** Da área principal para o app, com a rolagem do frame. */
export function noApp(r: Ret, rolagem = 0): Ret {
  return { x: r.x + SIDEBAR, y: r.y + CABECALHO - rolagem, l: r.l, a: r.a };
}

/** O carrinho é `sticky top-4`: acompanha a página até encostar no topo. */
export const topoCarrinho = (rolagem: number) => Math.max(16 + rolagem, CART.topo);

export const centro = (r: Ret) => ({ x: r.x + r.l / 2, y: r.y + r.a / 2 });
