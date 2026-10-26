/**
 * metasConfig.service.ts — configuração mensal de metas (PaguePlay).
 * Feriados + quartis por empresa/mês/ano (tabela metas_config_mes).
 * Tolerante à migration ausente: get retorna null e a UI esconde a seção.
 *
 * Dias úteis por setor (21/10/2026): o setor que trabalha diferente tem a
 * própria lista de feriados e o próprio `contar_dia_atual`, em
 * `metas_config_setor_mes`. `getMetasConfig` devolve as duas coisas juntas —
 * a geral em `data` e as exceções em `porSetor` — e quem conta dia útil
 * escolhe com `diasUteisDoSetor` (`lib/diasUteisDoSetor.ts`).
 */

import { supabase } from '@/lib/supabase';
import type { MetasConfigMes, MetasConfigSetorMes, QuartilConfig } from '@/lib/supabase';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { DiasUteisPorSetor } from '@/lib/diasUteisDoSetor';

function normalizar(row: MetasConfigMes): MetasConfigMes {
  return {
    ...row,
    feriados: Array.isArray(row.feriados) ? row.feriados : [],
    quartis:  Array.isArray(row.quartis) && row.quartis.length ? row.quartis : QUARTIS_PADRAO,
    // Coluna nova (20260714a): sem ela, o padrão é não contar o dia atual
    contar_dia_atual: row.contar_dia_atual === true,
  };
}

/**
 * As exceções de dias úteis do mês, por setor.
 *
 * Tabela ausente (migration 20261021140000 pendente) ou erro = mapa vazio:
 * todo setor segue a geral, que é exatamente o comportamento de antes dela.
 */
export async function buscarDiasUteisPorSetor(
  empresaId: string, mes: number, ano: number,
): Promise<{ porSetor: DiasUteisPorSetor; dbAtiva: boolean }> {
  try {
    const { data, error } = await supabase
      .from('metas_config_setor_mes')
      .select('setor_id, feriados, contar_dia_atual')
      .eq('empresa_id', empresaId)
      .eq('mes', mes)
      .eq('ano', ano);
    if (error) {
      const faltando = /relation|does not exist|schema cache/i.test(error.message);
      if (!faltando) console.warn('[metasConfig] dias por setor:', error.message);
      return { porSetor: {}, dbAtiva: !faltando };
    }
    const porSetor: DiasUteisPorSetor = {};
    for (const l of (data ?? []) as unknown as Pick<MetasConfigSetorMes, 'setor_id' | 'feriados' | 'contar_dia_atual'>[]) {
      if (!l?.setor_id) continue;
      porSetor[l.setor_id] = {
        feriados: Array.isArray(l.feriados) ? l.feriados : [],
        contar_dia_atual: l.contar_dia_atual === true,
      };
    }
    return { porSetor, dbAtiva: true };
  } catch {
    return { porSetor: {}, dbAtiva: false };
  }
}

export async function getMetasConfig(
  empresaId: string, mes: number, ano: number,
): Promise<{
  data: MetasConfigMes | null; dbAtiva: boolean; porSetor: DiasUteisPorSetor;
  /** A tabela das exceções existe (migration 20261021140000 aplicada). */
  porSetorAtiva: boolean;
}> {
  const [geral, setores] = await Promise.all([
    (async () => {
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
    })(),
    buscarDiasUteisPorSetor(empresaId, mes, ano),
  ]);
  return { ...geral, porSetor: setores.porSetor, porSetorAtiva: setores.dbAtiva };
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

/** Grava (ou cria) a exceção de dias úteis do setor no mês. */
export async function upsertDiasUteisSetor(params: {
  empresaId: string;
  setorId: string;
  mes: number;
  ano: number;
  feriados: string[];
  contarDiaAtual: boolean;
  atualizadoPor: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('metas_config_setor_mes')
    .upsert({
      empresa_id:       params.empresaId,
      setor_id:         params.setorId,
      mes:              params.mes,
      ano:              params.ano,
      feriados:         params.feriados,
      contar_dia_atual: params.contarDiaAtual,
      atualizado_por:   params.atualizadoPor,
      atualizado_em:    new Date().toISOString(),
    } as never, { onConflict: 'setor_id,mes,ano' });
  return { error: error?.message ?? null };
}

/**
 * Tira a exceção: o setor volta a seguir a configuração geral do mês.
 *
 * `excluiu = false` sem erro é a RLS recusando em silêncio (sem
 * `metas_excluir_dias_uteis`) — a tela não pode dizer que voltou.
 */
export async function removerDiasUteisSetor(params: {
  setorId: string; mes: number; ano: number;
}): Promise<{ excluiu: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('metas_config_setor_mes')
    .delete()
    .eq('setor_id', params.setorId)
    .eq('mes', params.mes)
    .eq('ano', params.ano)
    .select('id');
  if (error) return { excluiu: false, error: error.message };
  return { excluiu: ((data as unknown[] | null) ?? []).length > 0, error: null };
}
