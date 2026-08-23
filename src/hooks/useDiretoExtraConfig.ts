/**
 * src/hooks/useDiretoExtraConfig.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cache local com realtime de todas as configurações `direto_extra_config`
 * da empresa atual + utilitário para resolver se um operador está com a
 * lógica ativada.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
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

  /*
   * `loading` daqui não é um esqueleto de tela: quem consome usa para saber se
   * já dá para decidir Direto × Extra de um acordo. Ligá-lo a cada evento de
   * realtime fazia o vínculo "voltar a ser desconhecido" por um instante, e as
   * telas que dependem disso oscilavam de rótulo.
   *
   * Agora ele vale só até a primeira resposta. A releitura reconcilia: config
   * que não mudou volta com a mesma referência.
   */
  const primeiraCarga = useRef(true);

  const refetch = useCallback(async () => {
    if (!empresaId) { setConfigs([]); setLoading(false); return; }
    const comEsqueleto = primeiraCarga.current;
    if (comEsqueleto) setLoading(true);
    const data = await fetchDiretoExtraConfigs(empresaId);
    setConfigs(atual => reconciliarLista(atual, data, {
      chave: c => c.id, iguais: iguaisProfundo,
    }));
    if (comEsqueleto) setLoading(false);
    primeiraCarga.current = false;
  }, [empresaId]);

  // Empresa nova, cache antigo: volta a merecer espera.
  useEffect(() => { primeiraCarga.current = true; }, [empresaId]);

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
