/**
 * quartis.ts — a distribuição do time por faixa de projeção.
 *
 * A pizza responde de relance ("metade do time no 3º"); as listas embaixo dizem
 * quem está em cada faixa. É a aba Quartis do sistema, com a mesma matemática
 * e a mesma paleta.
 */

import { esc, brl, pct } from '../formato';
import { COR_QUARTIL, corDaProjecao } from '../graficos/paleta';
import { svgPizzaQuartis } from '../graficos/pizzaQuartis';
import { htmlCabecalhoSecao, painel } from './componentes';
import type { FaixaQuartilFechamento } from '../tipos';

export function secaoQuartis(faixas: readonly FaixaQuartilFechamento[]): string {
  const comGente = faixas.filter(f => f.operadores.length);
  if (!comGente.length) return '';

  const pizza = svgPizzaQuartis(faixas.map(f => ({
    quartil: f.faixa.quartil,
    minPct: f.faixa.min_pct,
    quantidade: f.operadores.length,
  })));

  // Da melhor faixa para a pior — é a ordem em que se lê um ranking.
  const blocos = [...comGente]
    .sort((a, b) => a.faixa.quartil - b.faixa.quartil)
    .map(q => `
      <div class="quartil-bloco">
        <h4 style="color:${COR_QUARTIL[q.faixa.quartil] ?? 'var(--fraco)'}">
          ${q.faixa.quartil}º quartil
          <span class="fraco">a partir de ${esc(pct(q.faixa.min_pct))} do esperado</span>
        </h4>
        <ul class="lista-quartil">
          ${q.operadores.map(o => `<li>
            <span>${esc(o.nome)}</span>
            <span class="n">${esc(brl(o.bruto))}</span>
            <span class="n" style="color:${corDaProjecao(o.projecaoPct)}">${esc(pct(o.projecaoPct ?? 0))}</span>
          </li>`).join('')}
        </ul>
      </div>`).join('');

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Distribuição por quartil',
    rotuloSlide: 'Quartis',
    ajuda: 'O quartil sai da projeção (recebido ÷ esperado até aqui), com as faixas '
      + 'configuradas na aba Metas. Quem não tem meta cadastrada não aparece — '
      + 'sem alvo não existe projeção.',
  })}${pizza}<div class="quartis">${blocos}</div>`);
}
