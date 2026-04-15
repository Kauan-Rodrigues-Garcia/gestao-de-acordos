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
 * ─── ARQUITETURA ─────────────────────────────────────────────────────────────
 *
 *   App
 *   └─ RealtimeAcordosProvider        ← 1 canal WebSocket
 *       ├─ subscribersRef (Map)        ← callbacks registrados
 *       └─ RealtimeContext             ← status + subscribe/unsubscribe
 *           ├─ useAcordos (instância 1) ← subscribe no mount
 *           ├─ useAcordos (instância 2) ← subscribe no mount
 *           ├─ useAcordos (instância 3) ← subscribe no mount
 *           └─ useAnalytics             ← subscribe no mount
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

  // Registry: id → callback
  const subscribersRef = useRef<Map<string, Subscriber>>(new Map());
  // Guard contra setState após unmount
  const mountedRef = useRef(true);

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

  // ── Canal centralizado ────────────────────────────────────────────────────
  useEffect(() => {
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!empresaId) return;

    if (mountedRef.current) setStatus('connecting');

    // Nome único e estável por empresa — criado apenas UMA VEZ
    const channelName = `rt-acordos-central-${empresaId}`;
    let channel: RealtimeChannel;

    channel = supabase
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
            const deletedId = (payload.old as any)?.id as string | undefined;
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
            const newId = (payload.new as any)?.id as string | undefined;
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
        if (channelStatus === 'SUBSCRIBED')    setStatus('connected');
        if (channelStatus === 'CHANNEL_ERROR') { setStatus('error'); console.warn('[Realtime] channel error:', err); }
        if (channelStatus === 'CLOSED')         setStatus('off');
        if (channelStatus === 'TIMED_OUT')      { setStatus('error'); console.warn('[Realtime] channel timed out'); }
      });

    return () => {
      supabase.removeChannel(channel);
      if (mountedRef.current) setStatus('off');
    };
  // Só recria o canal quando a empresa muda — subscribe/unsubscribe são estáveis
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id, perfil?.empresa_id]);

  return (
    <RealtimeContext.Provider value={{ status, subscribe, unsubscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
