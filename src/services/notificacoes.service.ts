/**
 * src/services/notificacoes.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com notificações.
 */
import { supabase, Notificacao } from '@/lib/supabase';

/**
 * Busca as notificações do usuário, mais recentes primeiro.
 *
 * A contagem de não lidas do header é derivada desta lista. Teto de 100: o
 * sino mostra «99+» acima de 99, e desde 05/10/2026 só existem as notificações
 * do dia — o pg_cron apaga as de antes à 00:05 (migration 20261005190000).
 */
export async function fetchNotificacoes(userId: string, limite = 100): Promise<Notificacao[]> {
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

/**
 * Dos ids pedidos, só os que ainda são perfis DESTA empresa.
 *
 * A importação casa o login do relatório também com quem foi transferido para
 * outra empresa (`fn_operadores_transferidos`): o recebimento da origem
 * continua com a pessoa o mês inteiro. Atribuir está certo; avisar não. Sem
 * este filtro, cada relatório da PaguePlay virava «Analítico atualizado» no
 * sino de quem hoje trabalha na BookPlay — e o clique abria o analítico da
 * BookPlay, onde aquele recebimento não existe.
 *
 * O aviso nativo do celular já tinha a mesma trava (`fn_push_pode_receber`).
 */
export async function idsDaEmpresa(empresaId: string, ids: readonly string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)];
  const achados = new Set<string>();
  // Em blocos: a lista vai na URL do PostgREST.
  const BLOCO = 100;
  for (let i = 0; i < unicos.length; i += BLOCO) {
    const { data, error } = await supabase
      .from('perfis')
      .select('id')
      .eq('empresa_id', empresaId)
      .in('id', unicos.slice(i, i + BLOCO));
    if (error) {
      console.warn('[notificacoes.service] idsDaEmpresa error:', error.message);
      continue;
    }
    for (const p of data ?? []) achados.add(p.id as string);
  }
  return achados;
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
