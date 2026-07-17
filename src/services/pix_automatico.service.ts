/**
 * src/services/pix_automatico.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pix Automático (BookPlay): registro de acordos fechados no Pix automático
 * para acompanhamento de comissão — SEM vínculo com a tabela `acordos`.
 *
 * Regras:
 *   • operador registra NR + valor → linha nasce 'pendente'
 *   • líder+ aprova (trava o % do setor em pct_comissao) ou desaprova
 *   • desaprovado não conta em nenhum total; o dono pode excluir
 *   • % por setor em pix_automatico_config (padrão 0,25)
 *
 * Comissão = valor × pct ÷ 100 (pct 0.25 = 0,25%).
 */

import { supabase } from '@/lib/supabase';

export type PixAutoStatus = 'pendente' | 'aprovado' | 'desaprovado';

export const PIX_AUTO_PCT_PADRAO = 0.25;

export interface PixAutoAcordo {
  id: string;
  empresa_id: string;
  operador_id: string;
  operador_nome: string | null;
  setor_id: string | null;
  nr_cliente: string;
  valor: number;
  status: PixAutoStatus;
  pct_comissao: number | null;
  avaliado_por: string | null;
  avaliado_por_nome: string | null;
  avaliado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PixAutoConfig {
  id: string;
  empresa_id: string;
  setor_id: string;
  pct: number;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  atualizado_em: string;
}

/** Comissão de uma linha: aprovado usa o % travado; pendente usa o % do setor. */
export function comissaoDe(a: Pick<PixAutoAcordo, 'valor' | 'status' | 'pct_comissao' | 'setor_id'>, pctPorSetor: Record<string, number>): number {
  const pct = a.status === 'aprovado' && a.pct_comissao != null
    ? Number(a.pct_comissao)
    : (a.setor_id != null && pctPorSetor[a.setor_id] != null ? pctPorSetor[a.setor_id] : PIX_AUTO_PCT_PADRAO);
  return Math.round(Number(a.valor) * pct) / 100; // valor × pct ÷ 100, 2 casas
}

// ── Acordos ────────────────────────────────────────────────────────────────

export async function fetchAcordosPix(empresaId: string, opts?: { operadorId?: string }): Promise<PixAutoAcordo[]> {
  let q = supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(1000);
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchAcordosPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoAcordo[]) ?? [];
}

export async function criarAcordoPix(p: {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
  nrCliente: string;
  valor: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('pix_automatico_acordos').insert({
    empresa_id:    p.empresaId,
    operador_id:   p.operadorId,
    operador_nome: p.operadorNome,
    setor_id:      p.setorId,
    nr_cliente:    p.nrCliente.trim(),
    valor:         p.valor,
    status:        'pendente',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Aprova ou desaprova. Na aprovação, trava o % vigente do setor na linha
 * (pct_comissao) — mudanças futuras de configuração não alteram o aprovado.
 */
export async function avaliarAcordoPix(p: {
  id: string;
  aprovar: boolean;
  pctAtual: number;
  avaliadorId: string;
  avaliadorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_acordos')
    .update({
      status:            p.aprovar ? 'aprovado' : 'desaprovado',
      pct_comissao:      p.aprovar ? p.pctAtual : null,
      avaliado_por:      p.avaliadorId,
      avaliado_por_nome: p.avaliadorNome,
      avaliado_em:       new Date().toISOString(),
    })
    .eq('id', p.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Volta uma linha avaliada para pendente (correção de engano do líder). */
export async function reavaliarAcordoPix(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_acordos')
    .update({ status: 'pendente', pct_comissao: null, avaliado_por: null, avaliado_por_nome: null, avaliado_em: null })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function excluirAcordoPix(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('pix_automatico_acordos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Apaga todos os DESAPROVADOS do operador (botão "Limpar desaprovados"). */
export async function limparDesaprovados(empresaId: string, operadorId: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('operador_id', operadorId)
    .eq('status', 'desaprovado')
    .select('id');
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: (data ?? []).length };
}

// ── Configuração de % por setor ────────────────────────────────────────────

export async function fetchConfigsPix(empresaId: string): Promise<PixAutoConfig[]> {
  const { data, error } = await supabase
    .from('pix_automatico_config')
    .select('*')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[pix_automatico.service] fetchConfigsPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoConfig[]) ?? [];
}

export async function upsertConfigPix(p: {
  empresaId: string;
  setorId: string;
  pct: number;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_config')
    .upsert({
      empresa_id:          p.empresaId,
      setor_id:            p.setorId,
      pct:                 p.pct,
      atualizado_por:      p.atualizadoPor,
      atualizado_por_nome: p.atualizadoPorNome,
      atualizado_em:       new Date().toISOString(),
    }, { onConflict: 'empresa_id,setor_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
