/**
 * historicoMes.service.ts — a leitura do Histórico do mês do RH.
 *
 * Uma chamada só: `fn_rh_historico_mes` (migration 20261113150000). A porta
 * está no banco (RH Gestão com alcance «todos os setores»); empresa que a
 * pessoa não alcança volta vazia de lá, sem erro.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { EventoRh } from './historicoMes';

/** Recusa da porta (`42501`): a tela mostra «sem acesso», não «tente de novo». */
export class SemAcessoHistorico extends Error {}

export async function carregarHistoricoMes(empresas: readonly string[], mes: string): Promise<EventoRh[]> {
  const { data, error } = await rpcSemTipo<EventoRh[]>('fn_rh_historico_mes', {
    p_empresas: [...empresas],
    p_mes: `${mes}-01`,
  });
  if (error) {
    if ((error as { code?: string }).code === '42501') throw new SemAcessoHistorico(error.message);
    throw error;
  }
  return data ?? [];
}
