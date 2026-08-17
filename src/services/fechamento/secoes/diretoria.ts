/**
 * diretoria.ts — o comparativo entre setores.
 *
 * Só existe no relatório de quem enxerga a empresa inteira. A coluna de
 * participação é a que responde a pergunta da diretoria: por onde passou o
 * dinheiro deste mês.
 */

import { esc, brl, num, pct } from '../formato';
import { corDaProjecao } from '../graficos/paleta';
import {
  htmlTabela, htmlCartoes, htmlPct, htmlCabecalhoSecao, painel, htmlVazio,
} from './componentes';
import type { LinhaSetorFechamento } from '../tipos';

export function secaoDiretoria(setores: readonly LinhaSetorFechamento[]): string {
  if (!setores.length) {
    return painel(`${htmlCabecalhoSecao({ titulo: 'Comparativo entre setores' })}
      ${htmlVazio('Nenhum setor com movimento no mês.')}`);
  }

  const total = setores.reduce((s, x) => s + x.bruto, 0);
  const comMeta = setores.filter(s => s.meta !== null);
  const metaTotal = comMeta.reduce((s, x) => s + (x.meta ?? 0), 0);
  const bateram = comMeta.filter(s => s.bruto >= (s.meta as number)).length;

  const cartoes = htmlCartoes([
    { rotulo: 'Recebido na empresa', valor: brl(total), apoio: `${setores.length} setor(es) com movimento` },
    metaTotal > 0
      ? {
        rotulo: 'Meta consolidada', valor: brl(metaTotal),
        apoio: `${pct(Math.round((total / metaTotal) * 1000) / 10)} alcançado`,
        cor: corDaProjecao(Math.round((total / metaTotal) * 1000) / 10),
      }
      : null,
    comMeta.length
      ? { rotulo: 'Setores na meta', valor: `${bateram} de ${comMeta.length}`, apoio: 'bateram o alvo do mês' }
      : null,
    {
      rotulo: 'Maior contribuição', valor: setores[0].nome,
      apoio: `${brl(setores[0].bruto)} · ${pct(setores[0].pctDaEmpresa)} do total`,
    },
  ], 'compacto');

  const cabecalho = '<th>#</th><th>Setor</th><th class="n">Recebido</th><th class="n">Pagtos</th>'
    + '<th class="n">Meta</th><th class="n">% meta</th><th class="n">% da empresa</th>'
    + '<th>Participação</th>';

  const corpo = setores.map((s, i) => `
    <tr>
      <td class="pos">${i + 1}</td>
      <td><strong>${esc(s.nome)}</strong><span class="sub">${esc(num(s.operadores))} operador(es)</span></td>
      <td class="n">${esc(brl(s.bruto))}</td>
      <td class="n">${esc(num(s.qtd))}</td>
      <td class="n">${s.meta !== null ? esc(brl(s.meta)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${s.meta !== null
        ? htmlPct(s.pctMeta, corDaProjecao(s.pctMeta)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${esc(pct(s.pctDaEmpresa))}</td>
      <td class="participacao">
        <div class="barra">
          <div class="barra-fill" style="width:${Math.min(s.pctDaEmpresa, 100).toFixed(1)}%;background:var(--acento)"></div>
        </div>
      </td>
    </tr>`).join('');

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Comparativo entre setores',
    rotuloSlide: 'Painel da Diretoria',
    ajuda: 'Consolidado da empresa no mês. A coluna "% da empresa" mostra quanto do '
      + 'total passou por cada setor.',
  })}${cartoes}${htmlTabela(cabecalho, corpo)}`);
}
