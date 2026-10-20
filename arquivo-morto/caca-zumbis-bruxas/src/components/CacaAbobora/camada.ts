/**
 * camada.ts — onde o zumbi mora: preso ao CONTEÚDO, não à janela.
 *
 * ## A regra (Cleber, 07/10/2026)
 *
 * «Quando eu rolo a página, ele se mexe como se fosse fixo na tela. Quero que
 * fique fixo onde apareceu» — o zumbi, a morte e a mancha de sangue rolam
 * junto com a página. (Até ali ele era um adesivo na janela.)
 *
 * ## Como
 *
 * Uma lâmina do tamanho exato da parte visível do `<main>` (o palco), presa
 * na janela em cima dele e cortando o que sai dela; dentro, uma folha que anda
 * ao contrário da rolagem. Quem é posto na folha, em coordenadas do conteúdo,
 * rola com o conteúdo — e some atrás da barra do topo como o resto da página.
 *
 * Por que não pôr direto dentro do `<main>`: o que passa da borda (o palco da
 * morte é largo) aumentaria a área de rolagem da página, e o `<main>` nem
 * sempre é `position: relative`. A lâmina corta e não mexe em nada da página.
 *
 * Uma lâmina só, dividida por quem estiver usando.
 */

export interface Camada {
  /** Onde pôr os elementos: posição absoluta, em coordenadas do conteúdo. */
  folha: HTMLDivElement;
  palco: HTMLElement;
  /** Da janela para o conteúdo… */
  paraConteudo(x: number, y: number): { x: number; y: number };
  /** …e de volta. */
  paraTela(x: number, y: number): { x: number; y: number };
}

interface Viva extends Camada {
  usos: number;
  desfazer: () => void;
}

let viva: Viva | null = null;

function criar(palco: HTMLElement): Viva {
  const lamina = document.createElement('div');
  lamina.className = 'zb-camada';
  const folha = document.createElement('div');
  folha.className = 'zb-camada-folha';
  lamina.appendChild(folha);
  document.body.appendChild(lamina);

  const origem = () => {
    const r = palco.getBoundingClientRect();
    return { left: r.left + palco.clientLeft, top: r.top + palco.clientTop };
  };

  const ajustar = () => {
    const o = origem();
    lamina.style.left = `${o.left}px`;
    lamina.style.top = `${o.top}px`;
    // `client*` deixa a barra de rolagem de fora: ela continua clicável.
    lamina.style.width = `${palco.clientWidth}px`;
    lamina.style.height = `${palco.clientHeight}px`;
    folha.style.transform = `translate(${-palco.scrollLeft}px, ${-palco.scrollTop}px)`;
  };
  ajustar();

  palco.addEventListener('scroll', ajustar, { passive: true });
  window.addEventListener('resize', ajustar);
  // O menu lateral abre e fecha: o palco muda de largura sem a janela mudar.
  const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null;
  observador?.observe(palco);

  return {
    folha,
    palco,
    usos: 0,
    paraConteudo(x, y) {
      const o = origem();
      return { x: x - o.left + palco.scrollLeft, y: y - o.top + palco.scrollTop };
    },
    paraTela(x, y) {
      const o = origem();
      return { x: x + o.left - palco.scrollLeft, y: y + o.top - palco.scrollTop };
    },
    desfazer() {
      palco.removeEventListener('scroll', ajustar);
      window.removeEventListener('resize', ajustar);
      observador?.disconnect();
      lamina.remove();
    },
  };
}

/** A lâmina do palco. `soltar` quando não precisar mais (a última apaga). */
export function pegarCamada(palco: HTMLElement): { camada: Camada; soltar: () => void } {
  if (viva && viva.palco !== palco) { viva.desfazer(); viva = null; }
  if (!viva) viva = criar(palco);
  const esta = viva;
  esta.usos += 1;
  let solta = false;
  return {
    camada: esta,
    soltar: () => {
      if (solta) return;
      solta = true;
      esta.usos -= 1;
      if (esta.usos > 0 || viva !== esta) return;
      esta.desfazer();
      viva = null;
    },
  };
}
