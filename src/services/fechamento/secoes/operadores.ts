/**
 * operadores.ts — o detalhamento que o Painel do Líder mostra na tela.
 *
 * Recebido, meta, quanto disso foi alcançado e a posição contra o esperado até
 * aqui. As colunas e as cores são as mesmas de `QuartisOperadores`, de
 * propósito: quem projeta o relatório ao lado do sistema não deve precisar
 * traduzir uma leitura na outra.
 */

import { esc, brl, num, comSinal } from '../formato';
import { corDaProjecao, corDaVariacao } from '../graficos/paleta';
import {
  htmlTabela, htmlPilulaQuartil, htmlPct, htmlCabecalhoSecao, painel, htmlVazio,
} from './componentes';
import type { LinhaOperadorFechamento } from '../tipos';

export function tabelaOperadores(
  linhas: readonly LinhaOperadorFechamento[],
  opcoes: { mostrarSetor?: boolean } = {},
): string {
  if (!linhas.length) {
    return htmlVazio('Nenhum operador com movimento ou meta neste escopo.');
  }
  const mostrarSetor = opcoes.mostrarSetor ?? false;

  const cabecalho = `<th>#</th><th>Operador</th>${mostrarSetor ? '<th>Setor</th>' : ''}`
    + '<th class="n">Recebido</th><th class="n">Pagtos</th><th class="n">Meta</th>'
    + '<th class="n">% meta</th><th class="n">vs. esperado</th><th class="n">Quartil</th>';

  const corpo = linhas.map((o, i) => `
    <tr>
      <td class="pos">${i + 1}</td>
      <td>
        <strong>${esc(o.nome)}</strong>
        <span class="sub">${esc(o.usuario)}${o.equipeNome ? ` · ${esc(o.equipeNome)}` : ''}</span>
      </td>
      ${mostrarSetor ? `<td>${esc(o.setorNome ?? '—')}</td>` : ''}
      <td class="n">${esc(brl(o.bruto))}</td>
      <td class="n">${esc(num(o.qtd))}</td>
      <td class="n">${o.meta !== null ? esc(brl(o.meta)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${o.meta !== null
        ? htmlPct(o.pctMeta, corDaProjecao(o.pctMeta))
        : '<span class="fraco">—</span>'}</td>
      <td class="n">${o.diferenca !== null
        ? `<span style="color:${corDaVariacao(o.diferenca)}">${esc(comSinal(o.diferenca))}</span>`
        : '<span class="fraco">—</span>'}</td>
      <td class="n">${htmlPilulaQuartil(o.quartil)}</td>
    </tr>`).join('');

  return htmlTabela(cabecalho, corpo);
}

export function secaoOperadores(
  linhas: readonly LinhaOperadorFechamento[],
  opcoes: { mostrarSetor?: boolean } = {},
): string {
  const comMeta = linhas.filter(o => o.meta !== null && o.meta > 0);
  const bateram = comMeta.filter(o => o.bruto >= (o.meta as number)).length;

  const resumoLateral = comMeta.length
    ? `<span class="fraco">${bateram} de ${comMeta.length} bateram a meta</span>`
    : '';

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Detalhamento por operador',
    rotuloSlide: 'Operadores',
    ajuda: 'Mesma leitura do Painel do Líder: recebido no mês, meta, quanto disso foi '
      + 'alcançado e a posição contra o esperado até aqui. Quem não tem meta cadastrada '
      + 'aparece sem percentual — é ausência de alvo, não desempenho ruim.',
    aoLado: resumoLateral,
  })}${tabelaOperadores(linhas, opcoes)}`);
}
