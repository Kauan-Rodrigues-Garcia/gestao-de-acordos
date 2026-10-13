// Coordenadas do app «de mentira» (1600×900, a tela interna da janela).
// O cursor mira nestes pontos, então tudo que é clicável mora aqui.

export const APP_L = 1600;
export const APP_A = 900;

export const BARRA = 46; // barra do navegador
export const SIDEBAR = 250;
export const CABECALHO = 66;

export const CONTEUDO = {
  x: SIDEBAR + 32,
  y: BARRA + CABECALHO + 26,
  l: APP_L - SIDEBAR - 64,
  a: APP_A - BARRA - CABECALHO - 52,
};

export type IdMenu = 'inicio' | 'desempenho' | 'dashboard' | 'acordos' | 'novo' | 'campanhas' | 'calendario' | 'tickets';

export const MENU: { id: IdMenu; rotulo: string; icone: string }[] = [
  { id: 'inicio', rotulo: 'Início', icone: 'casa' },
  { id: 'desempenho', rotulo: 'Desempenho do Dia', icone: 'raio' },
  { id: 'dashboard', rotulo: 'Dashboard', icone: 'grade' },
  { id: 'acordos', rotulo: 'Acordos', icone: 'doc' },
  { id: 'novo', rotulo: 'Novo Acordo', icone: 'mais' },
  { id: 'campanhas', rotulo: 'Campanhas de WhatsApp', icone: 'enviar' },
  { id: 'calendario', rotulo: 'Calendário', icone: 'calendario' },
  { id: 'tickets', rotulo: 'Tickets', icone: 'ticket' },
];

export const MENU_Y0 = BARRA + 92;
export const MENU_PASSO = 50;

/** Centro (onde o cursor clica) de um item do menu lateral. */
export function pontoMenu(id: IdMenu) {
  const i = MENU.findIndex((m) => m.id === id);
  return { x: 96, y: MENU_Y0 + i * MENU_PASSO + 20 };
}

/** Ícones do cabeçalho. */
export const SINO = { x: APP_L - 168, y: BARRA + CABECALHO / 2 };
export const CHAT = { x: APP_L - 118, y: BARRA + CABECALHO / 2 };

// ── a janela na tela (1920×1080) ────────────────────────────────────────
export const JANELA = { x: 240, y: 212, l: 1440, a: 810 };
export const ESCALA_JANELA = JANELA.l / APP_L;

// ── o ícone do app na cena 2 (tela) ─────────────────────────────────────
export const ICONE = { cx: 960, cy: 452, lado: 260, raio: 60 };
