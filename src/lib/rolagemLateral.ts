/**
 * rolagemLateral.ts — as fileiras que rolam de lado, roladas com o mouse.
 *
 * ## O defeito (19/10/2026)
 *
 * Abas e filtros em fileira (`overflow-x-auto`) rolam de lado quando não
 * cabem. No celular o dedo arrasta. No PC, só Shift + roda ou a barrinha de
 * 6 px quase transparente embaixo — ninguém descobre, e a pessoa via três abas
 * e ficava presa nelas (começou pelo filtro de gêneros do player de música:
 * «não está dando para arrastar, ficando preso em apenas 3»).
 *
 * ## O que liga (uma vez, para o app inteiro)
 *
 * Em qualquer FILEIRA — um elemento que rola de lado, tem o que rolar, é baixo
 * (até `ALTURA_FILEIRA` px: abas, chips) e não rola de pé —:
 *
 *   - a roda de cima para baixo rola de lado. Só enquanto há para onde ir: na
 *     ponta, a roda volta a rolar a página;
 *   - arrastar com o botão esquerdo rola; um arrasto de mais de `LIMIAR_PX`
 *     não vira clique na aba onde começou.
 *
 * Tabela larga NÃO é fileira: a roda em cima dela continua rolando a página
 * (sequestrar a roda ali seria pior). Para ela há a barra flutuante
 * (`components/BarraRolagemLateral.tsx`).
 *
 * Fica de fora o que é de digitar ou de selecionar texto (campo, `pre`,
 * `[contenteditable]`) e o que pedir `data-sem-arrastar`.
 */

/** Mais alto que isto não é fileira de abas/chips — é tabela ou painel. */
const ALTURA_FILEIRA = 72;
const LIMIAR_PX = 4;
const LINHA_PX = 16;

function rolaDeLado(el: HTMLElement): boolean {
  const ox = getComputedStyle(el).overflowX;
  return ox === 'auto' || ox === 'scroll';
}

/** A fileira de `alvo`: o elemento baixo que rola de lado, subindo a árvore. */
export function fileiraDe(alvo: EventTarget | null): HTMLElement | null {
  let el = alvo instanceof Element ? alvo : null;
  for (let passos = 0; el && el !== document.body && passos < 12; passos++, el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.matches('input, textarea, select, pre, [contenteditable=""], [contenteditable="true"], [data-sem-arrastar]')) return null;
    if (el.scrollWidth - el.clientWidth <= 1) continue;
    if (!rolaDeLado(el)) continue;
    if (el.clientHeight > ALTURA_FILEIRA || el.scrollHeight - el.clientHeight > 2) return null;
    return el;
  }
  return null;
}

/**
 * `data-mais="esquerda|direita|os-dois"`: de que lado há mais escondido. Quem
 * quiser apagar a ponta usa no CSS (o player de música usa).
 */
export function marcarPontas(el: HTMLElement): void {
  const folga = el.scrollWidth - el.clientWidth;
  const esquerda = el.scrollLeft > 1;
  const direita = el.scrollLeft < folga - 1;
  const mais = esquerda && direita ? 'os-dois' : esquerda ? 'esquerda' : direita ? 'direita' : '';
  if (mais) el.dataset.mais = mais;
  else delete el.dataset.mais;
}

/**
 * Marca as pontas da fileira desde que ela aparece (e quando muda de tamanho):
 * a ponta apagada (classe `fileira-rola`, em `index.css`) avisa que há mais
 * abas escondidas antes de a pessoa rolar. Depois, a rolagem marca sozinha.
 */
export function observarPontas(el: HTMLElement): () => void {
  marcarPontas(el);
  if (typeof ResizeObserver === 'undefined') return () => {};
  const obs = new ResizeObserver(() => marcarPontas(el));
  obs.observe(el);
  for (const filho of el.children) obs.observe(filho);
  return () => obs.disconnect();
}

let ligada = false;

/** Liga a rolagem de lado com o mouse no documento inteiro. Devolve o desligar. */
export function ligarRolagemLateral(): () => void {
  if (ligada || typeof document === 'undefined') return () => {};
  ligada = true;

  let fileira: HTMLElement | null = null;
  let arrastando = false;
  let engolirClique = false;
  let inicioX = 0;
  let inicioRolagem = 0;
  let ponteiro = -1;

  const aoRodar = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // zoom, ou o touchpad já rola de lado
    const f = fileiraDe(e.target);
    if (!f) return;
    const antes = f.scrollLeft;
    f.scrollLeft += e.deltaMode === 1 ? e.deltaY * LINHA_PX : e.deltaY;
    if (f.scrollLeft !== antes) e.preventDefault(); // na ponta, a página rola
  };

  const aoApertar = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return; // o dedo já rola sozinho
    const f = fileiraDe(e.target);
    if (!f) return;
    // Em cima da própria barra de rolagem: quem arrasta é o navegador.
    const r = f.getBoundingClientRect();
    if (e.clientY - r.top - f.clientTop >= f.clientHeight) return;
    fileira = f;
    arrastando = false;
    inicioX = e.clientX;
    inicioRolagem = fileira.scrollLeft;
    ponteiro = e.pointerId;
  };
  const aoMover = (e: PointerEvent) => {
    if (!fileira || e.pointerId !== ponteiro) return;
    const dx = e.clientX - inicioX;
    if (!arrastando && Math.abs(dx) > LIMIAR_PX) {
      arrastando = true;
      try { fileira.setPointerCapture(ponteiro); } catch { /* o ponteiro já saiu */ }
      fileira.dataset.arrastando = '';
      document.documentElement.classList.add('rolagem-arrastando');
    }
    if (arrastando) fileira.scrollLeft = inicioRolagem - dx;
  };
  const aoSoltar = () => {
    const f = fileira;
    fileira = null;
    if (!f || !arrastando) return;
    arrastando = false;
    delete f.dataset.arrastando;
    document.documentElement.classList.remove('rolagem-arrastando');
    // O clique que vem logo depois do arrasto não escolhe a aba.
    engolirClique = true;
    setTimeout(() => { engolirClique = false; }, 0);
  };
  const aoClicar = (e: MouseEvent) => {
    if (!engolirClique) return;
    engolirClique = false;
    e.stopPropagation();
    e.preventDefault();
  };
  const aoRolar = (e: Event) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.dataset.mais !== undefined || (el instanceof HTMLElement && el.clientHeight <= ALTURA_FILEIRA && el.scrollWidth > el.clientWidth + 1)) {
      marcarPontas(el as HTMLElement);
    }
  };

  document.addEventListener('wheel', aoRodar, { passive: false });
  document.addEventListener('pointerdown', aoApertar);
  document.addEventListener('pointermove', aoMover);
  document.addEventListener('pointerup', aoSoltar);
  document.addEventListener('pointercancel', aoSoltar);
  document.addEventListener('click', aoClicar, true);
  document.addEventListener('scroll', aoRolar, { capture: true, passive: true });

  return () => {
    ligada = false;
    document.removeEventListener('wheel', aoRodar);
    document.removeEventListener('pointerdown', aoApertar);
    document.removeEventListener('pointermove', aoMover);
    document.removeEventListener('pointerup', aoSoltar);
    document.removeEventListener('pointercancel', aoSoltar);
    document.removeEventListener('click', aoClicar, true);
    document.removeEventListener('scroll', aoRolar, { capture: true });
  };
}
