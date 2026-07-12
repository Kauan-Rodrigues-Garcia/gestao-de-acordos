/**
 * equipesClones.service.ts
 * "Clone" de operador em equipe (BookPlay): o operador continua na equipe
 * original (perfis.equipe_id) e passa a contar TAMBÉM nas equipes em que foi
 * clonado — o recebimento do analítico soma em todas elas.
 *
 * Tabela: equipe_operadores_clones (migration 20260712a). Toda função tolera
 * a migration ausente retornando null/false — a UI esconde o recurso.
 */

import { supabase } from '@/lib/supabase';

export interface CloneEquipe {
  id: string;
  equipe_id: string;
  operador_id: string;
}

/** Clones da empresa. null = tabela ausente (migration pendente). */
export async function listarClonesEquipes(empresaId: string): Promise<CloneEquipe[] | null> {
  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .select('id, equipe_id, operador_id')
    .eq('empresa_id', empresaId);
  if (error) return null;
  return (data as CloneEquipe[]) ?? [];
}

/** Clona um operador para outra equipe. Retorna o clone criado ou null. */
export async function criarCloneEquipe(
  empresaId: string,
  equipeId: string,
  operadorId: string,
  criadoPor?: string | null,
): Promise<CloneEquipe | null> {
  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .insert({
      empresa_id:  empresaId,
      equipe_id:   equipeId,
      operador_id: operadorId,
      criado_por:  criadoPor ?? null,
    })
    .select('id, equipe_id, operador_id')
    .single();
  if (error) return null;
  return data as CloneEquipe;
}

/** Remove um clone (o operador segue normal na equipe original). */
export async function removerCloneEquipe(cloneId: string): Promise<boolean> {
  const { error } = await supabase
    .from('equipe_operadores_clones')
    .delete()
    .eq('id', cloneId);
  return !error;
}
