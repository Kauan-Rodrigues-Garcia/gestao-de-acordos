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
import { useQueryClient } from '@tanstack/react-query';
import { supabase, type Acordo } from '@/lib/supabase';
import { useAuth }    from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { logger } from '@/lib/logger';

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
  const { perfil }    = useAuth();
  const { empresa }   = useEmpresa();
  const queryClient   = useQueryClient();

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

    /*
     * ── Por que o DELETE tem escuta PRÓPRIA, e sem filtro ────────────────────
     *
     * O payload de DELETE do Postgres carrega apenas a *replica identity* da
     * linha — com a identidade padrão, só a chave primária. `empresa_id` não
     * está lá, então o filtro `empresa_id=eq.…` NUNCA casa e o evento
     * simplesmente não chega. A consequência, medida em 23/08/2026: excluir um
     * acordo não mexia em nada do painel de quem estava olhando, e não mexia em
     * nada NENHUM na tela das outras pessoas. Só a aba de quem clicou parecia
     * funcionar, porque ela remove o item localmente (`removeAcordo`).
     *
     * A armadilha já estava escrita em `src/lib/realtime.ts` e este provider,
     * que é anterior a ela, nunca foi corrigido.
     *
     * A escuta sem filtro resolve hoje, sem depender de migration. O preço é
     * receber também o DELETE da outra empresa: sobra um id que não está na
     * lista local (remoção vira no-op) e, no pior caso, uma releitura agrupada
     * cujo resultado a RLS recorta do mesmo jeito. Nenhum dado atravessa — um
     * UUID solto não diz nada, e toda leitura continua passando pelo banco.
     *
     * A migration `20260823140000_acordos_replica_identity_full.sql` completa o
     * conserto: com `REPLICA IDENTITY FULL` o registro antigo vem inteiro, o
     * que permite à RLS avaliar o DELETE e nos deixa saber de que empresa ele
     * era. A escuta segue sem filtro de propósito — ela funciona nos dois
     * mundos, e é o que evita que a tela volte a depender de uma migration
     * aplicada para o básico funcionar.
     */
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'acordos' },
        (payload) => {
          if (!mountedRef.current) return;
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (!deletedId) return;
          const event: AcordoRealtimeEvent = {
            eventType: 'DELETE',
            oldRecord: { id: deletedId },
          };
          subscribersRef.current.forEach(cb => cb(event));
        },
      )
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
          // Já tratado pela escuta dedicada acima. Com a identidade padrão ele
          // nem chega aqui (o filtro não casa); depois de `REPLICA IDENTITY
          // FULL` ele passa a chegar, e sem esta saída o mesmo id seria
          // despachado duas vezes.
          if (eventType === 'DELETE') return;

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
          // Reconexão após falha: invalida cache para recuperar eventos perdidos durante o downtime
          if (reconnectRef.current > 0) {
            queryClient.invalidateQueries({ queryKey: ['acordos'] });
          }
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
        /*
         * A primeira falha de um ciclo é a reconexão trabalhando, não defeito:
         * o servidor encerra o socket ocioso e o canal cai junto com todos os
         * outros. Vira aviso só quando a retentativa também falha.
         *
         * `err` só entra quando existe — num fechamento de socket o Supabase
         * não manda `Error`, e a linha terminava com a palavra "undefined".
         */
        const primeiraFalha = reconnectRef.current === 0;
        const registrar = primeiraFalha ? logger.info : logger.warn;

        if (channelStatus === 'CHANNEL_ERROR') {
          handleFailure('error');
          if (err) registrar('[Realtime] channel error:', err);
          else registrar('[Realtime] channel error');
          return;
        }
        if (channelStatus === 'TIMED_OUT') {
          handleFailure('error');
          registrar('[Realtime] channel timed out');
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
