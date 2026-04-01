/**
 * src/services/notificacoes.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com notificações.
 */
import { supabase, Notificacao } from '@/lib/supabase';

/** Busca notificações do usuário (ordenadas por data, não lidas primeiro) */
export async function fetchNotificacoes(userId: string): Promise<Notificacao[]> {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('usuario_id', userId)
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[notificacoes.service] fetchNotificacoes error:', error.message);
    return [];
  }
  return (data as Notificacao[]) || [];
}

/** Marca uma notificação como lida */
export async function marcarComoLida(id: string): Promise<void> {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('id', id);

  if (error) {
    console.warn('[notificacoes.service] marcarComoLida error:', error.message);
    return;
  }
}

/** Marca todas as notificações do usuário como lidas */
export async function marcarTodasLidas(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('usuario_id', userId)
    .eq('lida', false);

  if (error) {
    console.warn('[notificacoes.service] marcarTodasLidas error:', error.message);
    return;
  }
}

/** Cria uma nova notificação */
export async function criarNotificacao(params: {
  usuario_id: string;
  titulo: string;
  mensagem: string;
  empresa_id?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('notificacoes')
    .insert(params);

  if (error) {
    console.warn('[notificacoes.service] criarNotificacao error:', error.message);
    return;
  }
}
