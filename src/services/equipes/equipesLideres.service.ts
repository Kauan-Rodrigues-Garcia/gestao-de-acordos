/**
 * equipesLideres.service.ts
 * Líder por equipe (BookPlay, migration 20260725b). Cada equipe define quais
 * líderes a comandam — líderes do próprio setor OU clonados de outro setor.
 * Uma equipe pode ter vários líderes; um líder pode liderar várias equipes.
 *
 * Toda função tolera a tabela ausente (migration pendente) retornando
 * null/false — a UI esconde o recurso e cai no comportamento antigo.
 */

import { supabase } from '@/lib/supabase';

export interface LiderEquipe {
  id: string;
  equipe_id: string;
  lider_id: string;
}

/** Líderes de equipe da empresa. null = tabela ausente (migration pendente). */
export async function listarLideresEquipes(empresaId: string): Promise<LiderEquipe[] | null> {
  const { data, error } = await supabase
    .from('equipe_lideres')
    .select('id, equipe_id, lider_id')
    .eq('empresa_id', empresaId);
  if (error) return null;
  return (data as LiderEquipe[]) ?? [];
}

/** Define um líder para uma equipe. Retorna o vínculo criado ou null. */
export async function adicionarLiderEquipe(
  empresaId: string,
  equipeId: string,
  liderId: string,
  criadoPor?: string | null,
): Promise<LiderEquipe | null> {
  const { data, error } = await supabase
    .from('equipe_lideres')
    .insert({
      empresa_id: empresaId,
      equipe_id:  equipeId,
      lider_id:   liderId,
      criado_por: criadoPor ?? null,
    })
    .select('id, equipe_id, lider_id')
    .single();
  if (error) return null;
  return data as LiderEquipe;
}

/** Remove um líder de uma equipe (não afeta o cadastro do usuário). */
export async function removerLiderEquipe(vinculoId: string): Promise<boolean> {
  const { error } = await supabase
    .from('equipe_lideres')
    .delete()
    .eq('id', vinculoId);
  return !error;
}
