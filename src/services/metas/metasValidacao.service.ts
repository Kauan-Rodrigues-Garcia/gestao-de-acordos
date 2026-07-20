/**
 * metasValidacao.service.ts — trava de meta por setor (Fase 1 de validação).
 * Ver supabase/migrations/20260721a_fase1_trava_metas.sql.
 */
import { supabase } from '@/lib/supabase';

export interface MetaValidacaoStatus {
  status: 'aberto' | 'validado';
  validadoEm: string | null;
  motivoReabertura: string | null;
}

/** Status atual da trava do setor/mês. null = ainda nunca validado (equivale a 'aberto'). */
export async function getMetaValidacaoStatus(
  empresaId: string, setorId: string, mes: number, ano: number,
): Promise<MetaValidacaoStatus | null> {
  const { data, error } = await supabase
    .from('metas_validacoes')
    .select('status, validado_em, motivo_reabertura')
    .eq('empresa_id', empresaId).eq('setor_id', setorId)
    .eq('mes', mes).eq('ano', ano)
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: data.status === 'validado' ? 'validado' : 'aberto',
    validadoEm: data.validado_em,
    motivoReabertura: data.motivo_reabertura,
  };
}

/** Upsert de metas respeitando a trava. `bloqueados` = itens pulados (setor já validado). */
export async function upsertMetas(
  payloads: Record<string, unknown>[],
): Promise<{ salvos: number; bloqueados: { referencia_id: string; tipo: string }[]; error: string | null }> {
  const { data, error } = await supabase.rpc('fn_metas_upsert', { p_payloads: payloads as never });
  if (error) return { salvos: 0, bloqueados: [], error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { salvos: number; bloqueados: { referencia_id: string; tipo: string }[] }
    | undefined;
  return { salvos: row?.salvos ?? 0, bloqueados: row?.bloqueados ?? [], error: null };
}

export async function validarMetaSetor(
  empresaId: string, setorId: string, mes: number, ano: number,
): Promise<{ ok: boolean; erro: string | null }> {
  const { data, error } = await supabase.rpc('fn_metas_validar_setor', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes, p_ano: ano,
  });
  if (error) return { ok: false, erro: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; erro: string | null } | undefined;
  return { ok: row?.ok ?? false, erro: row?.erro ?? null };
}

export async function reabrirMetaSetor(
  empresaId: string, setorId: string, mes: number, ano: number, motivo: string,
): Promise<{ ok: boolean; erro: string | null }> {
  const { data, error } = await supabase.rpc('fn_metas_reabrir_setor', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes, p_ano: ano, p_motivo: motivo,
  });
  if (error) return { ok: false, erro: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; erro: string | null } | undefined;
  return { ok: row?.ok ?? false, erro: row?.erro ?? null };
}
