/**
 * src/providers/PresenceProvider.tsx
 *
 * Canal Supabase Presence SINGLETON para toda a aplicação.
 *
 * ── Por que Provider e não hook direto? ──────────────────────────────────────
 * O Supabase JS Client trata cada `supabase.channel(nome)` como uma instância
 * independente, mesmo que o nome seja idêntico. Se dois componentes distintos
 * (ex: Layout + AdminUsuarios) chamam `usePresence` e cada um cria seu próprio
 * canal, o resultado é dois WebSockets separados para o mesmo canal — cada um
 * enxerga apenas os usuários que foram rastreados pela sua própria instância.
 * Isso explica o sintoma: o usuário A via apenas si mesmo no AdminUsuarios.
 *
 * Solução: um único canal criado aqui no Provider. Todos os componentes lêem
 * `onlineIds` via Context — sem duplicar canais.
 *
 * ── Ciclo de vida ─────────────────────────────────────────────────────────────
 * 1. Provider monta → cria canal `presence-empresa-{empresaId}`
 * 2. Após SUBSCRIBED → `channel.track({ user_id, nome, perfil_tipo })`
 * 3. Heartbeat 25 s → re-track para manter presença ativa
 * 4. Eventos sync/join/leave → atualiza `onlineIds` via setState
 * 5. Provider desmonta (logout) → `supabase.removeChannel(channel)`
 */
import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PresencePayload {
  user_id: string;
  nome?: string;
  perfil_tipo?: string;
}

interface PresenceContextValue {
  /** IDs de todos os usuários online no canal da empresa */
  onlineIds: Set<string>;
  /** true enquanto não recebeu o primeiro sync do canal */
  loading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PresenceContext = createContext<PresenceContextValue>({
  onlineIds: new Set(),
  loading: true,
});

// ── Intervalo de heartbeat (ms) ───────────────────────────────────────────────
const HEARTBEAT_MS = 20_000;

// ── Provider ──────────────────────────────────────────────────────────────────

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);

  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef    = useRef(true);

  // ── Extrai IDs do presenceState ────────────────────────────────────────────
  // Object.keys(state) retorna a `key` configurada no canal — que definimos
  // como o userId. Lemos também o campo user_id do payload como fallback.
  const extractIds = useCallback(
    (state: Record<string, PresencePayload[]>): Set<string> => {
      const ids = new Set<string>();
      Object.entries(state).forEach(([key, presences]) => {
        if (key) ids.add(key);
        (presences ?? []).forEach(p => {
          if (p?.user_id) ids.add(p.user_id);
        });
      });
      return ids;
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;

    const userId    = perfil?.id;
    const empresaId = empresa?.id;

    if (!userId || !empresaId) return;

    // ── Canal único da empresa ─────────────────────────────────────────────
    // A key é o userId → cada usuário ocupa uma "slot" no presenceState
    const channelName = `presence-empresa-${empresaId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: userId },
      },
    });

    channelRef.current = channel;

    const doTrack = async () => {
      try {
        await channel.track({
          user_id:     userId,
          nome:        perfil?.nome        ?? '',
          perfil_tipo: perfil?.perfil      ?? '',
        });
      } catch (e) {
        console.warn('[PresenceProvider] track error:', e);
      }
    };

    // ── Handlers ──────────────────────────────────────────────────────────
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
      .subscribe(async (status, err) => {
        if (!mountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          // Track imediato após conectar
          await doTrack();

          // Heartbeat: re-track periódico para manter presença viva
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(() => {
            if (mountedRef.current) doTrack();
          }, HEARTBEAT_MS);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[PresenceProvider] canal com problema, status:', status, err);
        }
      });

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      mountedRef.current = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      // untrack + removeChannel garante que o usuário sai do presenceState
      channel.untrack().catch(() => {}).finally(() => {
        supabase.removeChannel(channel);
      });
      channelRef.current = null;
    };
    // Reconecta se trocar de empresa ou de usuário logado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id, empresa?.id]);

  return (
    <PresenceContext.Provider value={{ onlineIds, loading }}>
      {children}
    </PresenceContext.Provider>
  );
}

// ── Hook consumidor ───────────────────────────────────────────────────────────

/**
 * Retorna os IDs dos usuários online no canal da empresa.
 * Deve ser usado dentro de <PresenceProvider>.
 */
export function useOnlineUsers(): PresenceContextValue {
  return useContext(PresenceContext);
}
