import { supabase, AIConfig } from '@/lib/supabase';

export async function fetchAIConfig(empresaId?: string): Promise<AIConfig | null> {
  let query = supabase
    .from('ai_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (empresaId) {
    query = query.eq('empresa_id', empresaId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return (data as AIConfig | null) ?? null;
}

export type AIConfigInput = Pick<
  AIConfig,
  'enabled' | 'model' | 'temperature' | 'max_rows' | 'max_cols' | 'prompt_system' | 'empresa_id'
>;

export async function saveAIConfig(input: AIConfigInput): Promise<void> {
  const current = await fetchAIConfig(input.empresa_id).catch(() => null);

  if (current?.id) {
    const { error } = await supabase
      .from('ai_config')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', current.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('ai_config')
    .insert({ ...input, updated_at: new Date().toISOString() });
  if (error) throw error;
}
