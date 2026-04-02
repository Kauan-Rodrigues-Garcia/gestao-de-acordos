/**
 * src/services/setores.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com setores.
 * Centraliza queries, seed e validações relacionadas a setores.
 */
import { supabase, Setor } from '@/lib/supabase';

/** Setores padrão do sistema */
export const SETORES_INICIAIS = [
  { nome: 'Em dia',  descricao: 'Setor padrão — acordos em dia' },
  { nome: 'Play 1',  descricao: 'Setor Play 1' },
  { nome: 'Play 2',  descricao: 'Setor Play 2' },
  { nome: 'Play 3',  descricao: 'Setor Play 3' },
  { nome: 'Play 4',  descricao: 'Setor Play 4' },
  { nome: 'Play 5',  descricao: 'Setor Play 5' },
  { nome: 'Play 6',  descricao: 'Setor Play 6' },
] as const;

/** Lista todos os setores ativos */
export async function listarSetores(): Promise<Setor[]> {
  const { data, error } = await supabase
    .from('setores')
    .select('*')
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return (data as Setor[]) || [];
}

/** Lista todos os setores (incluindo inativos) — para admin */
export async function listarSetoresAdmin(): Promise<Setor[]> {
  const { data, error } = await supabase
    .from('setores')
    .select('*')
    .order('nome');
  if (error) throw error;
  return (data as Setor[]) || [];
}

/** Verifica e insere setores iniciais se estiverem ausentes.
 *  Retorna { inseridos, existentes } */
export async function seedSetoresIniciais(empresaId: string): Promise<{ inseridos: number; existentes: number; erros: string[] }> {
  const { data: existentes } = await supabase
    .from('setores')
    .select('nome');

  const nomesExistentes = new Set((existentes || []).map((s: { nome: string }) => s.nome));
  const faltantes = SETORES_INICIAIS.filter(s => !nomesExistentes.has(s.nome));

  if (faltantes.length === 0) {
    return { inseridos: 0, existentes: SETORES_INICIAIS.length, erros: [] };
  }

  const erros: string[] = [];
  let inseridos = 0;

  for (const setor of faltantes) {
      const { error } = await supabase
        .from('setores')
        .insert({ nome: setor.nome, descricao: setor.descricao, ativo: true, empresa_id: empresaId });
    if (error) {
      erros.push(`${setor.nome}: ${error.message}`);
    } else {
      inseridos++;
    }
  }

  return { inseridos, existentes: nomesExistentes.size, erros };
}

/** Busca setor por ID */
export async function buscarSetor(id: string): Promise<Setor | null> {
  const { data } = await supabase.from('setores').select('*').eq('id', id).single();
  return data as Setor | null;
}
