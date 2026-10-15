/**
 * htmlPremiacoes.ts — Premiações e Comissões como página HTML.
 *
 * Pedido de 19/09/2026: a aba passa a baixar HTML além do Excel, com a cara do
 * Gestão e sempre em fundo claro (ver `relatorioGestao`). É a tela em arquivo:
 * as mesmas colunas (só as do tipo do recorte, `tiposNoRecorte`).
 *
 * 15/10/2026: o arquivo é o que vai para a diretoria, e segue a ordem nova da
 * tela — indicadores, resultado por setor (ou equipe) e por meta atingida, e o
 * detalhamento por pessoa agrupado por setor, com o resultado num selo só.
 *
 * Recebe as `linhas` já calculadas e na ordem da tela — nada é recalculado.
 * Todo texto do banco passa por `esc`. Função pura: nada de `document`.
 */
import { esc, brl } from '@/services/fechamento/formato';
import {
  COR_TIPO_REMUNERACAO, kpiHtml, paginaGestaoHtml, type AvisoArquivo,
} from '@/lib/relatorioGestao';
import {
  agruparPremiacoes, chaveDoAgrupamento, distribuirPorFaixa, formatarPercentual, resultadoDaLinha,
  ROTULO_TIPO, resumirPremiacoes, tiposNoRecorte, valorDoTipo,
  type GrupoPremiacao, type LinhaPremiacao, type TipoRemuneracao,
} from './calculoPremiacoes';
import { rotuloPeriodo, tituloPremiacoes, type DadosPlanilhaPremiacoes } from './planilhaPremiacoes';

const TRACO = '<span class="tenue">—</span>';

function celulaValor(l: LinhaPremiacao, tipo: TipoRemuneracao): string {
  const v = valorDoTipo(l, tipo);
  if (v === null) return TRACO;
  if (v <= 0) return `<span class="fraco">${esc(brl(0))}</span>`;
  return `<span class="valor-pago">${esc(brl(v))}</span>`;
}

function seloCidade(celula: string | null, tipo: TipoRemuneracao | null): string {
  if (!tipo || !celula) return '';
  const cor = COR_TIPO_REMUNERACAO[tipo];
  return ` <span class="pill" style="background:#${cor.fundo};color:#${cor.texto};text-transform:uppercase;font-size:9.5px">${esc(celula)}</span>`;
}

const pessoas = (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;

function tabelaGrupos(grupos: readonly GrupoPremiacao[], rotulo: string, mostrarCidade: boolean): string {
  const total = grupos.reduce((t, g) => t + g.total, 0);
  const qtd = grupos.reduce((t, g) => t + g.pessoas, 0);
  const bateram = grupos.reduce((t, g) => t + g.bateram, 0);
  const linhas = grupos.map(g => {
    const taxa = g.pessoas ? g.bateram / g.pessoas : 0;
    return `<tr>
<td class="nome">${esc(g.nome)}${mostrarCidade ? seloCidade(g.celula, g.tipo) : ''}</td>
<td class="n"><b>${g.bateram}</b> <span class="fraco">de ${g.pessoas}</span></td>
<td style="white-space:nowrap"><span class="mini"><i style="width:${(taxa * 100).toFixed(1)}%"></i></span><span class="fraco">${esc(formatarPercentual(taxa))}</span></td>
<td class="n"><b>${esc(brl(g.total))}</b></td>
</tr>`;
  }).join('\n');
  return `<table>
<thead><tr><th>${esc(rotulo)}</th><th class="n">Bateram</th><th>Atingimento</th><th class="n">A pagar</th></tr></thead>
<tbody>${linhas}</tbody>
<tfoot><tr>
<td>Total</td>
<td class="n">${bateram} <span class="fraco" style="font-weight:400">de ${qtd}</span></td>
<td class="fraco" style="font-weight:400">${qtd ? esc(formatarPercentual(bateram / qtd)) + ' no recorte' : '—'}</td>
<td class="n total">${esc(brl(total))}</td>
</tr></tfoot>
</table>`;
}

function barrasFaixas(linhas: readonly LinhaPremiacao[]): string {
  const d = distribuirPorFaixa(linhas);
  const maior = Math.max(1, d.naoBateram, ...d.faixas.map(f => f.pessoas));
  const barra = (rotulo: string, n: number, valor: number | null, cor: string) => `<div class="barra">
<span>${esc(rotulo)}</span>
<span class="trilho"><i style="width:${n > 0 ? Math.max((n / maior) * 100, 2).toFixed(1) : 0}%;background:${cor}"></i></span>
<span class="q"><b>${n}</b> ${n === 1 ? 'pessoa' : 'pessoas'}${valor !== null ? ` · ${esc(brl(valor))}` : ''}</span>
</div>`;
  return [
    ...d.faixas.map(f => barra(`${f.faixa}ª meta`, f.pessoas, f.total, 'var(--sucesso)')),
    barra('Não bateram', d.naoBateram, null, 'var(--tenue)'),
    d.semValor ? `<p class="nota">${pessoas(d.semValor)} sem meta, configuração ou cidade ${d.semValor === 1 ? 'fica' : 'ficam'} fora da conta.</p>` : '',
  ].join('\n');
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

  const comTipo = resumo.premiacao.pessoas + resumo.comissao.pessoas;
  const bateram = resumo.premiacao.bateram + resumo.comissao.bateram;
  const totalAPagar = resumo.premiacao.total + resumo.comissao.total;
  const semCracha = resumo.total - resumo.comCracha;

  // Os cards, na ordem da tela.
  const cards = [
    tipos.length === 1
      ? kpiHtml({
        rotulo: `${ROTULO_TIPO[tipos[0]]} · ${cidades(tipos[0])}`,
        valor: brl(resumo[tipos[0]].total),
        detalhe: `A pagar em ${periodo}`,
        tom: 'primario',
        icone: tipos[0] === 'premiacao' ? 'medalha' : 'cifrao',
      })
      : kpiHtml({
        rotulo: 'Total a pagar',
        valor: brl(totalAPagar),
        detalhe: `Premiação ${brl(resumo.premiacao.total)} · Comissão ${brl(resumo.comissao.total)}`,
        tom: 'primario',
        icone: 'wallet',
      }),
    kpiHtml({
      rotulo: 'Bateram a meta',
      valor: `${bateram} de ${comTipo}`,
      detalhe: comTipo ? `${formatarPercentual(bateram / comTipo)} de atingimento` : 'Ninguém com cidade no RH',
      tom: 'sucesso',
      icone: 'trofeu',
    }),
    kpiHtml({
      rotulo: 'Média por quem bateu',
      valor: bateram ? brl(totalAPagar / bateram) : '—',
      detalhe: 'Soma dos valores ÷ quem bateu',
      tom: 'neutro',
      icone: 'pessoas',
    }),
    kpiHtml({
      rotulo: 'Crachás',
      valor: `${resumo.comCracha} de ${resumo.total}`,
      detalhe: semCracha > 0 ? `${semCracha} sem crachá — necessário para pagar` : 'Todos com crachá cadastrado',
      tom: resumo.total > 0 && semCracha === 0 ? 'sucesso' : 'alerta',
      icone: 'selo',
    }),
  ];

  // O recorte resumido.
  const chave = chaveDoAgrupamento(d.linhas);
  const resumoRecorte = d.linhas.length === 0 ? '' : `<div class="grade2">
${chave ? `<div class="cartao"><h2>${chave === 'setor' ? 'Resultado por setor' : 'Resultado por equipe'}</h2>
<p class="leg">Quem bateu a meta e quanto cada um recebe, do maior valor ao menor</p>
${tabelaGrupos(agruparPremiacoes(d.linhas, chave), chave === 'setor' ? 'Setor' : 'Equipe', tipos.length > 1)}</div>` : ''}
<div class="cartao"><h2>Por meta atingida</h2>
<p class="leg">Até onde cada pessoa chegou no mês</p>
${barrasFaixas(d.linhas)}</div>
</div>`;

  // O detalhamento: em blocos de setor quando o recorte tem vários.
  const porSetor = chave === 'setor';
  const blocos = new Map<string, LinhaPremiacao[]>();
  for (const l of d.linhas) {
    const k = porSetor ? (l.setorId ?? `nome:${l.setorNome}`) : 'todos';
    const lista = blocos.get(k) ?? [];
    lista.push(l);
    blocos.set(k, lista);
  }
  const soma = (ls: readonly LinhaPremiacao[], t: TipoRemuneracao) => ls.reduce((s, l) => s + (valorDoTipo(l, t) ?? 0), 0);

  const corpoTabela = [...blocos.values()].map(ls => {
    const g = porSetor ? agruparPremiacoes(ls, 'setor')[0] : null;
    const cabecalhoGrupo = g
      ? `<tr class="grupo">
<td colspan="3">${esc(g.nome)}${seloCidade(g.celula, g.tipo)} <span class="fraco" style="font-weight:400;font-size:11px">${g.bateram} de ${g.pessoas} bateram</span></td>
${tipos.map(t => `<td class="n">${g.tipo === t ? esc(brl(soma(ls, t))) : ''}</td>`).join('')}
<td></td>
</tr>`
      : '';
    const linhas = ls.map(l => {
      const r = resultadoDaLinha(l);
      const sub = [porSetor ? null : l.setorNome, l.equipeNome].filter(Boolean).join(' · ');
      return `<tr>
<td class="c n">${l.cracha ? esc(l.cracha) : TRACO}</td>
<td class="nome">${esc(l.nome)}${sub ? `<small>${esc(sub)}</small>` : ''}</td>
<td><span class="res ${r.tom}">${esc(r.rotulo)}</span></td>
${tipos.map(t => `<td class="n">${celulaValor(l, t)}</td>`).join('')}
<td class="fraco">${r.detalhe ? esc(r.detalhe) : TRACO}</td>
</tr>`;
    }).join('\n');
    return cabecalhoGrupo + linhas;
  }).join('\n');

  const qtd = d.linhas.length;
  const tabela = qtd === 0
    ? '<div class="cartao c fraco">Nenhuma pessoa neste recorte.</div>'
    : `<h2 style="font-size:15px;margin:22px 0 8px">Detalhamento por pessoa</h2>
<div class="tabela"><table>
<thead><tr>
  <th class="c">Crachá</th><th>Nome</th><th>Resultado</th>
  ${tipos.map(t => `<th class="n">${esc(ROTULO_TIPO[t])} (R$)</th>`).join('')}
  <th>Observação</th>
</tr></thead>
<tbody>
${corpoTabela}
</tbody>
<tfoot><tr>
  <td colspan="3">Total · ${pessoas(qtd)}</td>
  ${tipos.map(t => `<td class="n total">${esc(brl(soma(d.linhas, t)))}</td>`).join('')}
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
    subtitulo: `${alvo} · ${periodo} · ${pessoas(qtd)}`,
    empresaNome: d.empresaNome,
    geradoEm: d.geradoEm,
    avisos,
    corpo: `<div class="kpis">${cards.join('\n')}</div>
${resumoRecorte}
${tabela}
<p class="nota">Valor = comissão por meta do mês (faixa atingida × %), sem bônus. Vazio = sem meta ou sem cidade; R$ 0,00 = tinha meta e não bateu.</p>`,
  });
}
