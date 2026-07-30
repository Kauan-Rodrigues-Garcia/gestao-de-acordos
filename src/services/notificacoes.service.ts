/**
 * src/services/notificacoes.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com notificações.
 */
import { supabase, Notificacao } from '@/lib/supabase';

/**
 * Busca as notificações do usuário, mais recentes primeiro.
 *
 * O limite de 200 é o mesmo que o painel usava quando lia a tabela direto; a
 * contagem de não lidas do header é derivada desta lista.
 */
export async function fetchNotificacoes(userId: string, limite = 200): Promise<Notificacao[]> {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('usuario_id', userId)
    .order('criado_em', { ascending: false })
    .limit(limite);

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

/** Remove UMA notificação. `false` se o banco recusou. */
export async function excluirNotificacao(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('notificacoes')
    .delete()
    .eq('id', id);
  if (error) {
    console.warn('[notificacoes.service] excluirNotificacao error:', error.message);
    return false;
  }
  return true;
}

/**
 * Remove todas as notificações do usuário. `false` se o banco recusou — quem
 * chama precisa saber para não deixar a tela mostrando uma lista vazia que na
 * verdade não foi apagada.
 */
export async function limparTodasNotificacoes(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notificacoes')
    .delete()
    .eq('usuario_id', userId);
  if (error) {
    console.warn('[notificacoes.service] limparTodasNotificacoes error:', error.message);
    return false;
  }
  return true;
}

/** Cria uma nova notificação */
export async function criarNotificacao(params: {
  usuario_id: string;
  titulo: string;
  mensagem: string;
  empresa_id?: string;
  acordo_id?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('notificacoes')
    .insert(params);

  if (error) {
    console.warn('[notificacoes.service] criarNotificacao error:', error.message);
    return;
  }
}
