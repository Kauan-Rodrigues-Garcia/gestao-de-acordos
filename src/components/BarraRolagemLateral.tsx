/**
 * BarraRolagemLateral — a barra de rolagem de lado que fica sempre à vista.
 *
 * ## O defeito (19/10/2026)
 *
 * Tabela mais larga que a tela rola de lado (`overflow-x-auto`), e a barra
 * dessa rolagem nasce no RODAPÉ da tabela. Tabela comprida = barra milhares de
 * pixels abaixo: para ver as últimas colunas era preciso rolar a página até o
 * fim, e no caminho o cabeçalho sumia. Com zoom de 125% ou 150% (comum nos
 * notebooks da operação) quase toda tabela passa da largura. Vendas já tinha
 * resolvido isso só para si em 21/09/2026 (janela com altura presa); são
 * dezenas de tabelas com o mesmo formato.
 *
 * ## O que faz
 *
 * Com o mouse em cima de algo que rola de lado e cujo rodapé está FORA da área
 * visível, uma barra igual aparece presa no pé da área de conteúdo, na largura
 * da tabela, e as duas andam juntas. O rodapé da tabela entrou na tela, a
 * tabela saiu dela, ou o mouse foi para outra coisa: a barra some.
 *
 * Só lê o que já está na tela (tamanhos e posição) — sem estado do React por
 * rolagem: os estilos são escritos direto no elemento.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Mais baixo que isto é fileira de abas/chips (`lib/rolagemLateral.ts`), não tabela. */
const ALTURA_MINIMA = 120;
/** Quanto da tabela precisa estar à vista acima da barra para valer mostrar. */
const VISIVEL_MINIMO = 56;
const ALTURA_BARRA = 14;

function rolaDeLado(el: HTMLElement): boolean {
  if (el.scrollWidth - el.clientWidth <= 2 || el.clientHeight < ALTURA_MINIMA) return false;
  const ox = getComputedStyle(el).overflowX;
  return ox === 'auto' || ox === 'scroll';
}

/** O que rola de lado em volta de `alvo`, até a área de conteúdo. */
function quemRolaDeLado(alvo: EventTarget | null, raiz: HTMLElement): HTMLElement | null {
  let el = alvo instanceof Element ? alvo : null;
  while (el && el !== raiz) {
    if (el instanceof HTMLElement && rolaDeLado(el)) return el;
    el = el.parentElement;
  }
  return null;
}

export function BarraRolagemLateral({ raiz }: { raiz: RefObject<HTMLElement | null> }) {
  const barra = useRef<HTMLDivElement>(null);
  const miolo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = raiz.current;
    const b = barra.current;
    const m = miolo.current;
    if (!area || !b || !m) return;

    let alvo: HTMLElement | null = null;
    let quadro = 0;
    // Quem mexeu por último: evita o pingue-pongue entre os dois `scroll`.
    let quemMexeu: 'barra' | 'alvo' | null = null;
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => agendar());

    const esconder = () => {
      if (alvo) observador?.unobserve(alvo);
      alvo?.removeEventListener('scroll', aoRolarAlvo);
      alvo = null;
      b.style.display = 'none';
    };

    /** Mostra, posiciona e sincroniza; ou esconde, se não precisa mais. */
    const posicionar = () => {
      quadro = 0;
      if (!alvo) return;
      if (!alvo.isConnected || !rolaDeLado(alvo)) { esconder(); return; }
      const r = alvo.getBoundingClientRect();
      const ra = area.getBoundingClientRect();
      const pe = Math.min(ra.bottom, window.innerHeight);
      // O rodapé (e a barra própria) já está à vista, ou a tabela quase não está.
      if (r.bottom <= pe + 1 || r.top > pe - VISIVEL_MINIMO || r.bottom < ra.top + VISIVEL_MINIMO) { esconder(); return; }
      const esquerda = Math.max(r.left + alvo.clientLeft, ra.left);
      const direita = Math.min(r.left + alvo.clientLeft + alvo.clientWidth, ra.right);
      const largura = direita - esquerda;
      if (largura < 80) { esconder(); return; }
      b.style.display = 'block';
      b.style.left = `${esquerda}px`;
      b.style.width = `${largura}px`;
      b.style.top = `${pe - ALTURA_BARRA}px`;
      // O miolo tem a largura do conteúdo na mesma proporção: a barra anda igual.
      const proporcao = largura / alvo.clientWidth;
      m.style.width = `${alvo.scrollWidth * proporcao}px`;
      if (quemMexeu !== 'barra') b.scrollLeft = alvo.scrollLeft * proporcao;
    };
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(posicionar); };

    function aoRolarAlvo() {
      if (quemMexeu === 'barra') { quemMexeu = null; return; }
      quemMexeu = 'alvo';
      agendar();
      requestAnimationFrame(() => { if (quemMexeu === 'alvo') quemMexeu = null; });
    }
    const aoRolarBarra = () => {
      if (!alvo || quemMexeu === 'alvo') return;
      quemMexeu = 'barra';
      alvo.scrollLeft = b.scrollLeft * (alvo.clientWidth / b.clientWidth);
    };

    const aoPassar = (e: MouseEvent) => {
      if (b.contains(e.target as Node)) return; // indo para a barra
      const achado = quemRolaDeLado(e.target, area);
      if (achado === alvo) return;
      esconder();
      if (!achado) return;
      alvo = achado;
      alvo.addEventListener('scroll', aoRolarAlvo, { passive: true });
      observador?.observe(alvo);
      if (alvo.firstElementChild) observador?.observe(alvo.firstElementChild);
      agendar();
    };
    const aoSair = (e: MouseEvent) => {
      // Saiu da área de conteúdo para fora (menu, topo) e não para a barra.
      if (!e.relatedTarget || (!area.contains(e.relatedTarget as Node) && !b.contains(e.relatedTarget as Node))) esconder();
    };

    area.addEventListener('mouseover', aoPassar, { passive: true });
    area.addEventListener('mouseleave', aoSair);
    area.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    b.addEventListener('scroll', aoRolarBarra, { passive: true });
    return () => {
      esconder();
      if (quadro) cancelAnimationFrame(quadro);
      observador?.disconnect();
      area.removeEventListener('mouseover', aoPassar);
      area.removeEventListener('mouseleave', aoSair);
      area.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
      b.removeEventListener('scroll', aoRolarBarra);
    };
  }, [raiz]);

  return createPortal(
    <div
      ref={barra}
      className="barra-rolagem-lateral"
      // Ela é baixa como uma fileira de abas, mas quem arrasta é a barra.
      data-sem-arrastar=""
      style={{ display: 'none', height: ALTURA_BARRA }}
      aria-hidden
    >
      <div ref={miolo} style={{ height: 1 }} />
    </div>,
    document.body,
  );
}
