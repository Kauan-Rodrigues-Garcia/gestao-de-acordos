/**
 * petAdmin.service.ts
 * Painel admin do joguinho do pet (aba Pet em Configurações):
 * visão geral dos jogadores, ajuste manual de moedas e edição do catálogo.
 *
 * Tudo é gated no SERVIDOR: as RPCs conferem administrador/super_admin via
 * fn_user_has_any_role, e a escrita em pet_itens tem RLS própria de admin
 * (ver 20260711b_pet_loja_servidor.sql). Toda função tolera migration
 * ausente retornando null.
 */

import { supabase } from '@/lib/supabase';

export interface PetJogador {
  usuario_id: string;
  nome: string;
  cargo: string;
  moedas: number;
  moedas_ganhas_total: number;
  moedas_gastas_total: number;
  xp: number;
  nivel: number;
  streak: number;
  qtd_itens: number;
  roupa_equipada: string;
  ultimo_dia_ativo: string | null;
}

/** Uma linha por usuário com pet (ordenado por moedas). null = RPC ausente. */
export async function listarJogadoresPet(): Promise<PetJogador[] | null> {
  const { data, error } = await supabase.rpc('fn_pet_admin_listar');
  if (error) return null;
  return (data as PetJogador[]) ?? [];
}

/** Crédito/débito manual de moedas. Novo saldo, ou null se não deu. */
export async function ajustarMoedasPet(usuarioId: string, delta: number): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_pet_admin_ajustar_moedas', {
    p_usuario: usuarioId,
    p_delta: delta,
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; moedas_total: number }
    | undefined;
  if (!row || !row.ok) return null;
  return Number(row.moedas_total) || 0;
}

/** Catálogo completo (inclusive inativos) para o painel. null = sem tabela. */
export async function listarItensPetAdmin() {
  const { data, error } = await supabase
    .from('pet_itens')
    .select('*')
    .order('tipo')
    .order('ordem');
  if (error) return null;
  return (data as import('@/lib/supabase').PetItem[]) ?? [];
}

/** Atualiza preço/ativo de um item do catálogo (RLS: só admin). */
export async function atualizarItemPet(
  id: string,
  patch: { preco_moedas?: number | null; ativo?: boolean },
): Promise<boolean> {
  const { error } = await supabase.from('pet_itens').update(patch).eq('id', id);
  return !error;
}
