// Medidas fixas do app «de mentira» e da janela que o mostra.
//
// O app é desenhado em 1600×874 (o tamanho de uma tela de computador, como o
// app real roda) e reduzido para caber na janela do vídeo. Onde cada coisa
// clicável fica NÃO é escrito aqui à mão: `npm run medir` tira as posições do
// próprio desenho (os elementos com `data-alvo`) e grava `alvos.json`.

export const APP_L = 1600;
export const APP_A = 874;

/** Larguras e alturas do `Layout.tsx` real. */
export const SIDEBAR = 240;
export const CABECALHO = 56;
/** Bloco do logo no menu: py-5 + logo de 32 px + borda. */
export const LOGO_ALTURA = 73;
/** Item do menu: py-2.5 + linha de 20 px, mais o space-y-0.5. */
export const MENU_PASSO = 42;
/** Topo do primeiro item do menu (dentro do menu lateral). */
export const MENU_TOPO = LOGO_ALTURA + 12;

export type IdMenu = 'dashboard' | 'chips' | 'acordos' | 'novo' | 'lixeira' | 'analitico' | 'campanhas';

// ── a janela na tela (1920×1080) ────────────────────────────────────────
/** Barra do navegador, em px da tela. */
export const BARRA_NAV = 38;
export const JANELA = { x: 240, y: 196, l: 1440 };
export const ESCALA_JANELA = JANELA.l / APP_L;
export const JANELA_A = BARRA_NAV + Math.round(APP_A * ESCALA_JANELA);

// ── o ícone do app na cena 2 (tela) ─────────────────────────────────────
export const ICONE = { cx: 960, cy: 452, lado: 260, raio: 60 };
