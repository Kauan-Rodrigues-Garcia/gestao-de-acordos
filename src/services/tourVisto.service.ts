/**
 * tourVisto.service.ts — o tutorial de boas-vindas aparece uma vez por usuário.
 *
 * `perfis.tour_visto_em` (migration 20260928113233), e não só `localStorage`:
 * a pessoa troca de PC, de navegador ou limpa os dados, e não deveria ver o
 * mesmo tutorial de novo. Mesmo molde de `chat_boas_vindas_em`.
 *
 * Cliente sem tipo porque `database.types.ts` é gerado do banco e ainda não
 * conhece a coluna. Quando os tipos forem regenerados, vira `supabase.from`.
 */
import { supabase } from '@/lib/supabase';

interface Consulta extends PromiseLike<{ error: { message: string } | null }> {
  update(valores: unknown): Consulta;
  eq(coluna: string, valor: string): Consulta;
  is(coluna: string, valor: null): Consulta;
}

function perfis(): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)('perfis');
}

/**
 * Grava que a pessoa viu o tutorial. Só a primeira data fica — o `is null`
 * impede que um segundo navegador sobrescreva quando foi de verdade.
 */
export async function registrarTourVisto(perfilId: string): Promise<{ erro: string | null }> {
  const { error } = await perfis()
    .update({ tour_visto_em: new Date().toISOString() })
    .eq('id', perfilId)
    .is('tour_visto_em', null);
  return { erro: error?.message ?? null };
}
