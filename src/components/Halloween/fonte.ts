/**
 * A fonte do Halloween (Creepster), declarada só para quem vê o tema.
 *
 * Mora no próprio site (`public/fonts/creepster.woff2`, licença OFL), e não no
 * Google: um domínio a menos para a rede da operação liberar. A declaração
 * entra uma vez e fica — tirar ao desligar faria a fonte piscar em cada troca
 * de tela.
 */
const ID_FONTE = 'hw-fonte-creepster';
const FONTE = `@font-face {
  font-family: 'Creepster';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/creepster.woff2') format('woff2');
}`;

function declarar(id: string, css: string) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const estilo = document.createElement('style');
  estilo.id = id;
  estilo.textContent = css;
  document.head.appendChild(estilo);
}

export function carregarFonte() {
  declarar(ID_FONTE, FONTE);
}

/**
 * As do cartaz «Procura-se» (`CartazProcuraSe.tsx`): Rye (letreiro de faroeste),
 * Special Elite (máquina de escrever) e Caveat (lápis). Também no próprio site
 * e OFL. Declarar não baixa: o navegador só busca o arquivo quando o cartaz
 * aparece na tela.
 */
const FONTES_DO_CARTAZ = [
  ['Rye', 'rye'],
  ['Special Elite', 'special-elite'],
  ['Caveat', 'caveat'],
].map(([familia, arquivo]) => `@font-face {
  font-family: '${familia}';
  font-style: normal;
  font-weight: ${arquivo === 'caveat' ? '400 700' : '400'};
  font-display: swap;
  src: url('/fonts/${arquivo}.woff2') format('woff2');
}`).join('\n');

export function carregarFontesDoCartaz() {
  declarar('hw-fontes-cartaz', FONTES_DO_CARTAZ);
}

/**
 * As da Caça aos Zumbis, em pixel: Pixelify Sans (o texto, variável de 400 a
 * 700) e Press Start 2P (as etiquetas, como HEADSHOT). Também no próprio site
 * e OFL.
 */
const FONTES_PIXEL = `@font-face {
  font-family: 'Pixelify Sans';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('/fonts/pixelify-sans.woff2') format('woff2');
}
@font-face {
  font-family: 'Press Start 2P';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/press-start-2p.woff2') format('woff2');
}`;

export function carregarFontesPixel() {
  declarar('hw-fontes-pixel', FONTES_PIXEL);
}
