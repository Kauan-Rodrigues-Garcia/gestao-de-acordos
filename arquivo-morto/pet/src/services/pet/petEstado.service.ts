/**
 * petEstado.service.ts
 * Acesso ao estado do pet Aura no banco (tabela pet_estado) e às RPCs da
 * economia (ver 20260709a_pet_economia.sql).
 *
 * Regra de ouro de segurança: o cliente NUNCA credita moedas. O crédito é
 * calculado no servidor a partir do recebimento diário (diario_recebimentos)
 * pelas funções SECURITY DEFINER — aqui só chamamos as RPCs.
 *
 * Toda função é tolerante à ausência das tabelas/RPCs (banco ainda sem a
 * migration aplicada): retorna `null`/`indisponivel` em vez de estourar, para
 * o pet continuar funcionando no modo localStorage.
 */

import { supabase } from '@/lib/supabase';
import type { PetEstado, PetItem } from '@/lib/supabase';

export interface RecompensaDisponivel {
  valor: number;   // R$ ainda não convertidos em moeda
  moedas: number;  // moedas que o resgate renderia agora
}

export interface ResultadoResgate {
  moedasCreditadas: number;
  valorBase: number;
  moedasTotal: number;
}

/** Carrega (criando na 1ª vez) o estado do pet do usuário atual. */
export async function getPetEstado(): Promise<PetEstado | null> {
  const { data, error } = await supabase.rpc('fn_pet_estado_get');
  if (error || !data) return null;
  // A RPC retorna a linha (objeto) — normaliza itens_desbloqueados p/ array.
  const row = (Array.isArray(data) ? data[0] : data) as PetEstado | undefined;
  if (!row) return null;
  return { ...row, itens_desbloqueados: row.itens_desbloqueados ?? [] };
}

/** Quanto há disponível para resgatar agora (só leitura). */
export async function getRecompensaDisponivel(): Promise<RecompensaDisponivel | null> {
  const { data, error } = await supabase.rpc('fn_pet_recompensa_disponivel');
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { valor_disponivel: number; moedas_disponivel: number }
    | undefined;
  if (!row) return { valor: 0, moedas: 0 };
  return { valor: Number(row.valor_disponivel) || 0, moedas: Number(row.moedas_disponivel) || 0 };
}

/** Converte o recebimento diário disponível em moedas (atômico no servidor). */
export async function resgatarRecompensa(): Promise<ResultadoResgate | null> {
  const { data, error } = await supabase.rpc('fn_pet_resgatar_recompensa');
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { moedas_creditadas: number; valor_base: number; moedas_total: number }
    | undefined;
  if (!row) return { moedasCreditadas: 0, valorBase: 0, moedasTotal: 0 };
  return {
    moedasCreditadas: Number(row.moedas_creditadas) || 0,
    valorBase:        Number(row.valor_base) || 0,
    moedasTotal:      Number(row.moedas_total) || 0,
  };
}

/** Gasta moedas (caminho legado, sem validação de item). Novo saldo ou null. */
export async function gastarMoedas(valor: number, item?: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_pet_gastar_moedas', {
    p_valor: valor,
    p_item: item ?? null,
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; moedas_total: number }
    | undefined;
  if (!row || !row.ok) return null;
  return Number(row.moedas_total) || 0;
}

/** Catálogo da loja no servidor (pet_itens). null = tabela/migration ausente. */
export async function listarCatalogoPet(): Promise<PetItem[] | null> {
  const { data, error } = await supabase
    .from('pet_itens')
    .select('*')
    .eq('ativo', true)
    .in('tipo', ['roupa', 'comida'])
    .order('ordem');
  if (error) return null;
  return (data as PetItem[]) ?? [];
}

export interface ResultadoCompra {
  ok: boolean;
  /** null = ok | 'nao_encontrado' | 'indisponivel' | 'ja_possui' | 'saldo' */
  erro: string | null;
  moedas: number;
}

/** Compra validada no servidor (preço/janela/posse pela pet_itens).
 *  null = RPC ausente (migration pendente) → chamador cai no caminho legado. */
export async function comprarItemPet(itemId: string): Promise<ResultadoCompra | null> {
  const { data, error } = await supabase.rpc('fn_pet_comprar_item', { p_item_id: itemId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; erro: string | null; moedas_total: number }
    | undefined;
  if (!row) return null;
  return { ok: !!row.ok, erro: row.erro ?? null, moedas: Number(row.moedas_total) || 0 };
}

/** Persiste a personalização (roupa/sono). Não toca em moedas. */
export async function salvarVisualPet(roupa: string, dormindo: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('fn_pet_salvar_visual', {
    p_roupa: roupa,
    p_dormindo: dormindo,
  });
  return !error;
}
