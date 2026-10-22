/**
 * cantina.service.ts — o banco da Cantina (migration 20261022153000).
 *
 *   fn_cantina_cardapio         — itens ativos, configuração e a hora do servidor.
 *   fn_cantina_fazer_pedido     — confere janela, faixa e preço; devolve o pedido.
 *   fn_cantina_meus_pedidos     — os pedidos de quem pergunta (30 dias).
 *   fn_cantina_cancelar         — quem pediu (no prazo) ou a cantina (com motivo).
 *   fn_cantina_fila             — a fila do dia, só para `cantina_painel`.
 *   fn_cantina_mudar_status     — preparar, pronto, retirado, não retirado.
 *   fn_cantina_relatorio_mes    — o mês para o desconto em folha.
 *   fn_cantina_mensagens / _enviar_mensagem / _marcar_lido — a conversa do pedido.
 *
 * `lado` diz de que lado quem chama está falando: a mesma pessoa pode pedir e
 * atender (o super_admin testando), e o banco confere cada um.
 *
 * As tabelas não têm acesso direto, e as funções ainda não estão nos tipos
 * gerados: daí `rpcSemTipo`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { Cardapio, MensagemCantina, PedidoCantina, StatusPedido } from '@/lib/cantina';

export type LadoCantina = 'cliente' | 'cantina';

export interface LinhaParaPedir {
  item_id: string;
  quantidade: number;
  opcao: string | null;
  observacao: string | null;
}

export interface LinhaRelatorio {
  dia: string;
  numero: number;
  nome: string;
  empresa_nome: string | null;
  setor_nome: string | null;
  retirada_em: string;
  status: StatusPedido;
  total: number;
  itens: string;
}

async function chamar<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcSemTipo<T>(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

const comNumeros = (p: PedidoCantina): PedidoCantina => ({
  ...p,
  total: Number(p.total),
  nao_lidas: Number(p.nao_lidas ?? 0),
  itens: (p.itens ?? []).map(i => ({ ...i, preco: Number(i.preco) })),
});

export async function buscarCardapio(): Promise<Cardapio> {
  const c = await chamar<Cardapio>('fn_cantina_cardapio');
  return { ...c, itens: c.itens.map(i => ({ ...i, preco: Number(i.preco) })) };
}

export async function fazerPedido(itens: LinhaParaPedir[], hora: string, observacao: string | null): Promise<PedidoCantina> {
  return comNumeros(await chamar<PedidoCantina>('fn_cantina_fazer_pedido', {
    p_itens: itens, p_hora: hora, p_observacao: observacao,
  }));
}

export async function meusPedidos(): Promise<PedidoCantina[]> {
  return (await chamar<PedidoCantina[]>('fn_cantina_meus_pedidos') ?? []).map(comNumeros);
}

export async function cancelarPedido(id: string, lado: LadoCantina, motivo?: string): Promise<PedidoCantina> {
  return comNumeros(await chamar<PedidoCantina>('fn_cantina_cancelar', {
    p_pedido: id, p_lado: lado, p_motivo: motivo ?? null,
  }));
}

export async function filaDoDia(): Promise<{ agora: string; dia: string; pedidos: PedidoCantina[] }> {
  const f = await chamar<{ agora: string; dia: string; pedidos: PedidoCantina[] }>('fn_cantina_fila');
  return { ...f, pedidos: (f.pedidos ?? []).map(comNumeros) };
}

export async function mudarStatus(id: string, status: StatusPedido): Promise<PedidoCantina> {
  return comNumeros(await chamar<PedidoCantina>('fn_cantina_mudar_status', { p_pedido: id, p_status: status }));
}

export async function relatorioDoMes(mes: string): Promise<LinhaRelatorio[]> {
  return (await chamar<LinhaRelatorio[]>('fn_cantina_relatorio_mes', { p_mes: `${mes.slice(0, 7)}-01` }) ?? [])
    .map(l => ({ ...l, total: Number(l.total) }));
}

export async function mensagensDoPedido(id: string, lado: LadoCantina): Promise<MensagemCantina[]> {
  return await chamar<MensagemCantina[]>('fn_cantina_mensagens', { p_pedido: id, p_lado: lado }) ?? [];
}

export async function enviarMensagem(id: string, lado: LadoCantina, texto: string): Promise<void> {
  await chamar<null>('fn_cantina_enviar_mensagem', { p_pedido: id, p_lado: lado, p_texto: texto });
}

export async function marcarLido(id: string, lado: LadoCantina): Promise<void> {
  await chamar<null>('fn_cantina_marcar_lido', { p_pedido: id, p_lado: lado });
}
