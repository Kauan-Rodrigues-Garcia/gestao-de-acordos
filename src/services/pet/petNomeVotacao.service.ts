/**
 * petNomeVotacao.service.ts
 * Votação do nome do mascote (tabela pet_nome_votos, ver 20260710a).
 *
 * Tolerante à ausência da tabela (migration não aplicada): as funções devolvem
 * um sinal seguro para NÃO mostrar a votação em vez de estourar.
 */
import { supabase } from '@/lib/supabase';

export type NomeMascote = 'Aura' | 'Lupi' | 'Albi';
export const OPCOES_NOME: NomeMascote[] = ['Aura', 'Lupi', 'Albi'];

export interface ResultadoVotacao {
  empresaId: string | null;
  empresaSlug: string | null;
  nome: string;
  votos: number;
}

/** Estado do voto do usuário atual. `indisponivel` = tabela ausente (não mostrar). */
export interface MeuVoto {
  votou: boolean;
  nome: string | null;
  indisponivel: boolean;
}

export async function getMeuVotoNome(): Promise<MeuVoto> {
  const { data, error } = await supabase
    .from('pet_nome_votos')
    .select('nome_escolhido')
    .limit(1)
    .maybeSingle();

  if (error) {
    // Tabela/coluna ausente ou sem permissão → não mostra a votação.
    return { votou: false, nome: null, indisponivel: true };
  }
  const nome = (data as { nome_escolhido?: string } | null)?.nome_escolhido ?? null;
  return { votou: !!nome, nome, indisponivel: false };
}

/** Registra o voto (1 por usuário). Retorna true se salvou. */
export async function votarNome(
  usuarioId: string,
  empresaId: string | null,
  nome: NomeMascote,
): Promise<boolean> {
  const { error } = await supabase.from('pet_nome_votos').insert({
    usuario_id: usuarioId,
    empresa_id: empresaId,
    nome_escolhido: nome,
  });
  return !error;
}

/** Apuração por empresa/nome (só admin/super_admin — RLS na RPC). */
export async function getResultadoVotacao(): Promise<ResultadoVotacao[]> {
  const { data, error } = await supabase.rpc('fn_pet_nome_resultado');
  if (error || !data) return [];
  return (data as Array<{
    empresa_id: string | null; empresa_slug: string | null;
    nome_escolhido: string; votos: number;
  }>).map(r => ({
    empresaId: r.empresa_id,
    empresaSlug: r.empresa_slug,
    nome: r.nome_escolhido,
    votos: Number(r.votos) || 0,
  }));
}
