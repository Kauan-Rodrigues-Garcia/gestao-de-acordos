/**
 * src/providers/RealtimeAcordosProvider.tsx  — Fase 3: Canal Realtime Centralizado
 *
 * ─── PROBLEMA RESOLVIDO ───────────────────────────────────────────────────────
 *  Antes: cada instância de useAcordos criava seu próprio canal Supabase com o
 *  mesmo nome → conflito entre canais + remoção prematura quando qualquer
 *  instância desmontava (removeChannel matava o canal das outras).
 *  No Dashboard.tsx havia até 4 canais simultâneos (3× useAcordos + 1× metricas),
 *  o que fazia o PaguePay perder a conexão Realtime.
 *
 * ─── SOLUÇÃO ─────────────────────────────────────────────────────────────────
 *  Um único canal WebSocket por empresa (padrão "Broadcaster") com um
 *  registry de subscribers. Cada hook (useAcordos, useAnalytics) registra
 *  um callback e recebe os eventos, sem criar canais próprios.
 *
 * ─── RECONEXÃO AUTOMÁTICA ────────────────────────────────────────────────────
 *  Quando o canal fecha (CLOSED/TIMED_OUT/CHANNEL_ERROR), o provider destrói
 *  o canal morto e cria um novo com backoff exponencial (2s → 4s → … → 30s).
 *  Ao voltar para a aba com o canal morto, a reconexão é imediata (sem backoff).
 *
 * ─── TIPOS EXPORTADOS ────────────────────────────────────────────────────────
 *  RealtimeStatus      → 'off' | 'connecting' | 'connected' | 'error'
 *  AcordoRealtimeEvent → { eventType, newRecord?, oldRecord? }
 *  useRealtimeAcordos  → hook que expõe { status, subscribe, unsubscribe }
 */
import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, type Acordo } from '@/lib/supabase';
import { useAuth }    from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type RealtimeStatus = 'off' | 'connecting' | 'connected' | 'error';

export interface AcordoRealtimeEvent {
  /** Tipo do evento Postgres */
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  /**
   * INSERT: registro completo com joins (perfis, setores) — buscado após o evento.
   * UPDATE: campos escalares alterados (joins preservados no subscriber via merge).
   */
  newRecord?: Acordo;
  /** DELETE: apenas o id é garantido */
  oldRecord?: { id: string };
}

type Subscriber = (event: AcordoRealtimeEvent) => void;

interface RealtimeContextValue {
  /** Estado da conexão WebSocket — use para indicador visual */
  status: RealtimeStatus;
  /**
   * Registra um subscriber para eventos de acordos.
   * Chame no mount do hook, passe um id único por instância.
   */
  subscribe: (id: string, cb: Subscriber) => void;
  /** Remove um subscriber — chame no cleanup do useEffect */
  unsubscribe: (id: string) => void;
}

// ── Context (safe default: no-op) ─────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextValue>({
  status:      'off',
  subscribe:   () => {},
  unsubscribe: () => {},
});

// ── Hook público ──────────────────────────────────────────────────────────────

/** Acessa o canal Realtime centralizado. Disponível dentro de RealtimeAcordosProvider. */
export function useRealtimeAcordos(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function RealtimeAcordosProvider({ children }: { children: ReactNode }) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [status, setStatus] = useState<RealtimeStatus>('off');
  // Incrementar força recriação do canal (reconexão automática ou por visibilidade)
  const [reconnectTick, setReconnectTick] = useState(0);

  // Registry: id → callback
  const subscribersRef    = useRef<Map<string, Subscriber>>(new Map());
  // Guard contra setState após unmount
  const mountedRef        = useRef(true);
  // Ref do status atual — leitura sem causar dependência em effects
  const statusRef         = useRef<RealtimeStatus>('off');
  // Grace timer: aguarda antes de confirmar CLOSED/ERROR (troca de aba reconecta em ~1s)
  const closeTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Backoff timer: atraso antes de tentar reconectar após falha
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Contador de tentativas de reconexão consecutivas (para backoff)
  const reconnectRef      = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // subscribe/unsubscribe são estáveis — não causam re-renders nos subscribers
  const subscribe = useCallback((id: string, cb: Subscriber) => {
    subscribersRef.current.set(id, cb);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  // ── Reconectar ao voltar para a aba com canal morto ───────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && mountedRef.current &&
          (statusRef.current === 'off' || statusRef.current === 'error')) {
        // Reconexão imediata sem backoff — é o usuário voltando para a aba
        reconnectRef.current = 0;
        setReconnectTick(t => t + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Canal centralizado — recria quando empresa muda ou reconnectTick sobe ──
  useEffect(() => {
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!empresaId) return;

    // Helper que sincroniza statusRef e state ao mesmo tempo
    const upd = (s: RealtimeStatus) => {
      statusRef.current = s;
      if (mountedRef.current) setStatus(s);
    };

    upd('connecting');

    // Nome único por empresa — ao recriar, usamos um novo nome para forçar
    // o Supabase a criar um canal fresh (não reutilizar um canal CLOSED)
    const channelName = `rt-acordos-${empresaId}-${reconnectTick}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'acordos',
          filter: `empresa_id=eq.${empresaId}`,
        },
        async (payload) => {
          if (!mountedRef.current) return;

          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';

          // ── UPDATE ──────────────────────────────────────────────────────────
          // Envia o payload diretamente; cada subscriber faz o merge preservando
          // os joins (perfis, setores) que já tem em memória local.
          if (eventType === 'UPDATE') {
            const event: AcordoRealtimeEvent = {
              eventType: 'UPDATE',
              newRecord: payload.new as Acordo,
            };
            subscribersRef.current.forEach(cb => cb(event));
            return;
          }

          // ── DELETE ──────────────────────────────────────────────────────────
          // Apenas o id é necessário para remover da lista local.
          if (eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string } | null)?.id;
            if (!deletedId) return;
            const event: AcordoRealtimeEvent = {
              eventType: 'DELETE',
              oldRecord: { id: deletedId },
            };
            subscribersRef.current.forEach(cb => cb(event));
            return;
          }

          // ── INSERT ──────────────────────────────────────────────────────────
          // Busca o registro COMPLETO com joins antes de notificar os subscribers.
          // Isso garante que o nome do operador e o setor apareçam corretamente.
          if (eventType === 'INSERT') {
            const newId = (payload.new as { id?: string } | null)?.id;
            if (!newId) return;

            const { data: full, error } = await supabase
              .from('acordos')
              .select('*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)')
              .eq('id', newId)
              .single();

            if (error || !full || !mountedRef.current) return;

            const event: AcordoRealtimeEvent = {
              eventType: 'INSERT',
              newRecord: full as Acordo,
            };
            subscribersRef.current.forEach(cb => cb(event));
          }
        },
      )
      .subscribe((channelStatus, err) => {
        if (!mountedRef.current) return;

        if (channelStatus === 'SUBSCRIBED') {
          // Conexão estabelecida — cancela grace timer e zera backoff
          if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          reconnectRef.current = 0;
          upd('connected');
          return;
        }

        // CLOSED/ERROR: aguarda 3s (troca rápida de aba → reconecta automaticamente)
        // Se não reconectar, destrói o canal e cria um novo com backoff exponencial.
        const handleFailure = (nextStatus: RealtimeStatus) => {
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          closeTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            upd(nextStatus);
            // Agendar reconexão com backoff: 2s → 4s → 8s → 16s → 30s (cap)
            reconnectRef.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectRef.current), 30_000);
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (mountedRef.current) setReconnectTick(t => t + 1);
            }, delay);
          }, 3000);
        };

        if (channelStatus === 'CLOSED') {
          handleFailure('off');
          return;
        }
        if (channelStatus === 'CHANNEL_ERROR') {
          handleFailure('error');
          console.warn('[Realtime] channel error:', err);
          return;
        }
        if (channelStatus === 'TIMED_OUT') {
          handleFailure('error');
          console.warn('[Realtime] channel timed out');
          return;
        }
      });

    return () => {
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      supabase.removeChannel(channel);
    };
   
  }, [empresa?.id, perfil?.empresa_id, reconnectTick]);

  return (
    <RealtimeContext.Provider value={{ status, subscribe, unsubscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
