/**
 * src/providers/NotificacoesProvider.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fonte única das notificações do usuário logado.
 *
 * ── O que existia antes ──────────────────────────────────────────────────────
 * TRÊS implementações da mesma coisa, duas delas rodando ao mesmo tempo:
 *
 *   • `ChatNotificacoes`      — canal `chat-notif-v2-{user}`, lista completa;
 *   • `useNotificacoesCount`  — canal `notif-count-{user}`, um SELECT count por
 *                               evento, só para o badge do header;
 *   • `useNotificacoes`       — terceira versão, com polling de 30 s, que nenhum
 *                               componente montava (código morto).
 *
 * Os dois canais vivos assinavam a MESMA tabela com o MESMO filtro: dois
 * WebSockets por usuário, e a cada notificação recebida o header disparava um
 * `count` extra ao banco enquanto o painel já tinha a lista em memória. Pior, as
 * duas contagens vinham de leituras diferentes e podiam divergir por alguns
 * instantes depois de "marcar todas como lidas".
 *
 * ── Agora ────────────────────────────────────────────────────────────────────
 * Um canal, uma lista, `naoLidas` derivado. O header e o painel leem o MESMO
 * estado, então não há como divergirem.
 */
import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, useMemo, type ReactNode,
} from 'react';
import type { Notificacao } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { assinarTabela } from '@/lib/realtime';
import { logger } from '@/lib/logger';
import {
  fetchNotificacoes, marcarComoLida, marcarTodasLidas as marcarTodasLidasNoBanco,
  excluirNotificacao as excluirNoBanco, limparTodasNotificacoes,
} from '@/services/notificacoes.service';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface NotificacoesContextValue {
  notificacoes: Notificacao[];
  /**
   * Não lidas dentro da lista carregada.
   *
   * A lista é limitada às 200 mais recentes, então em teoria isto saturaria em
   * 200. Na prática é indistinguível da contagem real: quem exibe o número
   * mostra "99+" acima de 99, e a única forma de passar de 200 não lidas é nunca
   * abrir o painel (que marca tudo como lido 2 s depois de abrir).
   */
  naoLidas: number;
  loading: boolean;
  /** Pulso do badge do header quando chega notificação nova. */
  animarBadge: boolean;
  marcarLida: (id: string) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  excluir: (id: string) => Promise<void>;
  limparTodas: () => Promise<void>;
  refresh: () => Promise<void>;
}

const VAZIO: Notificacao[] = [];

const NotificacoesContext = createContext<NotificacoesContextValue>({
  notificacoes: VAZIO,
  naoLidas:     0,
  loading:      false,
  animarBadge:  false,
  marcarLida:       async () => {},
  marcarTodasLidas: async () => {},
  excluir:          async () => {},
  limparTodas:      async () => {},
  refresh:          async () => {},
});

/** Duração do pulso do badge (ms). */
const PULSO_MS = 900;

// ── Provider ─────────────────────────────────────────────────────────────────

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId   = user?.id ?? null;

  const [notificacoes, setNotificacoes] = useState<Notificacao[]>(VAZIO);
  const [loading, setLoading]           = useState(false);
  const [animarBadge, setAnimarBadge]   = useState(false);

  const montadoRef = useRef(true);
  const pulsoRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // O timer do pulso era criado sem cleanup no hook antigo — em unmount durante o
  // pulso, dava setState em componente desmontado.
  useEffect(() => () => {
    if (pulsoRef.current) clearTimeout(pulsoRef.current);
  }, []);

  const pulsar = useCallback(() => {
    setAnimarBadge(true);
    if (pulsoRef.current) clearTimeout(pulsoRef.current);
    pulsoRef.current = setTimeout(() => {
      pulsoRef.current = null;
      if (montadoRef.current) setAnimarBadge(false);
    }, PULSO_MS);
  }, []);

  // ── Carga ──────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!userId) { setNotificacoes(VAZIO); return; }
    setLoading(true);
    try {
      const dados = await fetchNotificacoes(userId);
      if (montadoRef.current) setNotificacoes(dados);
    } finally {
      if (montadoRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Realtime: um canal por usuário ─────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    return assinarTabela(
      {
        topico:  `rt-notificacoes-${userId}`,
        escutas: [
          { tabela: 'notificacoes', evento: 'INSERT', filtro: `usuario_id=eq.${userId}` },
          { tabela: 'notificacoes', evento: 'UPDATE', filtro: `usuario_id=eq.${userId}` },
          // DELETE só chega preenchido porque `notificacoes` está em REPLICA
          // IDENTITY FULL — é o que permite filtrar por usuario_id aqui.
          { tabela: 'notificacoes', evento: 'DELETE', filtro: `usuario_id=eq.${userId}` },
        ],
      },
      {
        onEvento: (payload) => {
          if (!montadoRef.current) return;

          // Duplo cast: o payload do realtime é JSON solto
          // (`Record<string, unknown>`), sem parentesco estrutural com a
          // interface. É a forma do banco, validada pelo filtro da assinatura.
          if (payload.eventType === 'INSERT') {
            const nova = payload.new as unknown as Notificacao;
            setNotificacoes(prev =>
              prev.some(n => n.id === nova.id) ? prev : [nova, ...prev],
            );
            pulsar();
            // Vibração curta no mobile; ignorada onde não existe.
            try { navigator.vibrate?.([50, 30, 50]); } catch { /* noop */ }
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const atualizada = payload.new as unknown as Notificacao;
            setNotificacoes(prev =>
              prev.map(n => (n.id === atualizada.id ? atualizada : n)),
            );
            return;
          }

          const removida = payload.old as { id?: string };
          if (removida?.id) {
            setNotificacoes(prev => prev.filter(n => n.id !== removida.id));
          }
        },
        // Notificações criadas durante a queda não voltam como evento — sem isto,
        // o sino ficaria mudo até o próximo F5.
        onReconectado: () => { void refresh(); },
      },
    );
  }, [userId, refresh, pulsar]);

  // ── Mutações (otimistas: o realtime confirma depois) ───────────────────────

  const marcarLida = useCallback(async (id: string) => {
    setNotificacoes(prev => prev.map(n => (n.id === id ? { ...n, lida: true } : n)));
    await marcarComoLida(id);
  }, []);

  const marcarTodasLidas = useCallback(async () => {
    if (!userId) return;
    setNotificacoes(prev => prev.map(n => (n.lida ? n : { ...n, lida: true })));
    await marcarTodasLidasNoBanco(userId);
  }, [userId]);

  const excluir = useCallback(async (id: string) => {
    setNotificacoes(prev => prev.filter(n => n.id !== id));
    await excluirNoBanco(id);
  }, []);

  const limparTodas = useCallback(async () => {
    if (!userId) return;
    const anteriores = notificacoes;
    setNotificacoes(VAZIO);
    const ok = await limparTodasNotificacoes(userId);
    // A RLS pode recusar o delete; sem isto a lista sumia da tela e voltava só
    // no próximo F5, dando a impressão de que limpou.
    if (!ok && montadoRef.current) {
      logger.warn('[NotificacoesProvider] limparTodas falhou — restaurando lista');
      setNotificacoes(anteriores);
    }
  }, [userId, notificacoes]);

  const naoLidas = useMemo(
    () => notificacoes.reduce((total, n) => (n.lida ? total : total + 1), 0),
    [notificacoes],
  );

  const valor = useMemo<NotificacoesContextValue>(() => ({
    notificacoes, naoLidas, loading, animarBadge,
    marcarLida, marcarTodasLidas, excluir, limparTodas, refresh,
  }), [
    notificacoes, naoLidas, loading, animarBadge,
    marcarLida, marcarTodasLidas, excluir, limparTodas, refresh,
  ]);

  return (
    <NotificacoesContext.Provider value={valor}>
      {children}
    </NotificacoesContext.Provider>
  );
}

// ── Hook consumidor ──────────────────────────────────────────────────────────

/** Notificações do usuário logado. Use dentro de `<NotificacoesProvider>`. */
// eslint-disable-next-line react-refresh/only-export-components -- Provider + hook consumidor no mesmo arquivo, padrão já usado nos outros providers.
export function useNotificacoes(): NotificacoesContextValue {
  return useContext(NotificacoesContext);
}
