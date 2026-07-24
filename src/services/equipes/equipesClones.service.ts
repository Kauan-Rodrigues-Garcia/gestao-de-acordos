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
  /** Item 1: quando false, o recebimento do clone NÃO conta para esta equipe
   *  (nem para o setor dela). Padrão true. */
  conta_recebimento?: boolean;
}

/** Clones da empresa. null = tabela ausente (migration pendente). */
export async function listarClonesEquipes(empresaId: string): Promise<CloneEquipe[] | null> {
  // Tenta com a coluna nova; se a migration 20260723e ainda não rodou, cai no
  // select antigo (conta_recebimento assume true por padrão).
  const comFlag = await supabase
    .from('equipe_operadores_clones')
    .select('id, equipe_id, operador_id, conta_recebimento')
    .eq('empresa_id', empresaId);
  if (!comFlag.error) return (comFlag.data as CloneEquipe[]) ?? [];

  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .select('id, equipe_id, operador_id')
    .eq('empresa_id', empresaId);
  if (error) return null;
  return ((data as CloneEquipe[]) ?? []).map(c => ({ ...c, conta_recebimento: true }));
}

/** Liga/desliga a contagem de recebimento de um clone naquela equipe. */
export async function setCloneContaRecebimento(cloneId: string, conta: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('equipe_operadores_clones')
    .update({ conta_recebimento: conta })
    .eq('id', cloneId);
  return !error;
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

/** Apaga TODOS os clones da empresa (os operadores seguem normais nas equipes
 *  de origem). Retorna a quantidade removida, ou null em erro. */
export async function removerTodosClonesEmpresa(empresaId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .delete()
    .eq('empresa_id', empresaId)
    .select('id');
  if (error) return null;
  return (data as { id: string }[] | null)?.length ?? 0;
}
