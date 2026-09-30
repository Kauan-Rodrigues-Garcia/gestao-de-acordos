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
 *  CHANNEL_ERROR/TIMED_OUT: o supabase-js reentra sozinho no mesmo canal. O
 *  provider só destrói e recria se ele não voltar em `VIGIA_MS`.
 *  CLOSED (o servidor encerrou): a biblioteca não reentra — o provider recria
 *  com backoff exponencial (2s → 4s → … → 30s).
 *  Ao voltar para a aba com o canal morto, a reconexão é imediata (sem backoff).
 *  Qualquer queda, por qualquer caminho, invalida os acordos ao voltar.
 *
 *  Até 17/09/2026 o erro também recriava em 3 s, brigando com a reentrada da
 *  biblioteca, e o CLOSED do canal que o próprio cleanup removia caía no
 *  callback e agendava OUTRA recriação — com o servidor lento, o ciclo não
 *  terminava.
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
import { useNaRotaDoCelular } from '@/lib/mobile/rota';

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

/** Quanto esperar a reentrada do supabase-js depois de erro/timeout. */
const VIGIA_MS = 45_000;

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
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useRealtimeAcordos(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function RealtimeAcordosProvider({ children }: { children: ReactNode }) {
  const { perfil }    = useAuth();
  const { empresa }   = useEmpresa();
  const queryClient   = useQueryClient();
  // As telas do celular (`/m`, `/m/equipe`) não mostram acordo nenhum: lá o
  // canal só gastaria bateria, dados e uma assinatura no servidor por aparelho.
  // Sair para a versão completa religa (30/09/2026).
  const naRotaDoCelular = useNaRotaDoCelular();

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
  // Caiu desde o último SUBSCRIBED: eventos do intervalo se perderam
  const caiuRef           = useRef(false);

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
    if (naRotaDoCelular) {
      statusRef.current = 'off';
      if (mountedRef.current) setStatus('off');
      return;
    }

    // Helper que sincroniza statusRef e state ao mesmo tempo
    const upd = (s: RealtimeStatus) => {
      statusRef.current = s;
      if (mountedRef.current) setStatus(s);
    };

    upd('connecting');

    // Este ciclo do efeito. O cleanup remove o canal, e o CLOSED dessa remoção
    // não pode agendar outra recriação.
    let vivo = true;

    // Nome único por empresa — ao recriar, usamos um novo nome para forçar
    // o Supabase a criar um canal fresh (não reutilizar um canal CLOSED)
    const channelName = `rt-acordos-${empresaId}-${reconnectTick}`;

    /*
     * ── O DELETE chega pela MESMA escuta filtrada (28/09/2026) ──────────────
     *
     * Até aqui havia uma segunda escuta, só de DELETE e SEM filtro, porque o
     * payload de DELETE carregava apenas a chave primária e o filtro
     * `empresa_id=eq.…` nunca casava (defeito medido em 23/08/2026).
     *
     * A migration `20260823140000_acordos_replica_identity_full.sql` resolveu
     * isso na origem, e está aplicada (conferido em 28/09/2026:
     * `relreplident = 'f'`). O `realtime.apply_rls` testa o filtro do DELETE
     * contra o registro ANTIGO inteiro — `empresa_id` incluído — e entrega só
     * a chave primária no `old`, porque a RLS não protege DELETE.
     *
     * A escuta extra custava uma assinatura a mais por aba aberta em
     * `realtime.subscription` (328 assinaturas para 164 abas) e fazia cada DELETE de
     * qualquer empresa ser entregue a TODAS as abas das quatro operações.
     */
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
          // Só a chave primária vem no `old` — é o que basta para tirar da lista.
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
            // O provider é global; a lista, não. Sem tela ouvindo, a leitura
            // com joins ia para ninguém — em toda aba aberta, a cada acordo
            // novo da empresa. Quem montar a lista depois lê do banco.
            if (subscribersRef.current.size === 0) return;

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
        if (!mountedRef.current || !vivo) return;

        if (channelStatus === 'SUBSCRIBED') {
          // Conexão estabelecida — cancela grace timer e zera backoff
          if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          // Voltou depois de queda — pela reentrada da biblioteca ou por canal
          // novo: invalida o cache para recuperar os eventos perdidos.
          if (caiuRef.current || reconnectRef.current > 0) {
            queryClient.invalidateQueries({ queryKey: ['acordos'] });
          }
          caiuRef.current = false;
          reconnectRef.current = 0;
          upd('connected');
          return;
        }

        // CLOSED/ERROR: o status muda em 3s (troca rápida de aba reconecta antes
        // disso). Recriar o canal espera `recriarApos`: curto para CLOSED, que
        // ninguém mais vai reerguer; `VIGIA_MS` para erro, que a biblioteca
        // reergue sozinha.
        const handleFailure = (nextStatus: RealtimeStatus, recriarApos: number) => {
          caiuRef.current = true;
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          closeTimerRef.current = setTimeout(() => {
            if (!mountedRef.current || !vivo) return;
            upd(nextStatus);
            // Agendar reconexão com backoff: 2s → 4s → 8s → 16s → 30s (cap)
            reconnectRef.current++;
            const backoff = Math.min(1000 * Math.pow(2, reconnectRef.current), 30_000);
            const delay = Math.max(backoff, recriarApos);
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (mountedRef.current && vivo) setReconnectTick(t => t + 1);
            }, delay);
          }, 3000);
        };

        if (channelStatus === 'CLOSED') {
          handleFailure('off', 0);
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
          handleFailure('error', VIGIA_MS);
          if (err) registrar('[Realtime] channel error:', err);
          else registrar('[Realtime] channel error');
          return;
        }
        if (channelStatus === 'TIMED_OUT') {
          handleFailure('error', VIGIA_MS);
          registrar('[Realtime] channel timed out');
          return;
        }
      });

    return () => {
      vivo = false;
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      supabase.removeChannel(channel);
    };
   
  }, [empresa?.id, perfil?.empresa_id, reconnectTick, queryClient, naRotaDoCelular]);

  return (
    <RealtimeContext.Provider value={{ status, subscribe, unsubscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
