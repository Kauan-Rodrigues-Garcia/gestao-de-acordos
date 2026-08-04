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
 * 2. Após SUBSCRIBED → `channel.track({ user_id, nome, perfil_tipo })`, UMA vez
 * 3. Eventos sync/join/leave → atualiza `onlineIds` via setState
 * 4. Provider desmonta (logout) → `supabase.removeChannel(channel)`
 *
 * ── Por que NÃO existe heartbeat de re-track ─────────────────────────────────
 * Existiu um, de 20 em 20 segundos, e ele derrubava o Realtime:
 *
 *     PresenceRateLimitReached: Too many presence events per second
 *
 * Cada `track()` é difundido para TODOS os membros do canal. Com N pessoas
 * logadas, um re-track por pessoa a cada 20 s gera N/20 tracks por segundo, e
 * cada um deles notifica as outras N — o custo cresce ao quadrado. Numa
 * operação com dezenas de pessoas online o limite estourava sem parar, e aí o
 * ciclo se realimentava: o canal caía, o código reconectava, o SUBSCRIBED
 * fazia track de novo e reabria o intervalo.
 *
 * O re-track periódico também não servia para nada: o Presence do Supabase
 * mantém o estado enquanto o socket estiver vivo, e o socket já tem o próprio
 * heartbeat de transporte, que não é evento de presence. Quem cobre queda de
 * rede e máquina suspensa é a reconexão (CLOSED/CHANNEL_ERROR + visibilitychange),
 * logo abaixo. O track só é repetido quando FALHA — ver `doTrack`.
 *
 * ── Por que a reconexão é ESPALHADA no tempo ─────────────────────────────────
 * O mesmo erro voltou ao log em 04/08/2026, em ondas: vários estouros por minuto
 * na volta do intervalo, quando a operação inteira reabre o notebook junto.
 *
 * O canal de presence é UM só por empresa, então todo mundo divide o mesmo
 * orçamento de eventos por segundo. Quando ele satura, os clientes caem
 * JUNTOS — e o backoff, sendo idêntico e determinístico para todos (3 s, 6 s,
 * 12 s…), fazia todos voltarem juntos e saturarem de novo. Uma manada
 * sincronizada, batendo na mesma porta em uníssono.
 *
 * Daí o jitter em `esperaComJitter`: mesma ordem de grandeza de espera, mas
 * cada aba sorteia a sua e a onda vira chuvisco. Pelo mesmo motivo o retorno à
 * aba não reconecta mais no mesmo milissegundo para todos.
 */
import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { fetchEmpresas } from '@/services/empresas.service';

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

/**
 * Espera antes de tentar o `track` de novo quando ele falha.
 *
 * Só vale para falha — não é heartbeat (ver o cabeçalho). Sem esta retentativa,
 * um `track` que voltasse 'timed out' deixaria a pessoa invisível para todos
 * até o próximo F5.
 */
const RETRY_TRACK_MS = 5_000;

/** Teto de tentativas do track. Depois disso, a reconexão do canal reassume. */
const MAX_TENTATIVAS_TRACK = 4;

const BACKOFF_BASE_MS = 3_000;
const BACKOFF_MAX_MS  = 30_000;

/**
 * Espalhamento máximo ao voltar para a aba ou quando a rede volta.
 *
 * Curto de propósito: é a hora em que a pessoa está olhando a tela e espera ver
 * quem está online. Meio segundo médio não se percebe, e já basta para as
 * dezenas de abas que voltam do intervalo no mesmo minuto não pedirem `track`
 * no mesmo instante.
 */
const ESPALHAMENTO_RETOMADA_MS = 1_500;

/**
 * Backoff exponencial com "equal jitter": metade fixa, metade sorteada.
 *
 * A metade fixa garante que a espera cresce de verdade a cada tentativa (com
 * jitter total, um sorteio baixo devolveria o cliente ao canal saturado na
 * hora); a metade sorteada é o que dessincroniza as abas.
 */
function esperaComJitter(tentativa: number): number {
  const teto = Math.min(BACKOFF_BASE_MS * 2 ** tentativa, BACKOFF_MAX_MS);
  return teto / 2 + Math.random() * (teto / 2);
}

/** Dois conjuntos com os mesmos ids? Evita re-render do app inteiro à toa. */
function mesmosIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [onlineIds, setOnlineIds]           = useState<Set<string>>(new Set());
  // Presença de OUTRAS empresas — só populado para super_admin (ver efeito abaixo).
  const [outrasEmpresasIds, setOutrasEmpresasIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);

  const [reconnectKey, setReconnectKey] = useState(0);

  const channelRef          = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const retryTrackRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef          = useRef(true);

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

  // ── Recuperação ao voltar para a aba / a rede voltar ──────────────────────
  // O canal de presença não tinha nada disso: suspender a máquina ou perder o
  // wi-fi deixava o usuário invisível para todos até um F5.
  useEffect(() => {
    const reviver = () => {
      if (!mountedRef.current) return;
      if (channelRef.current?.state === 'joined') return;
      reconnectAttemptsRef.current = 0;   // usuário está de volta: sem backoff
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      // Sem espera fixa e sem espera longa: só o bastante para que o turno
      // inteiro voltando do intervalo não peça `track` no mesmo instante.
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setReconnectKey(k => k + 1);
      }, Math.random() * ESPALHAMENTO_RETOMADA_MS);
    };
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === 'visible') reviver();
    };
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    window.addEventListener('online', reviver);
    return () => {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
      window.removeEventListener('online', reviver);
    };
  }, []);

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

    /**
     * Anuncia esta pessoa no canal. Chamado UMA vez por SUBSCRIBED.
     *
     * Repete só quando falha, com teto — nunca em intervalo fixo, que foi o que
     * estourou o limite de presence do Realtime (ver cabeçalho).
     */
    const doTrack = async (tentativa = 0) => {
      const repetir = () => {
        if (tentativa + 1 >= MAX_TENTATIVAS_TRACK) return;
        if (retryTrackRef.current) clearTimeout(retryTrackRef.current);
        retryTrackRef.current = setTimeout(() => {
          if (mountedRef.current) void doTrack(tentativa + 1);
        }, RETRY_TRACK_MS);
      };

      try {
        const resposta = await channel.track({
          user_id:     userId,
          nome:        perfil?.nome        ?? '',
          perfil_tipo: perfil?.perfil      ?? '',
        });
        // 'ok' | 'timed out' | 'error' — só o primeiro colocou a pessoa no ar.
        if (resposta !== 'ok') repetir();
      } catch (e) {
        console.warn('[PresenceProvider] track error:', e);
        repetir();
      }
    };

    // ── Handlers ──────────────────────────────────────────────────────────
    // Este Provider está no topo da árvore: trocar o Set faz o app inteiro
    // re-renderizar. `mesmosIds` corta o render quando o evento não mudou nada
    // — e sync/join/leave chegam bastante numa empresa com muita gente online.
    const aplicarEstado = () => {
      if (!mountedRef.current) return;
      const novos = extractIds(channel.presenceState<PresencePayload>());
      setOnlineIds(prev => (mesmosIds(prev, novos) ? prev : novos));
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        aplicarEstado();
        if (mountedRef.current) setLoading(false);
      })
      .on('presence', { event: 'join' },  aplicarEstado)
      .on('presence', { event: 'leave' }, aplicarEstado)
      .subscribe(async (status, err) => {
        if (!mountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          reconnectAttemptsRef.current = 0;
          // Uma vez só. A presença vive enquanto o socket viver.
          if (retryTrackRef.current) { clearTimeout(retryTrackRef.current); retryTrackRef.current = null; }
          await doTrack();
        }

        // CLOSED entra aqui de propósito: era o caso NÃO tratado, e é o mais
        // comum de todos (o servidor encerra o socket ocioso). Sem isso, a
        // presença ficava morta em silêncio e todo mundo aparecia offline.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (status !== 'CLOSED') console.warn('[Realtime] presence:', status, err);
          // Sem teto de tentativas: o backoff satura em 30 s, e uma aba aberta
          // deve continuar tentando. O limite antigo de 5 tentativas fazia a
          // presença morrer de vez depois de suspender a máquina.
          const delay = esperaComJitter(reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setReconnectKey(k => k + 1);
          }, delay);
        }
      });

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      mountedRef.current = false;
      if (retryTrackRef.current) {
        clearTimeout(retryTrackRef.current);
        retryTrackRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Sem `untrack()` antes de sair.
      //
      // Este cleanup roda em toda RECONEXÃO, não só no logout, e `untrack` é um
      // evento de presence a mais no canal — enviado justamente quando ele está
      // saturado, que é o que derruba a conexão. Sair do canal já basta: o
      // servidor descarta a presença da key e difunde o `leave` para os demais.
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id, empresa?.id, reconnectKey]);

  // ── Super admin: enxerga presença de TODAS as empresas ─────────────────────
  // O canal acima é escopado por empresa (`presence-empresa-{id}`), então um
  // super_admin olhando o BookPlay via seu próprio canal nunca via usuários do
  // PagueiPlay online (e vice-versa). Aqui abrimos um canal extra (só leitura,
  // sem track) para cada OUTRA empresa e mesclamos os IDs no set exposto.
  useEffect(() => {
    if (perfil?.perfil !== 'super_admin') {
      setOutrasEmpresasIds(new Set());
      return;
    }
    // Esperar a empresa resolver. Sem esta guarda, `filter(e => e.id !== undefined)`
    // não excluía nada e abríamos um SEGUNDO canal com o tópico
    // `presence-empresa-{própria}` — exatamente a duplicação que o cabeçalho
    // deste arquivo descreve, e que fazia o super_admin ver a si mesmo sozinho.
    if (!empresa?.id) return;
    const empresaAtualId = empresa.id;

    let ativo = true;
    const canaisExtras: ReturnType<typeof supabase.channel>[] = [];

    fetchEmpresas()
      .then((empresas) => {
        if (!ativo) return;
        const outras = empresas.filter((e) => e.id !== empresaAtualId);
        const acumulado = new Set<string>();

        outras.forEach((emp) => {
          const canal = supabase.channel(`presence-empresa-${emp.id}`);
          canaisExtras.push(canal);
          canal
            .on('presence', { event: 'sync' }, () => {
              if (!ativo) return;
              const state = canal.presenceState<PresencePayload>();
              Object.keys(state).forEach((id) => acumulado.add(id));
              setOutrasEmpresasIds(new Set(acumulado));
            })
            .subscribe();
        });
      })
      // Sem o catch, uma falha de rede aqui virava unhandled rejection —
      // presença de outras empresas é enfeite, não deve quebrar nada.
      .catch((e) => { console.warn('[PresenceProvider] fetchEmpresas falhou:', e); });

    return () => {
      ativo = false;
      canaisExtras.forEach((c) => supabase.removeChannel(c));
    };
  }, [perfil?.perfil, empresa?.id]);

  const onlineIdsTotal = outrasEmpresasIds.size
    ? new Set([...onlineIds, ...outrasEmpresasIds])
    : onlineIds;

  return (
    <PresenceContext.Provider value={{ onlineIds: onlineIdsTotal, loading }}>
      {children}
    </PresenceContext.Provider>
  );
}

// ── Hook consumidor ───────────────────────────────────────────────────────────

/**
 * Retorna os IDs dos usuários online no canal da empresa.
 * Deve ser usado dentro de <PresenceProvider>.
 */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useOnlineUsers(): PresenceContextValue {
  return useContext(PresenceContext);
}
