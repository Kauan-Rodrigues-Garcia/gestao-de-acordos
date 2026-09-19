/**
 * htmlPremiacoes.ts — Premiações e Comissões como página HTML.
 *
 * Pedido de 19/09/2026: a aba passa a baixar HTML além do Excel, com a cara do
 * Gestão e sempre em fundo claro (ver `relatorioGestao`). É a tela em arquivo:
 * os mesmos cards, as mesmas colunas (só as do tipo do recorte, `tiposNoRecorte`)
 * e o valor de quem bateu no selo verde, com a meta atingida ao lado.
 *
 * Recebe as `linhas` já calculadas e na ordem da tela — nada é recalculado.
 * Todo texto do banco passa por `esc`. Função pura: nada de `document`.
 */
import { esc, brl } from '@/services/fechamento/formato';
import {
  COR_TIPO_REMUNERACAO, kpiHtml, paginaGestaoHtml, type AvisoArquivo,
} from '@/lib/relatorioGestao';
import {
  ROTULO_TIPO, resumirPremiacoes, tiposNoRecorte, valorDoTipo, type LinhaPremiacao, type TipoRemuneracao,
} from './calculoPremiacoes';
import { rotuloPeriodo, tituloPremiacoes, type DadosPlanilhaPremiacoes } from './planilhaPremiacoes';

const TRACO = '<span class="tenue">—</span>';

function celulaValor(l: LinhaPremiacao, tipo: TipoRemuneracao): string {
  const v = valorDoTipo(l, tipo);
  if (v === null) return TRACO;
  if (v <= 0) return `<span class="fraco">${esc(brl(0))}</span>`;
  const faixa = l.tipo === tipo && l.faixa !== null
    ? `<span class="pill" style="background:#E6F4E9;color:#008B1D">${l.faixa}ª meta</span> `
    : '';
  return `${faixa}<span class="valor-ok">${esc(brl(v))}</span>`;
}

function seloCidade(l: LinhaPremiacao): string {
  if (!l.tipo || !l.celula) return '';
  const cor = COR_TIPO_REMUNERACAO[l.tipo];
  return ` <span class="pill" style="background:#${cor.fundo};color:#${cor.texto};text-transform:uppercase;font-size:9.5px">${esc(l.celula)}</span>`;
}

export function montarHtmlPremiacoes(d: DadosPlanilhaPremiacoes): string {
  const tipos = tiposNoRecorte(d.linhas);
  const resumo = resumirPremiacoes(d.linhas);
  const alvo = d.setorNome ?? 'Todos os setores';
  const titulo = tituloPremiacoes(tipos);
  const periodo = rotuloPeriodo(d.mes);

  const cidades = (t: TipoRemuneracao) =>
    [...new Set(d.linhas.filter(l => l.tipo === t && l.celula).map(l => l.celula))].join(', ')
    || (t === 'premiacao' ? 'Birigui' : 'Marília');

  // Os cards, na ordem da tela.
  const cards = tipos.map(t => kpiHtml({
    rotulo: `${ROTULO_TIPO[t]} · ${cidades(t)}`,
    valor: brl(resumo[t].total),
    detalhe: `${resumo[t].bateram} de ${resumo[t].pessoas} bateram a meta`,
    tom: 'primario',
    icone: t === 'premiacao' ? 'medalha' : 'cifrao',
  }));
  cards.push(tipos.length === 1
    ? kpiHtml({
      rotulo: 'Bateram a meta',
      valor: `${resumo[tipos[0]].bateram} de ${resumo[tipos[0]].pessoas}`,
      detalhe: `Com ${ROTULO_TIPO[tipos[0]].toLowerCase()} a receber`,
      tom: 'sucesso',
      icone: 'trofeu',
    })
    : kpiHtml({
      rotulo: 'Total a pagar',
      valor: brl(resumo.premiacao.total + resumo.comissao.total),
      detalhe: 'Premiação + comissão, sem bônus',
      tom: 'sucesso',
      icone: 'wallet',
    }));
  cards.push(kpiHtml({
    rotulo: 'Crachás',
    valor: `${resumo.comCracha} de ${resumo.total}`,
    detalhe: 'Pessoas com crachá cadastrado',
    tom: resumo.total > 0 && resumo.comCracha === resumo.total ? 'sucesso' : 'alerta',
    icone: 'selo',
  }));

  const linhas = d.linhas.map(l => `<tr>
<td class="c n"${l.estado === 'bateu' ? ' style="box-shadow:inset 3px 0 0 0 #008B1D"' : ''}>${l.cracha ? esc(l.cracha) : TRACO}</td>
<td class="nome">${esc(l.nome)}${l.equipeNome ? `<small>${esc(l.equipeNome)}</small>` : ''}</td>
<td style="white-space:nowrap">${esc(l.setorNome)}${seloCidade(l)}</td>
${tipos.map(t => `<td class="n">${celulaValor(l, t)}</td>`).join('')}
<td class="fraco">${l.obs ? esc(l.obs) : TRACO}</td>
</tr>`).join('\n');

  const total = (t: TipoRemuneracao) => d.linhas.reduce((s, l) => s + (valorDoTipo(l, t) ?? 0), 0);
  const bateram = d.linhas.filter(l => l.estado === 'bateu').length;
  const pessoas = d.linhas.length;

  const tabela = pessoas === 0
    ? '<div class="cartao c fraco">Nenhuma pessoa neste recorte.</div>'
    : `<div class="tabela"><table>
<thead><tr>
  <th class="c">Crachá</th><th>Nome</th><th>Setor</th>
  ${tipos.map(t => `<th class="n">${esc(ROTULO_TIPO[t])} (R$)</th>`).join('')}
  <th>Obs.</th>
</tr></thead>
<tbody>
${linhas}
</tbody>
<tfoot><tr>
  <td colspan="3">Total · ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}</td>
  ${tipos.map(t => `<td class="n total">${esc(brl(total(t)))}</td>`).join('')}
  <td class="fraco" style="font-weight:400">${bateram} ${bateram === 1 ? 'bateu' : 'bateram'} a meta</td>
</tr></tfoot>
</table></div>`;

  const avisos: AvisoArquivo[] = [];
  if (d.parcial) {
    avisos.push({ tom: 'info', texto: `${periodo} ainda está aberto: valores parciais, de quem já tinha batido a meta até o dia em que foi baixado.` });
  }
  const semCidade = [...new Set(d.linhas.filter(l => !l.tipo).map(l => l.setorNome))];
  if (semCidade.length) {
    avisos.push({ tom: 'info', texto: `Sem cidade no RH — sem valor: ${semCidade.join(', ')}.` });
  }

  return paginaGestaoHtml({
    tituloAba: `${titulo} · ${alvo} · ${periodo}`,
    icone: 'medalha',
    titulo,
    subtitulo: `${alvo} · ${periodo} · ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}`,
    empresaNome: d.empresaNome,
    geradoEm: d.geradoEm,
    avisos,
    corpo: `<div class="kpis">${cards.join('\n')}</div>
${tabela}
<p class="nota">Valor = comissão por meta do mês (faixa atingida × %), sem bônus. Vazio = sem meta ou sem cidade; R$ 0,00 = tinha meta e não bateu.</p>`,
  });
}
