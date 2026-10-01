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
  htmlMetaBatida, metaBatidaDe,
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

  // Cada coluna diz como ordena: `texto` começa de A a Z, `maior` começa do
  // maior valor, `menor` do menor (quartil: o 1º é o melhor). O clique seguinte
  // inverte. O `#` volta à ordem original, que é o ranking por recebido.
  const th = (rotulo: string, ordem: 'texto' | 'maior' | 'menor', numerica = false) =>
    `<th${numerica ? ' class="n"' : ''} data-ordem="${ordem}">${rotulo}</th>`;

  const cabecalho = th('#', 'menor')
    + th('Operador', 'texto')
    + (mostrarSetor ? th('Setor', 'texto') : '')
    + th('Recebido', 'maior', true) + th('Pagtos', 'maior', true) + th('Meta', 'maior', true)
    + th('% meta', 'maior', true) + th('Meta batida', 'maior') + th('vs. esperado', 'maior', true)
    + th('Quartil', 'menor', true);

  const corpo = linhas.map((o, i) => {
    const batida = metaBatidaDe(o);
    return `
    <tr>
      <td class="pos" data-v="${i + 1}">${i + 1}</td>
      <td data-v="${esc(o.nome)}">
        <strong>${esc(o.nome)}</strong>
        <span class="sub">${esc(o.usuario)}${o.equipeNome ? ` · ${esc(o.equipeNome)}` : ''}</span>
      </td>
      ${mostrarSetor ? `<td data-v="${esc(o.setorNome ?? '')}">${esc(o.setorNome ?? '—')}</td>` : ''}
      <td class="n" data-v="${o.bruto}">${esc(brl(o.bruto))}</td>
      <td class="n" data-v="${o.qtd}">${esc(num(o.qtd))}</td>
      <td class="n" data-v="${o.meta ?? ''}">${o.meta !== null ? esc(brl(o.meta)) : '<span class="fraco">—</span>'}</td>
      <td class="n" data-v="${o.meta ? o.bruto / o.meta : ''}">${o.meta !== null
        ? htmlPct(o.pctMeta, corDaProjecao(o.pctMeta))
        : '<span class="fraco">—</span>'}</td>
      <td data-v="${batida?.degrau ?? ''}">${htmlMetaBatida(batida)}</td>
      <td class="n" data-v="${o.diferenca ?? ''}">${o.diferenca !== null
        ? `<span style="color:${corDaVariacao(o.diferenca)}">${esc(comSinal(o.diferenca))}</span>`
        : '<span class="fraco">—</span>'}</td>
      <td class="n" data-v="${o.quartil ?? ''}">${htmlPilulaQuartil(o.quartil)}</td>
    </tr>`;
  }).join('');

  return htmlTabela(cabecalho, corpo, 'ordenavel');
}

export function secaoOperadores(
  linhas: readonly LinhaOperadorFechamento[],
  opcoes: { mostrarSetor?: boolean } = {},
): string {
  const metas = linhas.map(metaBatidaDe).filter((m): m is NonNullable<typeof m> => m !== null);
  const bateram = metas.filter(m => m.degrau > 0).length;

  const resumoLateral = metas.length
    ? `<span class="fraco">${bateram} de ${metas.length} bateram a meta</span>`
    : '';

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Detalhamento por operador',
    rotuloSlide: 'Operadores',
    ajuda: 'Mesma leitura do Painel do Líder: recebido no mês, meta, quanto disso foi '
      + 'alcançado, a maior meta batida e a posição contra o esperado. Quem não tem meta '
      + 'cadastrada aparece sem percentual — é ausência de alvo, não desempenho ruim. '
      + 'Clique no nome de uma coluna para ordenar por ela; clique de novo para inverter.',
    aoLado: resumoLateral,
  })}${distribuicaoMetas(metas)}${tabelaOperadores(linhas, opcoes)}`);
}

/**
 * Quantas pessoas pararam em cada meta — "4 na 1ª, 2 na 2ª, 3 em nenhuma".
 *
 * Só aparece quando o mês tem mais de um degrau: com meta única, a contagem já
 * está no "X de Y bateram a meta" do cabeçalho, e repeti-la seria ruído.
 */
function distribuicaoMetas(metas: ReadonlyArray<{ degrau: number; total: number }>): string {
  const maxDegraus = Math.max(0, ...metas.map(m => m.total));
  if (maxDegraus < 2) return '';

  const contagem = new Map<number, number>();
  for (const m of metas) contagem.set(m.degrau, (contagem.get(m.degrau) ?? 0) + 1);

  const itens = Array.from({ length: maxDegraus }, (_, i) => maxDegraus - i)
    .map(d => ({ rotulo: `${d}ª meta`, qtd: contagem.get(d) ?? 0 }))
    .concat({ rotulo: 'Nenhuma', qtd: contagem.get(0) ?? 0 });

  return `<ul class="faixa-metas">${itens.map(i => `
    <li${i.qtd ? '' : ' class="zerado"'}>
      <strong>${esc(num(i.qtd))}</strong><span>${esc(i.rotulo)}</span>
    </li>`).join('')}</ul>`;
}
