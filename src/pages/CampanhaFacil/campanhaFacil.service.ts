/**
 * Persistência do Campanha Fácil — de cada SETOR (16/10/2026).
 *
 * No app original tudo isso era localStorage; aqui vive no Supabase (tabelas
 * campanha_facil_* — ver migration 20260723a). Até 20261016210000 valia para a
 * empresa inteira; agora mensagens, excluídas e descontos são do setor: o
 * líder vê e mexe só no dele, a gerência no setor escolhido. A tela filtra
 * pelo setor e o RLS (`fn_cf_alcanca_setor`) garante.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { CampaignCore, type Discounts } from './lib/campaign-core';

/** Para o que nasceu depois dos tipos gerados (favoritas, `pix_automatico`, `setor_id`). */
const dbSemTipos = supabase as unknown as SupabaseClient;

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

const DISCOUNT_KEYS: (keyof Discounts)[] = ['overdue', 'settlement', 'interest', 'bundle', 'annual', 'pix_automatico', 'cartao_recorrente'];

function toDiscounts(row: Record<string, unknown>): Discounts {
  return {
    overdue: Number(row.overdue) || 0,
    settlement: Number(row.settlement) || 0,
    interest: Number(row.interest) || 0,
    bundle: Number(row.bundle) || 0,
    annual: Number(row.annual) || 0,
    pix_automatico: Number(row.pix_automatico) || 0,
    // Configuração salva antes do Cartão Recorrente (27/10/2026): o padrão.
    cartao_recorrente: row.cartao_recorrente == null ? CampaignCore.DEFAULT_DISCOUNTS.cartao_recorrente : Number(row.cartao_recorrente) || 0,
  };
}

/**
 * A coluna `cartao_recorrente` (20261027120000) ainda não existe no banco: o
 * front novo pode entrar no ar antes da migration. Sem isto, a lista de
 * mensagens não carregava — ela vem junto com os descontos.
 */
const COLUNA_NOVA = 'cartao_recorrente';
function faltaColunaNova(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204') && String(error.message ?? '').includes(COLUNA_NOVA);
}

// ─── Mensagens adicionadas ───────────────────────────────────────────────────

export async function fetchMensagens(empresaId: string, setorId: string): Promise<CampanhaMensagem[]> {
  const { data, error } = await dbSemTipos
    .from('campanha_facil_mensagens')
    .select('id, titulo, categoria, corpo, criado_por, criado_por_nome, criado_em, atualizado_em')
    .eq('empresa_id', empresaId).eq('setor_id', setorId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CampanhaMensagem[];
}

export async function criarMensagem(params: {
  empresaId: string;
  setorId: string;
  titulo: string;
  categoria: string;
  corpo: string;
  criadoPor: string | null;
  criadoPorNome: string | null;
}): Promise<CampanhaMensagem> {
  const { data, error } = await dbSemTipos
    .from('campanha_facil_mensagens')
    .insert({
      empresa_id: params.empresaId,
      setor_id: params.setorId,
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

export async function fetchDescontos(empresaId: string, setorId: string): Promise<CampanhaDesconto[]> {
  // `pix_automatico` (20261009180000) e `cartao_recorrente` (20261027120000)
  // nasceram depois dos tipos gerados.
  const buscar = (colunas: string) => dbSemTipos
    .from('campanha_facil_descontos')
    .select(`id, nome, overdue, settlement, interest, bundle, annual, pix_automatico${colunas}`)
    .eq('empresa_id', empresaId).eq('setor_id', setorId)
    .order('nome', { ascending: true });
  let { data, error } = await buscar(`, ${COLUNA_NOVA}`);
  if (faltaColunaNova(error)) ({ data, error } = await buscar(''));
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    nome: row.nome as string,
    discounts: toDiscounts(row as Record<string, unknown>),
  }));
}

/**
 * Salva (ou atualiza, se já existir uma com o mesmo nome case-insensitive NO
 * SETOR) uma configuração de desconto. Espelha o comportamento do app
 * original, que sobrescrevia a configuração de mesmo nome. Retorna o id
 * afetado.
 */
export async function salvarDesconto(params: {
  empresaId: string;
  setorId: string;
  nome: string;
  discounts: Discounts;
  criadoPor: string | null;
}): Promise<{ id: string; atualizado: boolean }> {
  const valores = Object.fromEntries(DISCOUNT_KEYS.map((k) => [k, params.discounts[k]]));

  const { data: existentes, error: buscaErro } = await dbSemTipos
    .from('campanha_facil_descontos')
    .select('id')
    .eq('empresa_id', params.empresaId).eq('setor_id', params.setorId)
    .ilike('nome', params.nome)
    .limit(1);
  if (buscaErro) throw buscaErro;

  const semColunaNova = () => Object.fromEntries(Object.entries(valores).filter(([k]) => k !== COLUNA_NOVA));

  const existente = existentes?.[0];
  if (existente) {
    const atualizar = (v: Record<string, unknown>) => dbSemTipos
      .from('campanha_facil_descontos')
      .update({ nome: params.nome, ...v, atualizado_em: new Date().toISOString() })
      .eq('id', existente.id);
    let { error } = await atualizar(valores);
    if (faltaColunaNova(error)) ({ error } = await atualizar(semColunaNova()));
    if (error) throw error;
    return { id: existente.id as string, atualizado: true };
  }

  const inserir = (v: Record<string, unknown>) => dbSemTipos
    .from('campanha_facil_descontos')
    .insert({ empresa_id: params.empresaId, setor_id: params.setorId, nome: params.nome, criado_por: params.criadoPor, ...v })
    .select('id')
    .single();
  let { data, error } = await inserir(valores);
  if (faltaColunaNova(error)) ({ data, error } = await inserir(semColunaNova()));
  if (error) throw error;
  return { id: data.id as string, atualizado: false };
}

export async function excluirDesconto(id: string): Promise<void> {
  const { error } = await supabase.from('campanha_facil_descontos').delete().eq('id', id);
  if (error) throw error;
}

// ─── Mensagens favoritas (de cada líder, 20261009180000) ─────────────────────

export async function fetchFavoritas(empresaId: string): Promise<string[]> {
  const { data, error } = await dbSemTipos
    .from('campanha_facil_mensagens_favoritas')
    .select('template_id')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { template_id: string }[]).map((r) => r.template_id);
}

/** A policy só deixa mexer nas próprias: `perfil_id` o banco preenche. */
export async function definirFavorita(empresaId: string, templateId: string, favorita: boolean): Promise<void> {
  if (favorita) {
    const { error } = await dbSemTipos
      .from('campanha_facil_mensagens_favoritas')
      .upsert({ empresa_id: empresaId, template_id: templateId }, { onConflict: 'perfil_id,empresa_id,template_id', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await dbSemTipos
      .from('campanha_facil_mensagens_favoritas')
      .delete()
      .eq('empresa_id', empresaId).eq('template_id', templateId);
    if (error) throw error;
  }
}

// ─── Mensagens padrão ocultadas (de cada setor) ──────────────────────────────

export async function fetchOcultas(empresaId: string, setorId: string): Promise<string[]> {
  const { data, error } = await dbSemTipos
    .from('campanha_facil_mensagens_ocultas')
    .select('template_id')
    .eq('empresa_id', empresaId).eq('setor_id', setorId);
  if (error) throw error;
  return ((data ?? []) as { template_id: string }[]).map((r) => r.template_id);
}

export async function ocultarMensagemPadrao(params: {
  empresaId: string;
  setorId: string;
  templateId: string;
  ocultadoPor: string | null;
}): Promise<void> {
  const { error } = await dbSemTipos
    .from('campanha_facil_mensagens_ocultas')
    .upsert(
      { empresa_id: params.empresaId, setor_id: params.setorId, template_id: params.templateId, ocultado_por: params.ocultadoPor },
      { onConflict: 'empresa_id,setor_id,template_id' },
    );
  if (error) throw error;
}

/** Restaura TODAS as mensagens padrão ocultadas do setor (como no original). */
export async function restaurarMensagensPadrao(empresaId: string, setorId: string): Promise<void> {
  const { error } = await dbSemTipos
    .from('campanha_facil_mensagens_ocultas')
    .delete()
    .eq('empresa_id', empresaId).eq('setor_id', setorId);
  if (error) throw error;
}
