/**
 * janelas.ts — a regra das janelas da área de trabalho, sem React e sem DOM.
 * ─────────────────────────────────────────────────────────────────────────────
 * Quais janelas estão abertas, em que ordem se empilham, qual tem o foco e onde
 * cada uma pode ficar. Tudo aqui é função pura: recebe o estado e uma ação,
 * devolve o estado seguinte. Quem desenha e quem escuta o ponteiro é a casca
 * da área de trabalho.
 *
 * ## Por que separado assim
 *
 * Gerenciador de janela é onde bug se esconde do mesmo jeito que em física de
 * jogo: a janela arrastada para fora que nunca mais volta, o foco que fica numa
 * janela minimizada, a tela que encolhe (girar o celular, redimensionar o
 * navegador) e deixa a barra de título do lado de fora. Nada disso dá para
 * testar olhando a tela, e tudo dá para testar chamando `reduzir`.
 *
 * ## As regras
 *
 *  • Um programa, uma janela. Abrir o que já está aberto traz para a frente.
 *  • `janelas` está na ORDEM DE EMPILHAMENTO: a última é a de cima. Não existe
 *    `z-index` guardado, então não existe z-index para dessincronizar.
 *  • O foco é sempre a janela visível mais alta, ou `null`. Janela minimizada
 *    nunca tem foco.
 *  • A barra de título nunca sai da área útil: é por ela que se arrasta, e uma
 *    janela sem barra alcançável é uma janela perdida.
 *
 * ## Unidades
 *
 * Pixels de CSS, relativos ao canto da área de trabalho. A área ÚTIL é o
 * retângulo que sobra depois da barra de tarefas — que fica em cima ou embaixo
 * conforme o tema, e por isso chega aqui como retângulo e não como altura.
 */

export interface Retangulo { x: number; y: number; l: number; a: number }

export interface Janela {
  /** O id do programa. Um programa, uma janela. */
  id: string;
  x: number;
  y: number;
  l: number;
  a: number;
  minimizada: boolean;
  maximizada: boolean;
}

export interface EstadoJanelas {
  /** Em ordem de empilhamento: a última é a de cima. */
  janelas: Janela[];
  /** A janela com o foco, ou `null` se nenhuma estiver visível. */
  foco: string | null;
  /** O retângulo onde janelas podem ficar (a tela menos a barra de tarefas). */
  area: Retangulo;
}

export type AcaoJanelas =
  | { tipo: 'abrir'; id: string; l: number; a: number }
  | { tipo: 'fechar'; id: string }
  | { tipo: 'minimizar'; id: string }
  | { tipo: 'focar'; id: string }
  | { tipo: 'mover'; id: string; x: number; y: number }
  | { tipo: 'alternarMaximizada'; id: string }
  | { tipo: 'redimensionarArea'; area: Retangulo }
  | { tipo: 'fecharTudo' };

/** Altura da barra de título — a parte que nunca pode sair da área útil. */
export const ALTURA_TITULO = 32;
/** Quanto da largura da janela precisa continuar visível ao ir para o lado. */
export const FAIXA_VISIVEL = 96;
/** Deslocamento de cada janela nova em relação à anterior. */
export const PASSO_CASCATA = 28;
/** Quantas janelas cabem na cascata antes de ela voltar ao começo. */
export const VOLTAS_CASCATA = 6;
/** Folga entre a primeira janela e o canto da área útil. */
export const MARGEM_INICIAL = 24;

export function limitar(v: number, min: number, max: number): number {
  // `max < min` acontece quando a área é menor que a janela; vale o mínimo,
  // que é o que mantém a barra de título dentro.
  if (max < min) return min;
  return v < min ? min : v > max ? max : v;
}

export function estadoInicial(area: Retangulo): EstadoJanelas {
  return { janelas: [], foco: null, area: areaValida(area) };
}

/** Uma área que nunca tem medida negativa, `NaN` ou infinita. */
function areaValida(area: Retangulo): Retangulo {
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  return {
    x: n(area.x),
    y: n(area.y),
    l: Math.max(n(area.l), 0),
    a: Math.max(n(area.a), 0),
  };
}

/**
 * Encaixa uma janela na área útil.
 *
 * O tamanho encolhe se não couber. A posição garante duas coisas: a barra de
 * título inteira dentro da área na vertical, e pelo menos `FAIXA_VISIVEL` da
 * janela dentro da área na horizontal — dá para empurrar uma janela para o
 * lado e deixar só uma fatia, mas não dá para perdê-la.
 *
 * Vale também para a janela maximizada: o que se encaixa é a posição
 * GUARDADA, para onde ela volta ao restaurar. O que ela ocupa enquanto
 * maximizada sai de `retanguloNaTela`.
 */
export function encaixar(j: Janela, area: Retangulo): Janela {
  const l = Math.min(Math.max(j.l, 0), area.l);
  const a = Math.min(Math.max(j.a, 0), area.a);
  const faixa = Math.min(FAIXA_VISIVEL, l);

  const x = limitar(j.x, area.x - (l - faixa), area.x + area.l - faixa);
  const y = limitar(j.y, area.y, area.y + area.a - Math.min(ALTURA_TITULO, a));

  return { ...j, x, y, l, a };
}

/** A janela visível mais alta da pilha, ou `null`. */
function topoVisivel(janelas: Janela[]): string | null {
  for (let i = janelas.length - 1; i >= 0; i--) {
    if (!janelas[i].minimizada) return janelas[i].id;
  }
  return null;
}

/** Leva a janela para o fim da lista, que é o topo da pilha. */
function paraOTopo(janelas: Janela[], id: string, muda?: (j: Janela) => Janela): Janela[] {
  const alvo = janelas.find(j => j.id === id);
  if (!alvo) return janelas;
  return [...janelas.filter(j => j.id !== id), muda ? muda(alvo) : alvo];
}

/** Onde a próxima janela nasce: em cascata, para nenhuma cobrir a anterior. */
function posicaoDeCascata(quantas: number, area: Retangulo): { x: number; y: number } {
  const passo = (quantas % VOLTAS_CASCATA) * PASSO_CASCATA;
  return { x: area.x + MARGEM_INICIAL + passo, y: area.y + MARGEM_INICIAL + passo };
}

export function reduzir(estado: EstadoJanelas, acao: AcaoJanelas): EstadoJanelas {
  switch (acao.tipo) {
    case 'abrir': {
      // Já aberta: vem para a frente, e volta se estava minimizada.
      if (estado.janelas.some(j => j.id === acao.id)) {
        const janelas = paraOTopo(estado.janelas, acao.id, j => ({ ...j, minimizada: false }));
        return { ...estado, janelas, foco: acao.id };
      }

      const { x, y } = posicaoDeCascata(estado.janelas.length, estado.area);
      const nova = encaixar(
        { id: acao.id, x, y, l: acao.l, a: acao.a, minimizada: false, maximizada: false },
        estado.area,
      );
      return { ...estado, janelas: [...estado.janelas, nova], foco: acao.id };
    }

    case 'fechar': {
      const janelas = estado.janelas.filter(j => j.id !== acao.id);
      if (janelas.length === estado.janelas.length) return estado;
      return { ...estado, janelas, foco: topoVisivel(janelas) };
    }

    case 'fecharTudo':
      return { ...estado, janelas: [], foco: null };

    case 'minimizar': {
      if (!estado.janelas.some(j => j.id === acao.id)) return estado;
      const janelas = estado.janelas.map(j =>
        j.id === acao.id ? { ...j, minimizada: true } : j);
      return { ...estado, janelas, foco: topoVisivel(janelas) };
    }

    case 'focar': {
      if (!estado.janelas.some(j => j.id === acao.id)) return estado;
      // Focar uma janela minimizada a restaura: é o clique no botão da barra.
      const janelas = paraOTopo(estado.janelas, acao.id, j => ({ ...j, minimizada: false }));
      return { ...estado, janelas, foco: acao.id };
    }

    case 'mover': {
      const alvo = estado.janelas.find(j => j.id === acao.id);
      // Janela maximizada não se arrasta, e posição sem número não se aceita:
      // um `NaN` vindo de uma medida ainda não feita sumiria com a janela.
      if (!alvo || alvo.maximizada) return estado;
      if (!Number.isFinite(acao.x) || !Number.isFinite(acao.y)) return estado;

      const janelas = estado.janelas.map(j =>
        j.id === acao.id ? encaixar({ ...j, x: acao.x, y: acao.y }, estado.area) : j);
      return { ...estado, janelas };
    }

    case 'alternarMaximizada': {
      if (!estado.janelas.some(j => j.id === acao.id)) return estado;
      const janelas = paraOTopo(estado.janelas, acao.id, j =>
        ({ ...j, maximizada: !j.maximizada, minimizada: false }));
      return { ...estado, janelas, foco: acao.id };
    }

    case 'redimensionarArea': {
      // A tela mudou de tamanho: toda janela é reencaixada, senão girar o
      // celular ou encolher o navegador deixaria barras de título de fora.
      const area = areaValida(acao.area);
      return { ...estado, area, janelas: estado.janelas.map(j => encaixar(j, area)) };
    }
  }
}

/**
 * O retângulo que a janela ocupa na tela agora.
 *
 * Maximizada, ela ocupa a área útil inteira, mas a posição e o tamanho de
 * antes continuam guardados na janela — é para onde ela volta ao restaurar.
 */
export function retanguloNaTela(j: Janela, area: Retangulo): Retangulo {
  return j.maximizada
    ? { x: area.x, y: area.y, l: area.l, a: area.a }
    : { x: j.x, y: j.y, l: j.l, a: j.a };
}

/** Abaixo desta largura a área de trabalho vira grade de ícones e tela cheia. */
export const LARGURA_CELULAR = 768;

/** Tela estreita: sem arrastar, um programa por vez em tela cheia. */
export function ehCelular(larguraTela: number): boolean {
  return larguraTela < LARGURA_CELULAR;
}

/**
 * A área útil: a tela menos a barra de tarefas.
 *
 * A barra fica em cima num tema e embaixo nos outros, então a área útil muda
 * de ORIGEM, não só de altura — com a barra no topo, o `y` começa depois dela.
 */
export function areaUtil(
  tela: { l: number; a: number },
  barra: { posicao: 'topo' | 'base'; altura: number },
): Retangulo {
  const altura = Math.max(Number.isFinite(barra.altura) ? barra.altura : 0, 0);
  return areaValida({
    x: 0,
    y: barra.posicao === 'topo' ? altura : 0,
    l: tela.l,
    a: tela.a - altura,
  });
}
