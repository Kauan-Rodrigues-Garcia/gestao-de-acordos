/**
 * A gravação da invasão do Grinch (11/11/2026).
 *
 * Pedido do Cleber: uma animação «muito bem feita e muito polida», mas leve —
 * «algo programado, para não ser aleatório, para não ter cálculo; como se
 * fosse uma gravação». É isso: uma folha de DEIXAS com hora marcada, igual
 * para todo mundo. Nada é sorteado e nada é calculado por quadro. Tocar a
 * gravação é só disparar cada deixa na hora dela (uns 50 `setTimeout` em 19
 * segundos); o movimento entre uma deixa e outra é transição de `transform`,
 * que a placa de vídeo faz sozinha (`grinch.css`).
 *
 * Uma deixa é uma destas coisas:
 *   - `g`    — o Grinch: para onde vai (`x`, em `dur` segundos), a pose, a
 *              cara, para que lado olha, se anda, se pula;
 *   - `bag`  — um objeto do chalé vai para a versão bagunçada;
 *   - `fase` — a fase do roteiro (o vidro trincando, a fuligem…);
 *   - `gato` — o gato leva o susto, ou foge.
 *
 * São duas gravações: pela JANELA (o chalé inteiro) e pela CHAMINÉ (quando só
 * a lareira cabe na tela — como no livro).
 */
import type { FaseDoGrinch, ItemDoChale } from './roteiro';

export type Pose =
  | 'parado' | 'espreita' | 'corre' | 'alcanca' | 'empurra' | 'puxa' | 'puxa2'
  | 'prepara' | 'chuta' | 'soco-alto' | 'soco' | 'ri' | 'shh' | 'pula';
export type Cara = 'sorriso' | 'riso' | 'bico';
export type Salto = 'entra-janela' | 'sai-janela' | 'cai-chamine' | 'sobe-chamine' | 'pulinho' | 'recuo';

export interface MovimentoDoGrinch {
  /** Aparece (`true`) ou some (`false`). */
  mostra?: boolean;
  /** Para onde vai (x no quadro), em quantos segundos e com que curva. */
  x?: number;
  dur?: number;
  curva?: string;
  pose?: Pose;
  cara?: Cara;
  /** 1 = olha para a direita, -1 = para a esquerda. */
  olha?: 1 | -1;
  /** As pernas: 0 = paradas, 1 = na ponta do pé, 2 = correndo. */
  anda?: 0 | 1 | 2;
  salto?: Salto;
}

export type Deixa =
  | { t: number; g: MovimentoDoGrinch }
  | { t: number; bag: ItemDoChale }
  | { t: number; fase: FaseDoGrinch; espiando?: boolean }
  | { t: number; gato: 'susto' | 'fugiu' };

/** Pela janela: espia, quebra o vidro, pula para dentro e vai bagunçando o chalé da esquerda para a direita. */
export const GRAVACAO_JANELA: readonly Deixa[] = [
  // Espia lá de fora, o vidro trinca e estilhaça.
  { t: 0, fase: 'espia', espiando: true },
  { t: 1.9, fase: 'quebra' },
  { t: 2.55, bag: 'janela' },
  { t: 2.55, fase: 'entra', espiando: false },
  // Pula para dentro e cai amassando, na frente da poltrona.
  { t: 2.55, g: { mostra: true, x: 196, dur: 0, olha: 1, pose: 'pula', cara: 'riso', anda: 0, salto: 'entra-janela' } },
  { t: 3.3, g: { pose: 'parado', cara: 'sorriso' } },
  // O gato acorda de olho arregalado; ele pede silêncio; o gato não quer saber.
  { t: 3.45, gato: 'susto' },
  { t: 3.8, g: { pose: 'shh', cara: 'bico' } },
  { t: 4.75, gato: 'fugiu' },
  // O relógio de parede: um pulo e um tapa.
  { t: 4.9, g: { olha: -1, pose: 'alcanca', cara: 'sorriso', salto: 'pulinho' } },
  { t: 5.15, bag: 'relogio' },
  // A poltrona: agarra o encosto e puxa; ela tomba e ele recua.
  { t: 5.55, g: { pose: 'empurra' } },
  { t: 5.95, bag: 'poltrona' },
  { t: 5.95, g: { pose: 'puxa2', x: 236, dur: 0.34, curva: 'ease-out', salto: 'recuo', cara: 'riso' } },
  // O tapete: abaixa, agarra a ponta e arranca.
  { t: 6.55, g: { olha: 1, pose: 'puxa', cara: 'sorriso' } },
  { t: 7.05, bag: 'tapete' },
  { t: 7.05, g: { pose: 'puxa2', cara: 'riso' } },
  // As meias: passa por baixo da cornija de braço para cima, derrubando uma por uma.
  { t: 7.6, g: { pose: 'alcanca', cara: 'sorriso', anda: 1, x: 246, dur: 0.2 } },
  { t: 7.8, bag: 'meias' },
  { t: 7.8, g: { x: 300, dur: 0.62 } },
  // A guirlanda, no alto da chaminé: um pulo.
  { t: 8.42, g: { anda: 0, pose: 'pula', salto: 'pulinho' } },
  { t: 8.68, bag: 'guirlanda' },
  { t: 9.02, g: { pose: 'alcanca', anda: 1, x: 362, dur: 0.6 } },
  // A bola pendurada: um peteleco. E as velas, com outro pulo.
  { t: 9.62, g: { anda: 0, pose: 'soco-alto' } },
  { t: 9.82, bag: 'bola' },
  { t: 9.82, g: { pose: 'alcanca' } },
  { t: 10.15, g: { pose: 'pula', salto: 'pulinho' } },
  { t: 10.4, bag: 'velas' },
  // A TV: na ponta do pé até ela, levanta o braço e desce o tapa. Fora do ar.
  { t: 10.75, g: { pose: 'espreita', anda: 1, x: 396, dur: 0.5 } },
  { t: 11.25, g: { anda: 0, pose: 'soco-alto', cara: 'riso' } },
  { t: 11.55, g: { pose: 'soco' } },
  { t: 11.6, bag: 'tv' },
  // Os presentes: toma distância e chuta.
  { t: 12.1, g: { pose: 'espreita', cara: 'sorriso', anda: 1, x: 448, dur: 0.6 } },
  { t: 12.7, g: { anda: 0, pose: 'prepara' } },
  { t: 12.95, g: { pose: 'chuta', cara: 'riso' } },
  { t: 13, bag: 'presentes' },
  // A árvore: empurra com os dois braços.
  { t: 13.45, g: { pose: 'espreita', anda: 1, x: 486, dur: 0.4 } },
  { t: 13.85, g: { anda: 0, pose: 'empurra', cara: 'sorriso' } },
  { t: 14.2, bag: 'arvore' },
  { t: 14.25, g: { pose: 'puxa2', cara: 'riso' } },
  // Volta para o meio da sala na ponta do pé, admira o estrago e ri esfregando as mãos.
  { t: 14.8, g: { olha: -1, pose: 'espreita', cara: 'sorriso', anda: 1, x: 322, dur: 1.9 } },
  { t: 16.7, g: { anda: 0, olha: 1, pose: 'ri', cara: 'riso' } },
  // E foge correndo, de volta pela janela.
  { t: 18.9, g: { olha: -1, pose: 'corre', cara: 'sorriso', anda: 2, x: 198, dur: 0.85 } },
  { t: 19.75, g: { anda: 0, pose: 'pula', salto: 'sai-janela' } },
  { t: 19.75, fase: 'sai' },
  { t: 20.6, g: { mostra: false } },
  { t: 20.6, fase: 'baguncado' },
];

/** Pela chaminé (tela estreita, só a lareira): cai na lareira numa nuvem de fuligem e bagunça o que está em volta. */
export const GRAVACAO_CHAMINE: readonly Deixa[] = [
  { t: 0, fase: 'entra' },
  { t: 0.1, g: { mostra: true, x: 300, dur: 0, olha: 1, pose: 'pula', cara: 'riso', anda: 0, salto: 'cai-chamine' } },
  { t: 1.1, g: { pose: 'parado', cara: 'sorriso' } },
  { t: 1.1, fase: 'pose' },
  // O tapete, logo ali.
  { t: 1.6, g: { olha: -1, pose: 'puxa' } },
  { t: 2.1, bag: 'tapete' },
  { t: 2.1, g: { pose: 'puxa2', cara: 'riso' } },
  // As meias, de braço para cima.
  { t: 2.7, g: { pose: 'alcanca', cara: 'sorriso', anda: 1, x: 250, dur: 0.5 } },
  { t: 3.2, g: { olha: 1 } },
  { t: 3.25, bag: 'meias' },
  { t: 3.25, g: { x: 300, dur: 0.6 } },
  // A guirlanda e as velas: dois pulos.
  { t: 3.85, g: { anda: 0, pose: 'pula', salto: 'pulinho' } },
  { t: 4.1, bag: 'guirlanda' },
  { t: 4.45, g: { pose: 'alcanca', anda: 1, x: 356, dur: 0.55 } },
  { t: 5, g: { anda: 0, pose: 'soco-alto' } },
  { t: 5.2, bag: 'bola' },
  { t: 5.2, g: { pose: 'alcanca' } },
  { t: 5.5, g: { pose: 'pula', salto: 'pulinho' } },
  { t: 5.75, bag: 'velas' },
  // Ri no meio da bagunça e some pela chaminé.
  { t: 6.1, g: { olha: -1, pose: 'espreita', anda: 1, x: 300, dur: 0.7 } },
  { t: 6.8, g: { anda: 0, olha: 1, pose: 'ri', cara: 'riso' } },
  { t: 8.7, g: { pose: 'pula', cara: 'sorriso', salto: 'sobe-chamine' } },
  { t: 8.7, fase: 'sai' },
  { t: 9.7, g: { mostra: false } },
  { t: 9.7, fase: 'baguncado' },
];

/** A duração de uma gravação, em segundos: a hora da última deixa. */
export function duracao(gravacao: readonly Deixa[]): number {
  return gravacao.reduce((m, d) => Math.max(m, d.t), 0);
}

/** Aplica um movimento no boneco: só atributos e `transform` — o CSS faz o resto. */
export function aplicarNoGrinch(el: HTMLElement, m: MovimentoDoGrinch) {
  if (m.mostra === true) el.dataset.visivel = '1';
  if (m.mostra === false) {
    delete el.dataset.visivel;
    delete el.dataset.salto;
    delete el.dataset.anda;
  }
  if (m.x !== undefined) {
    el.style.transitionDuration = `${m.dur ?? 0}s`;
    el.style.transitionTimingFunction = m.curva ?? 'linear';
    el.style.transform = `translateX(${m.x}px)`;
  }
  if (m.pose) el.dataset.pose = m.pose;
  if (m.cara) el.dataset.cara = m.cara;
  if (m.olha) el.dataset.olha = String(m.olha);
  if (m.anda !== undefined) {
    if (m.anda) el.dataset.anda = String(m.anda);
    else delete el.dataset.anda;
  }
  if (m.salto) {
    // O mesmo pulo duas vezes seguidas só recomeça se o atributo sair e voltar.
    delete el.dataset.salto;
    void el.offsetWidth;
    el.dataset.salto = m.salto;
  }
}

export interface Palco {
  grinch: () => HTMLElement | null;
  baguncar: (item: ItemDoChale) => void;
  fase: (fase: FaseDoGrinch, espiando?: boolean) => void;
  gato: (estado: 'susto' | 'fugiu') => void;
}

/**
 * Toca a gravação: cada deixa na hora dela, contada de um relógio só (o
 * atraso de uma não empurra a seguinte). Resolve no fim, ou assim que `vivo`
 * disser que o chalé saiu da tela.
 */
export function tocar(gravacao: readonly Deixa[], palco: Palco, vivo: () => boolean): Promise<void> {
  return new Promise(resolve => {
    const inicio = performance.now();
    let i = 0;
    const passo = () => {
      if (!vivo()) { resolve(); return; }
      const agora = (performance.now() - inicio) / 1000;
      while (i < gravacao.length && gravacao[i].t <= agora + 0.008) {
        const d = gravacao[i++];
        if ('g' in d) { const el = palco.grinch(); if (el) aplicarNoGrinch(el, d.g); }
        else if ('bag' in d) palco.baguncar(d.bag);
        else if ('fase' in d) palco.fase(d.fase, d.espiando);
        else palco.gato(d.gato);
      }
      if (i >= gravacao.length) { resolve(); return; }
      window.setTimeout(passo, Math.max(0, (gravacao[i].t - agora) * 1000));
    };
    passo();
  });
}
