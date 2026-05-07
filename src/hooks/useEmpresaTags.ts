import { useState, useEffect, useCallback } from 'react';
import { useEmpresa } from './useEmpresa';
import { loadTags } from '@/services/tags.service';
import { AcordoTag } from '@/lib/supabase';

export function useEmpresaTags() {
  const { empresa } = useEmpresa();
  const [tags, setTags] = useState<AcordoTag[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const data = await loadTags(empresa.id);
      setTags(data);
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { tags, loading, refetch };
}
