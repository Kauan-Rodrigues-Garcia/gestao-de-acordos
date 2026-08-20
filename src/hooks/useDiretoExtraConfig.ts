/**
 * src/hooks/useDiretoExtraConfig.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cache local com realtime de todas as configurações `direto_extra_config`
 * da empresa atual + utilitário para resolver se um operador está com a
 * lógica ativada.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { assinarTabela } from '@/lib/realtime';
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

  // Realtime — canal compartilhado (dedup por tópico + reconexão automática).
  // `onReconectado` relê: as mudanças de configuração ocorridas durante a queda
  // não voltam como evento, e config errada em cache muda o vínculo do acordo.
  useEffect(() => {
    if (!empresaId) return;
    return assinarTabela(
      {
        topico:  `rt-direto-extra-${empresaId}`,
        escutas: [{
          tabela: 'direto_extra_config',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento:      () => { void refetch(); },
        onReconectado: () => { void refetch(); },
      },
    );
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
