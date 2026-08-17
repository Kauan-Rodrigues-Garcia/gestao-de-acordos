/**
 * pix.ts — a seção de Pix Automático do fechamento.
 *
 * Espelha `PixMetaPainel` e `PixRankingSetor`: meta por equipe com projeção,
 * consolidado do setor e ranking por pessoa.
 *
 * ⚠️ O aviso de dupla contagem NÃO é decorativo. O valor do Pix já entra no
 * recebimento pelo analítico; num relatório apresentado à diretoria, a ausência
 * dessa linha convida alguém a somar os dois e anunciar um número inflado.
 */

import { esc, brl, num, pct } from '../formato';
import { COR_PIX, COR_QUARTIL, corDaProjecao } from '../graficos/paleta';
import { htmlPodio, htmlRankingBarras } from '../graficos/rankingBarras';
import {
  htmlCartoes, htmlCabecalhoSecao, htmlTabela, htmlPct, painel,
} from './componentes';
import type { BlocoPixFechamento, NivelFechamento } from '../tipos';

export function secaoPix(pix: BlocoPixFechamento, nivel: NivelFechamento): string {
  const cartoes = htmlCartoes([
    {
      rotulo: 'Pix no mês', valor: brl(pix.total),
      apoio: `${num(pix.acordos)} acordo(s) de Pix`, cor: COR_PIX,
    },
    {
      rotulo: 'Comissão gerada', valor: brl(pix.comissao),
      apoio: `${pct(pix.pctComissao * 100)} por acordo aprovado`, cor: COR_QUARTIL[1],
    },
    pix.dobra
      ? {
        rotulo: 'Comissão dobrada',
        valor: pix.dobra.atingida ? 'Atingida' : 'Não atingida',
        apoio: `${num(pix.dobra.alcancado)} de ${num(pix.dobra.requisito)} acordos`
          + (pix.dobra.atingida ? ` · ${brl(pix.dobra.comissaoComDobra)}` : ''),
        cor: pix.dobra.atingida ? COR_QUARTIL[1] : COR_QUARTIL[4],
      }
      : null,
  ], 'compacto');

  const aviso = `<p class="ajuda">
    O valor do Pix Automático <strong>já está contido</strong> no recebimento do
    analítico mostrado nas outras seções. Ele aparece aqui como acompanhamento
    próprio — somá-lo ao total do mês contaria o mesmo dinheiro duas vezes.
  </p>`;

  const metas = pix.metasPorEquipe.length ? blocoMetas(pix) : '';
  const ranking = nivel !== 'operador' && pix.ranking.length > 1 ? blocoRanking(pix) : '';

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Pix Automático',
    rotuloSlide: 'Pix Automático',
  })}${aviso}${cartoes}${metas}${ranking}`);
}

function blocoMetas(pix: BlocoPixFechamento): string {
  const cabecalho = '<th>Equipe</th><th class="n">Realizado</th><th class="n">Acordos</th>'
    + '<th class="n">Meta</th><th class="n">% meta</th><th class="n">Projeção</th>';

  const linhas = pix.metasPorEquipe.map(e => `
    <tr>
      <td><strong>${esc(e.nome)}</strong>${e.meta === null
        ? '<span class="sub">sem meta de Pix cadastrada</span>' : ''}</td>
      <td class="n">${esc(brl(e.realizado))}</td>
      <td class="n">${esc(num(e.acordos))}${e.metaAcordos
        ? `<span class="sub">de ${esc(num(e.metaAcordos))}</span>` : ''}</td>
      <td class="n">${e.meta !== null ? esc(brl(e.meta)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${e.meta !== null
        ? htmlPct(e.pctValor, corDaProjecao(e.pctValor)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${e.projecao !== null
        ? htmlPct(e.projecao, corDaProjecao(e.projecao)) : '<span class="fraco">—</span>'}</td>
    </tr>`).join('');

  const c = pix.consolidado;
  const rodape = c ? `
    <tr>
      <td><strong>Total do setor</strong><span class="sub">soma das metas das equipes</span></td>
      <td class="n"><strong>${esc(brl(c.realizado))}</strong></td>
      <td class="n">—</td>
      <td class="n">${c.meta !== null ? `<strong>${esc(brl(c.meta))}</strong>` : '<span class="fraco">—</span>'}</td>
      <td class="n">${c.meta !== null
        ? htmlPct(c.pctValor, corDaProjecao(c.pctValor)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${c.projecao !== null
        ? htmlPct(c.projecao, corDaProjecao(c.projecao)) : '<span class="fraco">—</span>'}</td>
    </tr>` : '';

  return `<div class="divisor">Meta de Pix por equipe</div>
    ${htmlTabela(cabecalho, linhas + rodape)}`;
}

function blocoRanking(pix: BlocoPixFechamento): string {
  const itens = pix.ranking.map(r => ({
    nome: r.nome,
    valor: r.valor,
    qtd: r.acordos,
    detalhe: `${brl(r.comissao)} de comissão`,
  }));

  return `<div class="divisor">Ranking de Pix por operador</div>
    ${htmlPodio(itens)}${htmlRankingBarras(itens)}`;
}
