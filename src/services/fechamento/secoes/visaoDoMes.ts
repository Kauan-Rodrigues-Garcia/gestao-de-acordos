/**
 * visaoDoMes.ts — a seção que responde "quanto entrou, quando e como".
 *
 * Abre pelos números, sustenta com a evolução diária e fecha com a composição.
 * É a única seção que todo relatório tem, em qualquer escopo — inclusive o do
 * operador que baixa o próprio fechamento.
 */

import { esc, brl, num, comSinal, pct, ehFimDeSemana } from '../formato';
import { COR_QUARTIL, corDaProjecao, corDaVariacao, COR_NEUTRA } from '../graficos/paleta';
import { svgBarrasDiarias, type DiaBarra } from '../graficos/barrasDiarias';
import { svgDonut } from '../graficos/donut';
import { barraProgressoMarcos } from '../graficos/progressoMarcos';
import { htmlCartoes, htmlCabecalhoSecao, painel } from './componentes';
import type { DadosFechamento } from '../tipos';

export function secaoVisaoDoMes(d: DadosFechamento): string {
  const { resumo, diasUteis } = d;
  const proj = resumo.projecao;

  // ── Progresso da meta, com os degraus em cascata ─────────────────────────
  const progresso = resumo.meta
    ? barraProgressoMarcos({
      realizado: resumo.totalBruto,
      meta: resumo.meta,
      opcoes: {
        marcos: d.metasExtrasEscopo.map((v, i) => ({ valor: v, rotulo: `${i + 2}ª meta` })),
        mostrarLegenda: true,
      },
    })
    : { html: '', batidos: 0, proximo: null };

  const linhaMetas = resumo.meta && d.metasExtrasEscopo.length
    ? `<p class="ajuda" style="margin-top:10px">
        ${progresso.batidos} de ${d.metasExtrasEscopo.length + 1} metas do mês batidas.
        ${progresso.proximo
          ? `Faltam ${esc(brl(progresso.proximo.valor - resumo.totalBruto))} para a ${esc(progresso.proximo.rotulo)}.`
          : 'Todas as metas do mês foram alcançadas.'}
      </p>`
    : '';

  const blocoMeta = resumo.meta
    ? painel(`${htmlCabecalhoSecao({
      titulo: 'Progresso da meta',
      rotuloSlide: 'Visão do mês',
    })}${progresso.html}${linhaMetas}`)
    : '';

  // ── Cartões ───────────────────────────────────────────────────────────────
  const cartoes = htmlCartoes([
    {
      rotulo: 'Total recebido', valor: brl(resumo.totalBruto),
      apoio: `${num(resumo.qtdPagamentos)} pagamento(s)`, cor: COR_QUARTIL[1],
    },
    resumo.totalHO > 0
      ? { rotulo: 'H.O. retido', valor: brl(resumo.totalHO), apoio: 'parcela que fica na operação' }
      : null,
    proj
      ? {
        rotulo: 'Projeção', valor: pct(proj.projecaoPct),
        apoio: 'do esperado no período', cor: corDaProjecao(proj.projecaoPct),
      }
      : null,
    proj
      ? {
        rotulo: 'Contra o esperado', valor: comSinal(proj.diferenca),
        apoio: proj.diferenca >= 0 ? 'acima do ritmo' : 'abaixo do ritmo',
        cor: corDaVariacao(proj.diferenca),
      }
      : null,
    proj?.quartil
      ? {
        rotulo: 'Quartil', valor: `${proj.quartil.quartil}º`,
        apoio: `faixa a partir de ${pct(proj.quartil.min_pct)}`,
        cor: COR_QUARTIL[proj.quartil.quartil],
      }
      : null,
    {
      rotulo: 'Dias úteis', valor: `${diasUteis.decorridos} de ${diasUteis.total}`,
      apoio: d.alvo.mesFechado ? 'mês fechado' : 'mês em andamento',
    },
    resumo.melhorDia
      ? {
        rotulo: 'Melhor dia', valor: `Dia ${resumo.melhorDia.dia}`,
        apoio: `${brl(resumo.melhorDia.bruto)} · ${num(resumo.melhorDia.qtd)} pagamento(s)`,
      }
      : null,
    proj
      ? { rotulo: 'Meta por dia útil', valor: brl(proj.metaDiaria), apoio: 'ritmo necessário' }
      : null,
  ]);

  // ── Comparativo com o mês anterior ───────────────────────────────────────
  const comparativo = d.comparativo ? blocoComparativo(d) : '';

  // ── Direto / Extra ────────────────────────────────────────────────────────
  const vinculo = resumo.vinculo
    ? painel(`${htmlCabecalhoSecao({
      titulo: 'Composição por vínculo',
      ajuda: 'Classificação que vem do próprio relatório do ERP (coluna "Tipo comissão"). '
        + 'Os três somam exatamente o total recebido.',
    })}${htmlCartoes([
      {
        rotulo: 'Recebimento direto', valor: brl(resumo.vinculo.direto),
        apoio: `${num(resumo.vinculo.qtdDireto)} pagamento(s)`, cor: '#6366f1',
      },
      {
        rotulo: 'Recebimento extra', valor: brl(resumo.vinculo.extra),
        apoio: `${num(resumo.vinculo.qtdExtra)} pagamento(s)`, cor: '#f59e0b',
      },
      {
        rotulo: 'Sem vínculo definido', valor: brl(resumo.vinculo.naoTabulado),
        apoio: `${num(resumo.vinculo.qtdNaoTabulado)} pagamento(s) sem classificação`,
        cor: COR_NEUTRA,
      },
    ], 'tres')}`)
    : '';

  // ── Evolução diária ───────────────────────────────────────────────────────
  const barras: DiaBarra[] = resumo.porDia.map(p => ({
    dia: p.dia,
    valor: p.bruto,
    qtd: p.qtd,
    naoUtil: ehFimDeSemana(d.alvo.mes, p.dia),
  }));

  const evolucao = painel(`${htmlCabecalhoSecao({
    titulo: 'Evolução diária',
    ajuda: 'Recebimento por dia do mês. A linha tracejada é a meta por dia útil; '
      + 'as faixas cinza são fins de semana.',
  })}${svgBarrasDiarias(barras, { metaDiaria: proj?.metaDiaria ?? null })}`);

  const formas = resumo.porForma.length
    ? painel(`${htmlCabecalhoSecao({
      titulo: 'Formas de pagamento',
      ajuda: 'Como o dinheiro entrou no mês.',
    })}${svgDonut(
      resumo.porForma.map(f => ({ rotulo: f.rotulo, valor: f.bruto, qtd: f.qtd })),
      resumo.totalBruto,
    )}`)
    : '';

  return `${blocoMeta}${cartoes}${comparativo}${vinculo}${evolucao}${formas}`;
}

/** O bloco de variação contra o mês anterior. */
function blocoComparativo(d: DadosFechamento): string {
  const c = d.comparativo;
  if (!c) return '';

  if (!c.temBase) {
    return painel(`${htmlCabecalhoSecao({
      titulo: `Comparativo com ${c.mesAnteriorRotulo}`,
    })}<p class="vazio">
      Não há relatório importado em ${esc(c.mesAnteriorRotulo)} para este escopo —
      sem base de comparação, nenhuma variação é exibida.
    </p>`);
  }

  const item = (rotulo: string, variacao: number, variacaoPct: number | null, detalhe: string) => `
    <div class="comp-item">
      <span class="rotulo-forte">${esc(rotulo)}</span>
      <span class="comp-variacao" style="color:${corDaVariacao(variacao)}">
        ${esc(variacaoPct !== null ? comSinal(variacaoPct, v => pct(v)) : comSinal(variacao))}
      </span>
      <span class="comp-detalhe">${esc(detalhe)}</span>
    </div>`;

  return painel(`${htmlCabecalhoSecao({
    titulo: `Comparativo com ${c.mesAnteriorRotulo}`,
    ajuda: 'Mesma base, mesmo escopo — é a régua para o número deste mês.',
  })}<div class="comparativo">
    ${item('Recebido', c.variacaoBruto, c.variacaoBrutoPct,
      `${brl(c.brutoAnterior)} → ${brl(d.resumo.totalBruto)} (${comSinal(c.variacaoBruto)})`)}
    ${item('Pagamentos', c.variacaoQtd, c.variacaoQtdPct,
      `${num(c.qtdAnterior)} → ${num(d.resumo.qtdPagamentos)}`)}
    ${c.metaAnterior !== null && d.resumo.meta !== null
      ? item('Meta', d.resumo.meta - c.metaAnterior,
        c.metaAnterior ? Math.round(((d.resumo.meta - c.metaAnterior) / c.metaAnterior) * 1000) / 10 : null,
        `${brl(c.metaAnterior)} → ${brl(d.resumo.meta)}`)
      : ''}
  </div>`);
}
