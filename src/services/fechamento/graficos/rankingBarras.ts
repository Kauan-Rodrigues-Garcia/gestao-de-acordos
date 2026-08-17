/**
 * rankingBarras.ts — o ranking como barras horizontais.
 *
 * Barra proporcional ao PRIMEIRO colocado, não à meta: a pergunta do ranking é
 * "quanto um fez em relação ao outro". Contra a meta já existe a barra de
 * progresso, e as duas juntas na mesma lista confundiriam as leituras.
 *
 * Pódio separado em cima porque é o que a sala olha primeiro; a lista completa
 * fica abaixo, para quem quer se procurar.
 */

import { esc, brl, num } from '../formato';
import { COR_PODIO } from './paleta';

export interface ItemRanking {
  nome: string;
  valor: number;
  qtd: number;
  /** Rótulo de apoio: equipe, setor, o que fizer sentido no escopo. */
  detalhe?: string | null;
  /** Marca a linha da própria pessoa no relatório individual. */
  destacado?: boolean;
}

/** O pódio dos três primeiros. Vazio com menos de três. */
export function htmlPodio(itens: readonly ItemRanking[]): string {
  if (itens.length < 3) return '';
  return `<div class="podio">${itens.slice(0, 3).map((o, i) => `
    <div class="podio-item podio-${i + 1}" style="--cor-podio:${COR_PODIO[i]}">
      <span class="podio-pos">${i + 1}º lugar</span>
      <strong>${esc(o.nome)}</strong>
      <span class="podio-valor">${esc(brl(o.valor))}</span>
      <span class="fraco">${esc(num(o.qtd))} pagamento(s)${o.detalhe ? ` · ${esc(o.detalhe)}` : ''}</span>
    </div>`).join('')}</div>`;
}

/**
 * A lista completa com barras.
 *
 * Devolve string vazia com um único item: uma barra sozinha em 100% não
 * compara nada, e ocupa o espaço fingindo que compara.
 */
export function htmlRankingBarras(itens: readonly ItemRanking[]): string {
  if (itens.length < 2) return '';
  const maior = Math.max(...itens.map(i => i.valor), 1);

  const linhas = itens.map((o, i) => {
    const largura = Math.max((o.valor / maior) * 100, o.valor > 0 ? 1 : 0);
    const cor = i < 3 ? COR_PODIO[i] : 'var(--acento)';
    return `<li${o.destacado ? ' class="eu"' : ''}>
      <span class="rank-pos">${i + 1}</span>
      <span class="rank-nome" title="${esc(o.nome)}">${esc(o.nome)}</span>
      <span class="rank-barra"><i style="width:${largura.toFixed(1)}%;background:${cor}"></i></span>
      <span class="rank-valor">${esc(brl(o.valor))}</span>
    </li>`;
  }).join('');

  return `<ol class="rank">${linhas}</ol>`;
}
