/**
 * useNotificacoesCount.ts
 * Hook leve para expor a contagem de notificações não lidas no header.
 * Compartilha a lógica de contagem sem duplicar o canal Realtime do ChatNotificacoes.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export function useNotificacoesCount() {
  const { user } = useAuth();
  const [naoLidas, setNaoLidas] = useState(0);
  const [animarBadge, setAnimarBadge] = useState(false);

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from('notificacoes')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', user.id)
      .eq('lida', false);
    setNaoLidas(count ?? 0);
  }, [user?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-count-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${user.id}` },
        () => {
          carregar();
          setAnimarBadge(true);
          setTimeout(() => setAnimarBadge(false), 800);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, carregar]);

  return { naoLidas, animarBadge };
}
