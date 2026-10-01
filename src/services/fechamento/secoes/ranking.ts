/**
 * ranking.ts — pódio em cima, lista completa embaixo.
 *
 * A sala olha o pódio; a pessoa procura a si mesma na lista. São dois usos
 * diferentes do mesmo dado, e por isso aparecem em dois formatos.
 */

import { htmlPodio, htmlRankingBarras, type ItemRanking } from '../graficos/rankingBarras';
import { htmlCabecalhoSecao, painel, metaBatidaDe, rotuloMetaBatida } from './componentes';
import type { LinhaOperadorFechamento } from '../tipos';

/** "2ª meta" para quem bateu alguma; nada para quem não bateu ou não tem meta. */
function seloMeta(o: LinhaOperadorFechamento): string | null {
  const m = metaBatidaDe(o);
  return m && m.degrau > 0 ? rotuloMetaBatida(m) : null;
}

export function secaoRanking(
  linhas: readonly LinhaOperadorFechamento[],
  opcoes: { destacarId?: string | null } = {},
): string {
  if (linhas.length < 2) return '';

  const itens: ItemRanking[] = linhas.map(o => ({
    nome: o.nome,
    valor: o.bruto,
    qtd: o.qtd,
    detalhe: o.equipeNome,
    destacado: !!opcoes.destacarId && o.id === opcoes.destacarId,
    selo: seloMeta(o),
  }));

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Ranking do mês',
    rotuloSlide: 'Ranking',
    ajuda: 'Ordenado pelo recebido no mês. As barras são proporcionais ao primeiro '
      + 'colocado — a comparação aqui é entre pessoas, não contra a meta.',
  })}${htmlPodio(itens)}${htmlRankingBarras(itens)}`);
}
