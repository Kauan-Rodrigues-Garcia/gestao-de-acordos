/**
 * src/hooks/usePresence.ts
 *
 * Hook centralizado de presença via Supabase Realtime Presence.
 *
 * ── Como funciona ───────────────────────────────────────────────────────────
 * • Um único canal `presence-empresa-{empresa_id}` é mantido enquanto o
 *   usuário estiver logado (montado no Layout, que é persistente).
 * • Ao montar, chama `channel.track({ user_id, nome, perfil })` — isso
 *   registra o usuário como "online" para todos no mesmo canal.
 * • Ao desmontar (logout / fechar aba), o Supabase detecta a desconexão
 *   e o estado é sincronizado automaticamente para os demais.
 * • `onlineIds` expõe o Set<string> de IDs online para uso em qualquer
 *   componente (ex: AdminUsuarios).
 *
 * ── Bugs corrigidos em relação à versão anterior ────────────────────────────
 * 1. O track era feito apenas dentro de AdminUsuarios, então usuários em
 *    outras páginas nunca apareciam como online.
 * 2. `presenceState` retorna um objeto cujas CHAVES são a `key` do Presence
 *    (= user_id), não o campo dentro do payload. O código anterior iterava
 *    `.flatMap(arr => arr.map(p => p.user_id))`, o que funcionava, mas
 *    dependia do payload. Agora usamos Object.keys(state) diretamente como
 *    fonte primária de verdade (mais robusto).
 * 3. Ausência de handler para `presence_join` / `presence_leave` tornava
 *    o indicador lento — agora os três eventos atualizam o estado.
 * 4. Sem heartbeat: o Realtime desconecta se ficar ocioso. Adicionamos
 *    um re-track a cada 25s para manter a presença ativa.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface PresencePayload {
  user_id: string;
  nome?: string;
  perfil_tipo?: string;
}

export interface UsePresenceOptions {
  /** ID da empresa — isola o canal por tenant */
  empresaId: string | undefined;
  /** ID do usuário logado */
  userId: string | undefined;
  /** Dados extras a incluir no payload (nome, perfil) */
  meta?: { nome?: string; perfil_tipo?: string };
  /**
   * Se true, apenas observa a presença dos outros (não faz track).
   * Útil para componentes que só precisam ler o estado.
   * Padrão: false (faz track).
   */
  observerOnly?: boolean;
}

export interface UsePresenceResult {
  /** Set com os IDs de todos os usuários online no canal */
  onlineIds: Set<string>;
  /** true enquanto o canal ainda não recebeu o primeiro sync */
  loading: boolean;
}

/** Intervalo de re-track para evitar timeout do Realtime (ms) */
const HEARTBEAT_INTERVAL = 25_000;

export function usePresence({
  empresaId,
  userId,
  meta,
  observerOnly = false,
}: UsePresenceOptions): UsePresenceResult {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef   = useRef(true);

  /** Extrai os IDs do presenceState — usa as keys (= user_id configurado) */
  const extractIds = useCallback(
    (state: Record<string, PresencePayload[]>): Set<string> => {
      const ids = new Set<string>();
      Object.keys(state).forEach(key => {
        // key = valor de config.presence.key, que definimos como userId
        ids.add(key);
        // também lemos user_id do payload como fallback
        (state[key] ?? []).forEach(p => {
          if (p?.user_id) ids.add(p.user_id);
        });
      });
      return ids;
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!empresaId || !userId) return;

    const channelName = `presence-empresa-${empresaId}`;

    // ── Cria o canal com a key = userId ────────────────────────────────────
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: userId },
      },
    });

    channelRef.current = channel;

    // ── Handlers de presença ──────────────────────────────────────────────
    channel
      .on('presence', { event: 'sync' }, () => {
        if (!mountedRef.current) return;
        const state = channel.presenceState<PresencePayload>();
        setOnlineIds(extractIds(state));
        setLoading(false);
      })
      .on('presence', { event: 'join' }, () => {
        if (!mountedRef.current) return;
        const state = channel.presenceState<PresencePayload>();
        setOnlineIds(extractIds(state));
      })
      .on('presence', { event: 'leave' }, () => {
        if (!mountedRef.current) return;
        const state = channel.presenceState<PresencePayload>();
        setOnlineIds(extractIds(state));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !observerOnly) {
          await channel.track({
            user_id:      userId,
            nome:         meta?.nome         ?? '',
            perfil_tipo:  meta?.perfil_tipo  ?? '',
          });

          // ── Heartbeat: re-track periódico para manter presença ativa ─────
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(async () => {
            if (!mountedRef.current) return;
            try {
              await channel.track({
                user_id:     userId,
                nome:        meta?.nome        ?? '',
                perfil_tipo: meta?.perfil_tipo ?? '',
              });
            } catch {
              // silencia erros de re-track (canal pode ter reconectado)
            }
          }, HEARTBEAT_INTERVAL);
        }
      });

    return () => {
      mountedRef.current = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, userId]);

  return { onlineIds, loading };
}
