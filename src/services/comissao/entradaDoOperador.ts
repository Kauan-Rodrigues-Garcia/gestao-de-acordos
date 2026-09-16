/**
 * entradaDoOperador.ts — de «linha de meta + recebido» para a entrada do cálculo.
 *
 * O Dashboard e a aba Comissão da tela de Metas chegam à comissão por caminhos
 * diferentes: um pelo painel de metas, que já tem o recebido agregado; o outro
 * pelo resumo por operador. Os dois passam por aqui, e é aqui que ficam as duas
 * decisões que não podem divergir entre as telas:
 *
 *   • a unidade — PaguePlay em H.O. (`PP_HO_PERCENTUAL`), BookPlay em bruto;
 *   • a origem — a configuração é a do setor e da equipe do usuário ORIGINAL,
 *     também para o clone; a exceção por usuário é achada pela pessoa;
 *   • os bônus — só os que têm a pessoa entre os usuários.
 *
 * Sem React, sem fetch.
 */
import { PP_HO_PERCENTUAL, getTodayISO } from '@/lib/index';
import { lerMetaIndiretaDaLinha } from '@/services/metas/metaIndireta';
import type { BonusComissao } from './bonus';
import { configDoOperador, type ConfigComissao, type EntradaComissao } from './comissao';

/** O mínimo de uma linha de `metas` (tipo operador) que a comissão lê. */
export interface MetaLinhaBruta {
  tipo?: string;
  referencia_id?: string;
  meta_valor: number | null;
  /** JSONB: a leitura tolera coluna ausente ou valor fora do formato. */
  metas_extras?: unknown;
  meta_indireta_ativa?: boolean | null;
  meta_indireta_valor?: number | null;
}

/**
 * Os degraus em cascata de uma linha de meta.
 *
 * A coluna é JSONB e chega da forma que o banco guardou: lista de número, lista
 * com texto, ou nada numa linha antiga. Zero e lixo saem — degrau de R$ 0,00
 * seria uma faixa atingida por todo mundo.
 */
export function lerMetasExtras(valor: unknown): number[] {
  return (Array.isArray(valor) ? valor : [])
    .map(v => Number(v) || 0)
    .filter(v => v > 0);
}

export function montarEntradaComissao(params: {
  meta: MetaLinhaBruta | null;
  recebidoBruto: number;
  recebidoHO: number;
  recebidoIndiretoBruto: number;
  isPaguePlay: boolean;
  configs: readonly ConfigComissao[];
  setorOrigemId: string | null;
  equipeOrigemId: string | null;
  /** A pessoa — acha a exceção por usuário e os bônus dela. */
  operadorId: string | null;
  /** Os bônus do mês (de todos); aqui ficam só os da pessoa. */
  bonus?: readonly BonusComissao[];
  /** `yyyy-MM-dd` → realizado direto do dia, JÁ na unidade. Só a meta especial lê. */
  recebidoPorDia?: Readonly<Record<string, number>> | null;
  hoje?: string;
}): EntradaComissao {
  const { meta, isPaguePlay, operadorId } = params;
  const { config, doSetor, origem } = configDoOperador({
    configs: params.configs,
    setorId: params.setorOrigemId,
    equipeId: params.equipeOrigemId,
    operadorId,
  });

  return {
    metaBruta: Number(meta?.meta_valor) || null,
    metasExtrasBrutas: lerMetasExtras(meta?.metas_extras),
    metaIndiretaBruta: lerMetaIndiretaDaLinha(meta),
    // O H.O. do analítico vem linha a linha do relatório — não é o bruto
    // convertido. Por isso o direto já chega na unidade, e só metas e indireto
    // passam pelo fator.
    recebidoDireto: isPaguePlay ? params.recebidoHO : params.recebidoBruto,
    recebidoIndiretoBruto: params.recebidoIndiretoBruto,
    fatorUnidade: isPaguePlay ? PP_HO_PERCENTUAL : 1,
    config,
    doSetor,
    origemConfig: origem,
    bonus: operadorId ? (params.bonus ?? []).filter(b => b.usuarioIds.includes(operadorId)) : [],
    recebidoPorDia: params.recebidoPorDia ?? null,
    hoje: params.hoje ?? getTodayISO(),
  };
}

/**
 * operador → `yyyy-MM-dd` → realizado do dia, na unidade da comissão.
 *
 * Lê as linhas do agregado do Dashboard (`fn_analitico_dashboard_mes`), que
 * trazem dia e operador — o resumo por operador é só do mês e não serve à meta
 * especial com período.
 */
export function recebidoPorDiaDasLinhas(
  linhas: readonly { dia: string; operador_id: string | null; total: number; total_ho: number }[],
  isPaguePlay: boolean,
): Record<string, Record<string, number>> {
  const saida: Record<string, Record<string, number>> = {};
  for (const l of linhas) {
    if (!l.operador_id) continue;
    const dia = String(l.dia).slice(0, 10);
    const valor = Number(isPaguePlay ? l.total_ho : l.total) || 0;
    const daPessoa = saida[l.operador_id] ?? (saida[l.operador_id] = {});
    daPessoa[dia] = (daPessoa[dia] ?? 0) + valor;
  }
  return saida;
}
