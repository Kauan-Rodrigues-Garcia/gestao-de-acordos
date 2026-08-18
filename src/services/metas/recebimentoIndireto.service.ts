/**
 * recebimentoIndireto.service.ts — o acumulado INDIRETO do mês, por operador.
 *
 * A regra do que conta vive no banco (`fn_recebimento_indireto_mes`, migration
 * `20260818160000`) e não aqui: acordo `tipo_vinculo = 'extra'` com
 * `status = 'pago'`, no mês de `coalesce(data_pagamento, vencimento)`. Somar
 * isso no cliente exigiria baixar os acordos do mês inteiro para devolver uma
 * linha por pessoa.
 *
 * A RPC é `SECURITY INVOKER`: quem chama recebe só o que a RLS de `acordos`
 * deixa ver. Operador vê o próprio total; líder, o do setor dele. É de
 * propósito — este número aparece na tela de cada um.
 *
 * O que este arquivo decide é só o formato: um mapa `operador_id → total`,
 * porque todo consumidor cruza com uma lista de operadores que já tem.
 */

import { supabase } from '@/lib/supabase';

export interface RecebimentoIndiretoOperador {
  operador_id: string;
  /** Valor BRUTO. O H.O. é derivado na tela, igual ao resto da PaguePlay. */
  total_bruto: number;
  /** Quantos acordos extra pagos compõem o total. */
  qtd: number;
}

/** `operador_id → { bruto, qtd }`. Quem não aparece não recebeu nada. */
export type MapaRecebimentoIndireto = Record<string, { bruto: number; qtd: number }>;

/**
 * Busca o recebimento indireto do mês.
 *
 * @param mes  'yyyy-MM' — o mesmo formato que as telas de analítico já usam.
 * @param operadores  Restringe a consulta. `undefined` = todos os que a RLS
 *   permitir. Passar a lista quando ela já existe evita trazer o setor inteiro
 *   para exibir cinco linhas.
 *
 * Erro vira mapa vazio, nunca exceção: este número é um complemento da tela de
 * metas, e derrubar o painel inteiro porque o extra não veio seria trocar uma
 * informação a menos por uma tela quebrada. O aviso fica no console.
 */
export async function buscarRecebimentoIndireto(params: {
  empresaId: string;
  /** 'yyyy-MM' */
  mes: string;
  operadores?: readonly string[];
}): Promise<MapaRecebimentoIndireto> {
  const { empresaId, mes, operadores } = params;
  if (!empresaId || !/^\d{4}-\d{2}$/.test(mes)) return {};

  try {
    const { data, error } = await supabase.rpc('fn_recebimento_indireto_mes', {
      p_empresa_id: empresaId,
      // A RPC trunca ao mês; o dia 01 é só um representante válido.
      p_mes: `${mes}-01`,
      p_operadores: operadores && operadores.length ? [...operadores] : null,
    });
    if (error) {
      console.warn('[recebimentoIndireto] fn_recebimento_indireto_mes:', error.message);
      return {};
    }
    const mapa: MapaRecebimentoIndireto = {};
    for (const l of (data ?? []) as RecebimentoIndiretoOperador[]) {
      mapa[l.operador_id] = { bruto: Number(l.total_bruto) || 0, qtd: Number(l.qtd) || 0 };
    }
    return mapa;
  } catch (e) {
    console.warn('[recebimentoIndireto]', e instanceof Error ? e.message : e);
    return {};
  }
}
