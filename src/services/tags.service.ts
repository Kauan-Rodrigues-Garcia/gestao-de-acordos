import { supabase, AcordoTag } from '@/lib/supabase';
import { invalidarCache, lerComCache } from '@/lib/cacheCurto';

/**
 * As tags da empresa, guardadas por 5 min (05/10/2026: ~5,5 mil leituras por
 * dia de uma lista que quase nunca muda). Criar, renomear ou apagar uma tag
 * por aqui descarta o cache na hora.
 */
const TAGS_VALIDADE_MS = 5 * 60_000;

export async function loadTags(empresaId: string): Promise<AcordoTag[]> {
  return lerComCache(`tags:${empresaId}`, TAGS_VALIDADE_MS, async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (error) throw error;
    return (data as AcordoTag[]) ?? [];
  });
}

export async function createTag(
  empresaId: string,
  nome: string,
  cor: string,
): Promise<{ ok: boolean; tag?: AcordoTag; error?: string }> {
  const { data, error } = await supabase
    .from('tags')
    .insert({ empresa_id: empresaId, nome: nome.trim(), cor })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  invalidarCache('tags:');
  return { ok: true, tag: data as AcordoTag };
}

export async function updateTag(
  id: string,
  nome: string,
  cor: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('tags')
    .update({ nome: nome.trim(), cor })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  invalidarCache('tags:');
  return { ok: true };
}

export async function deleteTag(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  invalidarCache('tags:');
  return { ok: true };
}
