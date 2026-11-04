/**
 * relogio.ts — qual tela está no ar AGORA, pelo relógio.
 *
 * O rodízio não conta a partir de quando a página abriu: conta a partir da
 * versão do painel (`atualizado_em`). Dadas a versão e a hora, a TV e a prévia
 * do PC chegam à MESMA tela, sem conversar entre si. Publicar, fixar ou soltar
 * muda a versão, e o rodízio recomeça da primeira tela nos dois lugares.
 *
 * A hora é a do BANCO (`agora` nas respostas de `fn_tv_*`): o relógio de cada PC
 * pode estar segundos fora, e aí as duas telas trocariam em momentos
 * diferentes. `diferencaDoServidor` guarda essa correção.
 *
 * Puro. Testado em `modoTv.test.ts`.
 */
import type { TelaDoPainel } from './tipos';
import { noRodizio, segundosDaTela } from './templates';

export interface Instante {
  /** Posição da tela na lista COMPLETA do painel; -1 = nenhuma no rodízio. */
  indice: number;
  /** Quanto falta para a próxima troca, em ms. */
  restanteMs: number;
}

/**
 * Tela sob demanda (30/10/2026) não entra na volta: o relógio conta só as do
 * rodízio, e o índice devolvido continua sendo o da lista inteira — quem
 * desenha não precisa saber que houve filtro.
 */
export function telaNoInstante(
  telas: Pick<TelaDoPainel, 'segundos' | 'sob_demanda'>[],
  padraoDoPainel: number,
  inicioMs: number,
  agoraMs: number,
): Instante {
  const naVolta = telas.flatMap((t, i) => (noRodizio(t) ? [i] : []));
  if (!naVolta.length) return { indice: -1, restanteMs: 60_000 };
  const duracoes = naVolta.map(i => segundosDaTela(telas[i], padraoDoPainel) * 1000);
  const volta = duracoes.reduce((a, b) => a + b, 0);
  // Antes do início (relógio adiantado na outra ponta): a primeira tela.
  let pos = Math.max(0, agoraMs - inicioMs) % volta;
  for (let k = 0; k < duracoes.length; k++) {
    if (pos < duracoes[k]) return { indice: naVolta[k], restanteMs: duracoes[k] - pos };
    pos -= duracoes[k];
  }
  return { indice: naVolta[0], restanteMs: duracoes[0] };
}

/** Quanto somar a `Date.now()` para chegar à hora do banco. */
export function diferencaDoServidor(agoraDoServidor: unknown, recebidoEm = Date.now()): number | null {
  if (typeof agoraDoServidor !== 'string') return null;
  const t = Date.parse(agoraDoServidor);
  return Number.isFinite(t) ? t - recebidoEm : null;
}
