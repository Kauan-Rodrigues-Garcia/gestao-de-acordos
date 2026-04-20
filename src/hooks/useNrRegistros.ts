/**
 * src/hooks/useNrRegistros.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Hook que mantém um cache local dos NRs registrados da empresa,
 * atualizado em tempo real via Supabase Realtime (canal próprio na tabela
 * `nr_registros`). Todos os usuários autenticados recebem atualizações
 * instantâneas quando um NR é registrado, transferido ou liberado.
 *
 * Uso:
 *   const { verificarConflito, loading } = useNrRegistros();
 *   const conflito = verificarConflito('12345', 'nr_cliente');
 *   // conflito → null (livre) | NrConflito (ocupado)
 */
import {
  useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth }    from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  type NrRegistro,
  type NrConflito,
  type NrCampo,
  fetchNrRegistros,
} from '@/services/nr_registros.service';

// ─── Tipos exportados ────────────────────────────────────────────────────────

export type { NrConflito, NrCampo };

export interface UseNrRegistrosResult {
  /** true enquanto carrega o cache inicial */
  loading: boolean;
  /** Map interno: `${empresaId}:${campo}:${nrValue}` → NrRegistro */
  cacheMap: Map<string, NrRegistro>;
  /**
   * Verifica se um NR tem conflito no cache local (sem query ao banco).
   * Retorna null se livre ou NrConflito se ocupado.
   * @param acordoIdExcluir - ID do acordo a ignorar (edição)
   */
  verificarConflito: (
    nrValue:          string,
    campo:            NrCampo,
    acordoIdExcluir?: string,
  ) => NrConflito | null;
  /** Força re-fetch do cache completo */
  refetch: () => Promise<void>;
}

// ─── Chave de cache ───────────────────────────────────────────────────────────

function cacheKey(empresaId: string, campo: NrCampo, nrValue: string): string {
  return `${empresaId}:${campo}:${nrValue.trim().toLowerCase()}`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNrRegistros(): UseNrRegistrosResult {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? '';

  const [cacheMap, setCacheMap] = useState<Map<string, NrRegistro>>(new Map());
  const [loading,  setLoading]  = useState(true);
  const mountedRef = useRef(true);

  // ── Carregar cache inicial ──────────────────────────────────────────────
  const refetch = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const registros = await fetchNrRegistros(empresaId);
      if (!mountedRef.current) return;
      const map = new Map<string, NrRegistro>();
      for (const r of registros) {
        map.set(cacheKey(empresaId, r.campo as NrCampo, r.nr_value), r);
      }
      setCacheMap(map);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    refetch();
  }, [empresaId, refetch]);

  // ── Canal Realtime para nr_registros ────────────────────────────────────
  useEffect(() => {
    if (!empresaId) return;

    const channelName = `rt-nr-registros-${empresaId}`;

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'nr_registros',
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;

          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';

          setCacheMap(prev => {
            const next = new Map(prev);

            if (eventType === 'DELETE') {
              const old = payload.old as Partial<NrRegistro>;
              if (old.empresa_id && old.campo && old.nr_value) {
                next.delete(cacheKey(old.empresa_id, old.campo as NrCampo, old.nr_value));
              }
              return next;
            }

            // INSERT ou UPDATE
            const rec = (eventType === 'INSERT' ? payload.new : payload.new) as NrRegistro;
            if (rec?.empresa_id && rec.campo && rec.nr_value) {
              next.set(cacheKey(rec.empresa_id, rec.campo as NrCampo, rec.nr_value), rec);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [empresaId]);

  // ── verificarConflito (leitura do cache local — zero latência) ──────────
  const verificarConflito = useCallback(
    (nrValue: string, campo: NrCampo, acordoIdExcluir?: string): NrConflito | null => {
      if (!nrValue?.trim() || !empresaId) return null;

      const key = cacheKey(empresaId, campo, nrValue);
      const reg = cacheMap.get(key);
      if (!reg) return null;

      // Se for o mesmo acordo que estamos editando → não é conflito
      if (acordoIdExcluir && reg.acordo_id === acordoIdExcluir) return null;

      return {
        registroId:   reg.id,
        acordoId:     reg.acordo_id,
        operadorId:   reg.operador_id,
        operadorNome: reg.operador_nome ?? 'Operador desconhecido',
      };
    },
    [cacheMap, empresaId],
  );

  return useMemo(
    () => ({ loading, cacheMap, verificarConflito, refetch }),
    [loading, cacheMap, verificarConflito, refetch],
  );
}
