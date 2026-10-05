/**
 * esconderijo.ts — onde a abóbora pode ficar sem atrapalhar ninguém.
 *
 * ## A regra (Cleber, 05/10/2026): longe de botão e de tudo que se clica
 *
 * Cada tela é diferente (Acordos, Pix, Painel Líder…), e a mesma tela muda de
 * forma conforme a janela. Lista fixa de cantos não serve. O lugar é escolhido
 * na tela de cada um, olhando o que está de fato desenhado ali:
 *
 *   1. Sorteia um ponto na parte VISÍVEL do conteúdo (o `<main>` do Layout),
 *      com a semente da rodada — a mesma pessoa, com a mesma janela, vê no
 *      mesmo lugar se recarregar.
 *   2. Em volta da abóbora, com folga, confere uma grade de pontos. Em cada um,
 *      o que está por cima precisa ser fundo: não pode ser botão, link, campo,
 *      linha clicável (cursor de mãozinha), texto, nem algo fora do conteúdo
 *      (menu aberto, diálogo, a bolha do chat).
 *   3. Falhou, próximo ponto da mesma sequência.
 *
 * Depois de posta, a abóbora é reconferida de tempos em tempos (a tela troca, a
 * lista carrega): se algo clicável chegou perto, ela muda de lugar.
 */

/** mulberry32: sequência pseudoaleatória pequena e estável para uma semente. */
export function sorteador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tudo o que se clica, se digita ou se arrasta. */
export const SELETOR_INTERATIVO = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'details', 'video', 'audio',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="checkbox"]', '[role="radio"]',
  '[role="switch"]', '[role="menuitem"]', '[role="option"]', '[role="slider"]', '[role="combobox"]',
  '[role="gridcell"]', '[role="row"]', '[role="dialog"]', '[role="tooltip"]',
  '[contenteditable=""]', '[contenteditable="true"]', '[draggable="true"]',
  '[onclick]',
].join(',');

const CURSORES_DE_ACAO = new Set(['pointer', 'text', 'grab', 'grabbing', 'move', 'crosshair', 'col-resize', 'row-resize', 'cell', 'copy']);

export interface Caixa { x: number; y: number; lado: number }

interface Ambiente {
  pilhaNoPonto: (x: number, y: number) => Element[];
  cursorDe:     (el: Element) => string;
}

const ambienteDoNavegador: Ambiente = {
  pilhaNoPonto: (x, y) => document.elementsFromPoint(x, y),
  cursorDe:     el => getComputedStyle(el).cursor,
};

/** O elemento é (ou está dentro de) algo que a pessoa usa? */
export function elementoDeAcao(el: Element, cursor: string): boolean {
  if (el.closest(SELETOR_INTERATIVO)) return true;
  return CURSORES_DE_ACAO.has(cursor);
}

function cruza(a: DOMRect | { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Algum texto do próprio elemento passa por dentro da área? */
function temTextoNaArea(el: Element, area: { left: number; top: number; right: number; bottom: number }): boolean {
  if (typeof document === 'undefined' || typeof document.createRange !== 'function') return false;
  for (const no of Array.from(el.childNodes)) {
    if (no.nodeType !== 3 || !no.textContent?.trim()) continue;
    const faixa = document.createRange();
    faixa.selectNodeContents(no);
    const retangulos = typeof faixa.getClientRects === 'function' ? Array.from(faixa.getClientRects()) : [];
    if (retangulos.some(r => cruza(r, area))) return true;
  }
  return false;
}

/**
 * A caixa (e a folga em volta) só tem fundo por cima?
 *
 * `propria` é a abóbora, que fica fora da conta quando ela confere o próprio
 * lugar. Exportada para os testes, com o `ambiente` trocado.
 */
export function caixaLivre(
  c: Caixa,
  palco: Element,
  propria: Element | null = null,
  folga = 14,
  ambiente: Ambiente = ambienteDoNavegador,
): boolean {
  const area = { left: c.x - folga, top: c.y - folga, right: c.x + c.lado + folga, bottom: c.y + c.lado + folga };
  const PASSOS = 5;
  const vistos = new Set<Element>();
  for (let i = 0; i < PASSOS; i++) {
    for (let j = 0; j < PASSOS; j++) {
      const x = area.left + ((area.right - area.left) * i) / (PASSOS - 1);
      const y = area.top + ((area.bottom - area.top) * j) / (PASSOS - 1);
      const topo = ambiente.pilhaNoPonto(x, y).find(el => !propria || !propria.contains(el));
      // Fora do conteúdo: o menu lateral, um diálogo, a bolha do chat por cima.
      if (!topo || !palco.contains(topo)) return false;
      if (vistos.has(topo)) continue;
      vistos.add(topo);
      if (elementoDeAcao(topo, ambiente.cursorDe(topo))) return false;
      if (temTextoNaArea(topo, area)) return false;
    }
  }
  return true;
}

/** A parte do palco que está na janela agora, já sem as margens. */
export function areaVisivel(palco: Element, margem = 24): { left: number; top: number; right: number; bottom: number } | null {
  const r = palco.getBoundingClientRect();
  const left   = Math.max(r.left, 0) + margem;
  const top    = Math.max(r.top, 0) + margem;
  const right  = Math.min(r.right, window.innerWidth) - margem;
  const bottom = Math.min(r.bottom, window.innerHeight) - margem;
  if (right - left < 80 || bottom - top < 80) return null;
  return { left, top, right, bottom };
}

/**
 * Um lugar livre para a abóbora, sorteado pela semente. `tentativa` avança a
 * sequência quando o lugar anterior deixou de servir. `null` = nenhum lugar
 * livre agora (tela cheia de botão) — quem chama tenta de novo daqui a pouco.
 */
export function acharEsconderijo(
  palco: Element,
  semente: number,
  lado: number,
  tentativa = 0,
  propria: Element | null = null,
  ambiente: Ambiente = ambienteDoNavegador,
): { x: number; y: number } | null {
  const area = areaVisivel(palco);
  if (!area) return null;
  const sortear = sorteador((semente ^ Math.imul(tentativa + 1, 0x9e3779b1)) >>> 0);
  const largura = area.right - area.left - lado;
  const altura  = area.bottom - area.top - lado;
  for (let i = 0; i < 140; i++) {
    const x = Math.round(area.left + sortear() * largura);
    const y = Math.round(area.top + sortear() * altura);
    if (caixaLivre({ x, y, lado }, palco, propria, 14, ambiente)) return { x, y };
  }
  return null;
}
