import { supabase } from '@/lib/supabase';

export async function carregarOrdemMenu(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('menu_lateral_config')
    .select('ordem')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) throw error;
  return (data?.ordem as string[] | null) ?? [];
}

export async function salvarOrdemMenu(
  empresaId: string,
  ordem: string[],
  usuarioId: string,
): Promise<void> {
  const { error } = await supabase.from('menu_lateral_config').upsert({
    empresa_id: empresaId,
    ordem,
    atualizado_em: new Date().toISOString(),
    atualizado_por: usuarioId,
  }, { onConflict: 'empresa_id' });
  if (error) throw error;
}
