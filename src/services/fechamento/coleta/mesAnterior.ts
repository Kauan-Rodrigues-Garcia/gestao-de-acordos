/**
 * mesAnterior.ts — a régua do número do mês.
 *
 * "R$ 1,17 milhão" não diz nada sozinho. "R$ 1,17 milhão, 17% acima de julho"
 * diz. É o bloco que transforma um total em tendência.
 *
 * ## Sem base é sem base
 *
 * Quando o mês anterior não tem relatório importado, o comparativo INFORMA a
 * ausência em vez de exibir "+100%". Uma variação calculada contra zero é
 * matematicamente verdadeira e jornalisticamente mentirosa — foi para evitar
 * isso que `temBase` existe.
 */

import {
  buscarAnaliticoDashboardMes, buscarResumoOperadoresAnalitico,
} from '@/services/analitico/analitico.service';
import { agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { deslocarMes, rotuloDoMes } from '@/lib/mesReferencia';
import type { EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import type { ComparativoMes } from '../tipos';

/** Variação percentual, ou `null` quando a base é zero. */
function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export async function coletarMesAnterior(params: {
  empresaId: string;
  mes: string;
  escopo: EscopoAnalitico;
  brutoAtual: number;
  qtdAtual: number;
  metaAnterior: number | null;
}): Promise<ComparativoMes | null> {
  const anterior = deslocarMes(params.mes, -1);

  try {
    const { data: linhas } = await buscarAnaliticoDashboardMes(params.empresaId, anterior);

    const vazio: ComparativoMes = {
      mesAnterior: anterior,
      mesAnteriorRotulo: rotuloDoMes(anterior),
      temBase: false,
      brutoAnterior: 0, qtdAnterior: 0, metaAnterior: params.metaAnterior,
      variacaoBruto: 0, variacaoBrutoPct: null,
      variacaoQtd: 0, variacaoQtdPct: null,
      posicaoAnteriorPorOperador: {},
    };

    if (!linhas.length) return vazio;

    const agg = agregarAnalitico(linhas, params.escopo);
    if (agg.bruto <= 0 && agg.qtd <= 0) return vazio;

    // As posições do mês anterior alimentam a curiosidade "quem mais subiu".
    // Falha aqui não invalida o comparativo — só some aquela curiosidade.
    const posicaoAnteriorPorOperador: Record<string, number> = {};
    try {
      const { data: resumo } = await buscarResumoOperadoresAnalitico(params.empresaId, anterior);
      resumo.forEach((r, i) => { posicaoAnteriorPorOperador[r.operador_id] = i + 1; });
    } catch { /* sem posições: a curiosidade de subida é omitida */ }

    return {
      mesAnterior: anterior,
      mesAnteriorRotulo: rotuloDoMes(anterior),
      temBase: true,
      brutoAnterior: agg.bruto,
      qtdAnterior: agg.qtd,
      metaAnterior: params.metaAnterior,
      variacaoBruto: params.brutoAtual - agg.bruto,
      variacaoBrutoPct: variacaoPct(params.brutoAtual, agg.bruto),
      variacaoQtd: params.qtdAtual - agg.qtd,
      variacaoQtdPct: variacaoPct(params.qtdAtual, agg.qtd),
      posicaoAnteriorPorOperador,
    };
  } catch {
    return null;
  }
}
