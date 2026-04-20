/**
 * src/hooks/useDiretoExtraConfig.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cache local com realtime de todas as configurações `direto_extra_config`
 * da empresa atual + utilitário para resolver se um operador está com a
 * lógica ativada.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  fetchDiretoExtraConfigs,
  resolverDiretoExtraAtivo,
  type DiretoExtraConfig,
} from '@/services/direto_extra.service';

export interface UseDiretoExtraConfigResult {
  configs: DiretoExtraConfig[];
  loading: boolean;
  /** Verifica se um operador específico está com a lógica ativa */
  isAtivoParaUsuario: (
    userId: string,
    userSetorId?: string | null,
    userEquipeId?: string | null,
  ) => boolean;
  refetch: () => Promise<void>;
}

export function useDiretoExtraConfig(): UseDiretoExtraConfigResult {
  const { empresa } = useEmpresa();
  const empresaId   = empresa?.id ?? '';
  const [configs, setConfigs] = useState<DiretoExtraConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!empresaId) { setConfigs([]); setLoading(false); return; }
    setLoading(true);
    const data = await fetchDiretoExtraConfigs(empresaId);
    setConfigs(data);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Realtime
  useEffect(() => {
    if (!empresaId) return;
    const channel = supabase
      .channel(`rt-direto-extra-${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direto_extra_config', filter: `empresa_id=eq.${empresaId}` },
        () => { refetch(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empresaId, refetch]);

  const isAtivoParaUsuario = useCallback(
    (userId: string, userSetorId?: string | null, userEquipeId?: string | null) =>
      resolverDiretoExtraAtivo({
        userId,
        userSetorId: userSetorId ?? null,
        userEquipeId: userEquipeId ?? null,
        configs,
      }),
    [configs],
  );

  return useMemo(
    () => ({ configs, loading, isAtivoParaUsuario, refetch }),
    [configs, loading, isAtivoParaUsuario, refetch],
  );
}
