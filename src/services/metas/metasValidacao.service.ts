/**
 * metasValidacao.service.ts — trava de meta por setor (Fase 1 de validação).
 * Ver a função correspondente na baseline ativa do Supabase.
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

/**
 * Exclui as metas do mês de um tipo (setor, equipe ou operador).
 *
 * Sem RPC: a policy `metas_delete` já exige `metas_excluir` e recusa a meta de
 * setor validado (`fn_meta_esta_bloqueada`). Só que a RLS recusa um DELETE em
 * silêncio — a linha simplesmente não sai, sem erro. Por isso a volta traz quem
 * SAIU: quem foi pedido e não está em `excluidas` foi recusado (ou já não
 * existia).
 */
export async function excluirMetas(p: {
  empresaId: string;
  mes: number;
  ano: number;
  tipo: 'setor' | 'equipe' | 'operador';
  referenciaIds: string[];
}): Promise<{ excluidas: string[]; error: string | null }> {
  if (p.referenciaIds.length === 0) return { excluidas: [], error: null };
  const { data, error } = await supabase
    .from('metas')
    .delete()
    .eq('empresa_id', p.empresaId).eq('mes', p.mes).eq('ano', p.ano)
    .eq('tipo', p.tipo)
    .in('referencia_id', p.referenciaIds)
    .select('referencia_id');
  if (error) return { excluidas: [], error: error.message };
  const ids = ((data ?? []) as { referencia_id: string }[]).map(l => l.referencia_id);
  return { excluidas: [...new Set(ids)], error: null };
}
