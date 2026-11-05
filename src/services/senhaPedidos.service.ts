/**
 * senhaPedidos.service.ts — pedir, decidir e ler pedidos de reset de senha.
 *
 * Quem pode o quê vive no banco (migration 20261105100000, `fn_senha_*`).
 * Aprovar não é RPC: passa por `/api/aprovar-pedido-senha`, que gera a senha e
 * a redefine no GoTrue com o service_role (o navegador nunca tem essa chave).
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { mensagemDoPedidoSenha, type PedidoSenha } from '@/lib/senhaPedidos';

interface Retorno { ok?: boolean; erro?: string; por?: string | null }
export interface Resultado { ok: boolean; erro?: string }

const MIGRATION_PENDENTE = 'Migration 20261105100000 pendente — aplique-a no Supabase para usar os pedidos de senha.';

async function chamar<T extends Retorno = Retorno>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcSemTipo<T>(nome, args);
  if (error) {
    if (/could not find the function|does not exist|schema cache/i.test(error.message)) throw new Error(MIGRATION_PENDENTE);
    throw new Error(error.message);
  }
  return (data ?? {}) as T;
}

async function resultado(nome: string, args: Record<string, unknown>): Promise<Resultado> {
  try {
    const r = await chamar(nome, args);
    return r.ok ? { ok: true } : { ok: false, erro: mensagemDoPedidoSenha(r) };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}

/** Super admin: todos. Os outros: só os seus. Migration pendente = lista vazia. */
export async function listarPedidosSenha(): Promise<PedidoSenha[]> {
  const { data, error } = await rpcSemTipo<PedidoSenha[]>('fn_senha_pedidos_listar', {});
  if (error) return [];
  return data ?? [];
}

/** Os pedidos abertos de quem eu alcanço: `alvo_id` → quem pediu. */
export async function pedidosSenhaAbertos(): Promise<Map<string, string>> {
  const { data, error } = await rpcSemTipo<Array<{ alvo_id: string | null; por: string | null }>>('fn_senha_pedidos_abertos', {});
  const m = new Map<string, string>();
  if (error) return m;
  for (const l of data ?? []) if (l.alvo_id) m.set(l.alvo_id, l.por ?? '');
  return m;
}

export const pedirResetSenha = (alvoId: string, motivo?: string | null) =>
  resultado('fn_senha_pedir', { p_alvo: alvoId, p_motivo: motivo?.trim() || null });

export const cancelarPedidoSenha = (pedidoId: string) =>
  resultado('fn_senha_pedido_cancelar', { p_pedido: pedidoId });

export const recusarPedidoSenha = (pedidoId: string, motivo?: string | null) =>
  resultado('fn_senha_pedido_recusar', { p_pedido: pedidoId, p_motivo: motivo?.trim() || null });

export interface ResultadoAprovar { ok: boolean; senha?: string; aviso?: string | null; erro?: string }

export async function aprovarPedidoSenha(pedidoId: string): Promise<ResultadoAprovar> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, erro: 'Sessão expirada. Faça login novamente.' };
  let resp: Response;
  try {
    resp = await fetch('/api/aprovar-pedido-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ pedidoId }),
    });
  } catch {
    return { ok: false, erro: 'Servidor indisponível. Verifique sua conexão.' };
  }
  if (resp.status === 404) return { ok: false, erro: 'Rota /api/aprovar-pedido-senha não encontrada. A rota não subiu no deploy.' };
  const corpo = (await resp.json().catch(() => ({}))) as { error?: string; senha?: string; aviso?: string | null };
  if (!resp.ok || !corpo.senha) return { ok: false, erro: corpo.error || `Falha ao aprovar (${resp.status}).` };
  return { ok: true, senha: corpo.senha, aviso: corpo.aviso ?? null };
}

/**
 * A pessoa trocou a senha (depois do `auth.updateUser` dar certo): desliga a
 * troca obrigatória e apaga a senha provisória dos pedidos.
 */
export async function concluirTrocaDeSenha(): Promise<void> {
  const { error } = await rpcSemTipo('fn_senha_troca_concluida', {});
  if (error) throw new Error(error.message);
}
