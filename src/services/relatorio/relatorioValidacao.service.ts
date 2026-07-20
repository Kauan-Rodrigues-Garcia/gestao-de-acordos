/**
 * relatorioValidacao.service.ts — validação de relatório (Analítico + Diário)
 * por setor/mês (Fase 1 de validação). Watermark por dia: uma correção pontual
 * não derruba o mês inteiro. Ver supabase/migrations/20260721b_fase1_validacao_relatorio.sql.
 */
import { supabase } from '@/lib/supabase';

export type OrigemRelatorio = 'analitico' | 'diario';

export interface StatusOrigem {
  origem: OrigemRelatorio;
  diasComDado: number;
  diasValidados: number;
  valorAtual: number;
  valorValidado: number;
}

export function statusOrigemLabel(s: StatusOrigem): 'sem_dados' | 'pendente' | 'parcial' | 'validado' {
  if (s.diasComDado === 0) return 'sem_dados';
  if (s.diasValidados === 0) return 'pendente';
  if (s.diasValidados < s.diasComDado) return 'parcial';
  return 'validado';
}

export async function getStatusValidacaoRelatorio(
  empresaId: string, setorId: string, mes: number, ano: number,
): Promise<{ status: StatusOrigem[]; erro: string | null }> {
  const { data, error } = await supabase.rpc('fn_relatorio_status_validacao', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes, p_ano: ano,
  });
  if (error) return { status: [], erro: error.message };
  if (!data) return { status: [], erro: null };
  const status = (data as {
    origem: string; dias_com_dado: number; dias_validados: number;
    valor_atual: number; valor_validado: number;
  }[]).map(r => ({
    origem: r.origem as OrigemRelatorio,
    diasComDado: Number(r.dias_com_dado) || 0,
    diasValidados: Number(r.dias_validados) || 0,
    valorAtual: Number(r.valor_atual) || 0,
    valorValidado: Number(r.valor_validado) || 0,
  }));
  return { status, erro: null };
}

export async function validarRelatorioSetor(
  empresaId: string, setorId: string, mes: number, ano: number, origem?: OrigemRelatorio,
): Promise<{ ok: boolean; erro: string | null; diasValidados: number }> {
  const { data, error } = await supabase.rpc('fn_relatorio_validar_setor', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes, p_ano: ano,
    ...(origem ? { p_origem: origem } : {}),
  });
  if (error) return { ok: false, erro: error.message, diasValidados: 0 };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; erro: string | null; dias_validados: number } | undefined;
  return { ok: row?.ok ?? false, erro: row?.erro ?? null, diasValidados: Number(row?.dias_validados) || 0 };
}

export async function reabrirRelatorioSetor(
  empresaId: string, setorId: string, mes: number, ano: number, motivo: string, origem?: OrigemRelatorio,
): Promise<{ ok: boolean; erro: string | null; diasRemovidos: number }> {
  const { data, error } = await supabase.rpc('fn_relatorio_reabrir_setor', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes, p_ano: ano, p_motivo: motivo,
    ...(origem ? { p_origem: origem } : {}),
  });
  if (error) return { ok: false, erro: error.message, diasRemovidos: 0 };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; erro: string | null; dias_removidos: number } | undefined;
  return { ok: row?.ok ?? false, erro: row?.erro ?? null, diasRemovidos: Number(row?.dias_removidos) || 0 };
}
