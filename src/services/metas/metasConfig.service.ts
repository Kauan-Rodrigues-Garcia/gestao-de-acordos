/**
 * metasConfig.service.ts — configuração mensal de metas (PaguePlay).
 * Feriados + quartis por empresa/mês/ano (tabela metas_config_mes).
 * Tolerante à migration ausente: get retorna null e a UI esconde a seção.
 */

import { supabase } from '@/lib/supabase';
import type { MetasConfigMes, QuartilConfig } from '@/lib/supabase';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';

function normalizar(row: MetasConfigMes): MetasConfigMes {
  return {
    ...row,
    feriados: Array.isArray(row.feriados) ? row.feriados : [],
    quartis:  Array.isArray(row.quartis) && row.quartis.length ? row.quartis : QUARTIS_PADRAO,
    // Coluna nova (20260714a): sem ela, o padrão é não contar o dia atual
    contar_dia_atual: row.contar_dia_atual === true,
  };
}

export async function getMetasConfig(
  empresaId: string, mes: number, ano: number,
): Promise<{ data: MetasConfigMes | null; dbAtiva: boolean }> {
  try {
    const { data, error } = await supabase
      .from('metas_config_mes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('mes', mes)
      .eq('ano', ano)
      .maybeSingle();
    if (error) {
      const faltando = /relation|does not exist|schema cache/i.test(error.message);
      if (!faltando) console.warn('[metasConfig] erro:', error.message);
      return { data: null, dbAtiva: !faltando };
    }
    return { data: data ? normalizar(data as unknown as MetasConfigMes) : null, dbAtiva: true };
  } catch {
    return { data: null, dbAtiva: false };
  }
}

export async function upsertMetasConfig(params: {
  empresaId: string;
  mes: number;
  ano: number;
  feriados: string[];
  quartis: QuartilConfig[];
  contarDiaAtual?: boolean;
  atualizadoPor: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('metas_config_mes')
    .upsert({
      empresa_id:       params.empresaId,
      mes:              params.mes,
      ano:              params.ano,
      feriados:         params.feriados,
      quartis:          params.quartis,
      contar_dia_atual: params.contarDiaAtual === true,
      atualizado_por:   params.atualizadoPor,
      atualizado_em:  new Date().toISOString(),
    } as never, { onConflict: 'empresa_id,mes,ano' });
  return { error: error?.message ?? null };
}
