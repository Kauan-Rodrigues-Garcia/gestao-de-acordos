/**
 * src/hooks/useNotificacoes.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Hook para gerenciar notificações do usuário logado.
 */
import { useState, useEffect, useCallback } from 'react';
import { Notificacao } from '@/lib/supabase';
import { fetchNotificacoes, marcarComoLida, marcarTodasLidas, limparTodasNotificacoes } from '@/services/notificacoes.service';
import { useAuth } from '@/hooks/useAuth';

interface UseNotificacoesResult {
  notificacoes: Notificacao[];
  naoLidas: number;
  loading: boolean;
  marcarLida: (id: string) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  limparTodas: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotificacoes(): UseNotificacoesResult {
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchNotificacoes(user.id);
      setNotificacoes(data);
    } catch (e) {
      console.warn('[useNotificacoes] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function marcarLida(id: string) {
    await marcarComoLida(id);
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  }

  async function marcarTodas() {
    if (!user?.id) return;
    await marcarTodasLidas(user.id);
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
  }

  async function limparTodas() {
    if (!user?.id) return;
    await limparTodasNotificacoes(user.id);
    setNotificacoes([]);
  }

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  return {
    notificacoes,
    naoLidas,
    loading,
    marcarLida,
    marcarTodasLidas: marcarTodas,
    limparTodas,
    refresh: load,
  };
}
