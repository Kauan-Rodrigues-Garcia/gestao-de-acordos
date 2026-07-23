/**
 * Persistência do Campanha Fácil — COMPARTILHADA por empresa (BookPlay).
 *
 * No app original tudo isso era localStorage; aqui vive no Supabase, visível e
 * editável por toda a empresa (tabelas campanha_facil_* — ver migration
 * 20260723a). O gate "só BookPlay" é da UI; a isolação por empresa é do RLS.
 */
import { supabase } from '@/lib/supabase';
import type { Discounts } from './lib/campaign-core';

export interface CampanhaMensagem {
  id: string;
  titulo: string;
  categoria: string;
  corpo: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface CampanhaDesconto {
  id: string;
  nome: string;
  discounts: Discounts;
}

const DISCOUNT_KEYS: (keyof Discounts)[] = ['overdue', 'settlement', 'interest', 'bundle', 'annual'];

function toDiscounts(row: Record<string, unknown>): Discounts {
  return {
    overdue: Number(row.overdue) || 0,
    settlement: Number(row.settlement) || 0,
    interest: Number(row.interest) || 0,
    bundle: Number(row.bundle) || 0,
    annual: Number(row.annual) || 0,
  };
}

// ─── Mensagens adicionadas ───────────────────────────────────────────────────

export async function fetchMensagens(empresaId: string): Promise<CampanhaMensagem[]> {
  const { data, error } = await supabase
    .from('campanha_facil_mensagens')
    .select('id, titulo, categoria, corpo, criado_por, criado_por_nome, criado_em, atualizado_em')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CampanhaMensagem[];
}

export async function criarMensagem(params: {
  empresaId: string;
  titulo: string;
  categoria: string;
  corpo: string;
  criadoPor: string | null;
  criadoPorNome: string | null;
}): Promise<CampanhaMensagem> {
  const { data, error } = await supabase
    .from('campanha_facil_mensagens')
    .insert({
      empresa_id: params.empresaId,
      titulo: params.titulo,
      categoria: params.categoria,
      corpo: params.corpo,
      criado_por: params.criadoPor,
      criado_por_nome: params.criadoPorNome,
    })
    .select('id, titulo, categoria, corpo, criado_por, criado_por_nome, criado_em, atualizado_em')
    .single();
  if (error) throw error;
  return data as CampanhaMensagem;
}

export async function atualizarMensagemCorpo(id: string, corpo: string): Promise<void> {
  const { error } = await supabase
    .from('campanha_facil_mensagens')
    .update({ corpo, atualizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function excluirMensagem(id: string): Promise<void> {
  const { error } = await supabase.from('campanha_facil_mensagens').delete().eq('id', id);
  if (error) throw error;
}

// ─── Configurações de desconto ───────────────────────────────────────────────

export async function fetchDescontos(empresaId: string): Promise<CampanhaDesconto[]> {
  const { data, error } = await supabase
    .from('campanha_facil_descontos')
    .select('id, nome, overdue, settlement, interest, bundle, annual')
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    nome: row.nome as string,
    discounts: toDiscounts(row as Record<string, unknown>),
  }));
}

/**
 * Salva (ou atualiza, se já existir uma com o mesmo nome case-insensitive) uma
 * configuração de desconto. Espelha o comportamento do app original, que
 * sobrescrevia a configuração de mesmo nome. Retorna o id afetado.
 */
export async function salvarDesconto(params: {
  empresaId: string;
  nome: string;
  discounts: Discounts;
  criadoPor: string | null;
}): Promise<{ id: string; atualizado: boolean }> {
  const valores = Object.fromEntries(DISCOUNT_KEYS.map((k) => [k, params.discounts[k]]));

  const { data: existentes, error: buscaErro } = await supabase
    .from('campanha_facil_descontos')
    .select('id')
    .eq('empresa_id', params.empresaId)
    .ilike('nome', params.nome)
    .limit(1);
  if (buscaErro) throw buscaErro;

  const existente = existentes?.[0];
  if (existente) {
    const { error } = await supabase
      .from('campanha_facil_descontos')
      .update({ nome: params.nome, ...valores, atualizado_em: new Date().toISOString() })
      .eq('id', existente.id);
    if (error) throw error;
    return { id: existente.id as string, atualizado: true };
  }

  const { data, error } = await supabase
    .from('campanha_facil_descontos')
    .insert({ empresa_id: params.empresaId, nome: params.nome, criado_por: params.criadoPor, ...valores })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string, atualizado: false };
}

export async function excluirDesconto(id: string): Promise<void> {
  const { error } = await supabase.from('campanha_facil_descontos').delete().eq('id', id);
  if (error) throw error;
}

// ─── Mensagens padrão ocultadas ──────────────────────────────────────────────

export async function fetchOcultas(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('campanha_facil_mensagens_ocultas')
    .select('template_id')
    .eq('empresa_id', empresaId);
  if (error) throw error;
  return (data ?? []).map((r) => r.template_id as string);
}

export async function ocultarMensagemPadrao(params: {
  empresaId: string;
  templateId: string;
  ocultadoPor: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('campanha_facil_mensagens_ocultas')
    .upsert(
      { empresa_id: params.empresaId, template_id: params.templateId, ocultado_por: params.ocultadoPor },
      { onConflict: 'empresa_id,template_id' },
    );
  if (error) throw error;
}

/** Restaura TODAS as mensagens padrão ocultadas da empresa (como no original). */
export async function restaurarMensagensPadrao(empresaId: string): Promise<void> {
  const { error } = await supabase
    .from('campanha_facil_mensagens_ocultas')
    .delete()
    .eq('empresa_id', empresaId);
  if (error) throw error;
}
