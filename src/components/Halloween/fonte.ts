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

export function carregarFonte() {
  if (typeof document === 'undefined' || document.getElementById(ID_FONTE)) return;
  const estilo = document.createElement('style');
  estilo.id = ID_FONTE;
  estilo.textContent = FONTE;
  document.head.appendChild(estilo);
}
