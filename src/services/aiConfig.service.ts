import { supabase } from '@/lib/supabase';

export type AIConfig = {
  id: string;
  enabled: boolean;
  model: string;
  temperature: number;
  max_rows: number;
  max_cols: number;
  prompt_system: string;
  updated_at: string;
};

export async function fetchAIConfig(): Promise<AIConfig | null> {
  const { data, error } = await supabase
    .from('ai_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as AIConfig | null) ?? null;
}

export type AIConfigInput = Pick<
  AIConfig,
  'enabled' | 'model' | 'temperature' | 'max_rows' | 'max_cols' | 'prompt_system'
>;

export async function saveAIConfig(input: AIConfigInput): Promise<void> {
  const current = await fetchAIConfig().catch(() => null);

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

