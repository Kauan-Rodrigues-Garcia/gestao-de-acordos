/**
 * transferenciaPedidos.service.ts — pedir, decidir e ler pedidos de transferência.
 *
 * Quem pode pedir, o que pode pedir e quem vê o quê vive no banco (migration
 * 20261103150000, funções `fn_transferencia_*`). Aqui só o transporte — com
 * uma exceção: APROVAR roda a transferência de verdade, e ela continua sendo
 * a da tela (`executarTransferencia`), no navegador do super admin. Relatório
 * antes de apagar, fantasma, troca de empresa, registro e desfazer vêm de lá,
 * sem segunda implementação.
 *
 * ## Aprovar, uma pessoa de cada vez
 *
 *   1. RESERVAR o item no banco. Outro super admin aprovando o mesmo pedido
 *      recebe `em_andamento`; pessoa que mudou de setor desde o pedido vira
 *      «sem efeito» ali mesmo;
 *   2. transferir (`executarTransferencia`);
 *   3. CONCLUIR o item (o banco confere que a pessoa está no destino) — ou
 *      devolvê-lo a pendente com o erro.
 *
 * A falha de uma pessoa não leva as outras: cada uma tem o próprio resultado.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import {
  mensagemDoPedido, type DirecaoPedido, type PedidoTransferencia, type PessoaDoSetor,
  type SetorDaTransferencia,
} from '@/lib/transferenciaPedidos';

interface Retorno { ok?: boolean; erro?: string; nomes?: unknown; por?: string }

async function chamar<T extends Retorno = Retorno>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcSemTipo<T>(nome, args);
  if (error) {
    if (/could not find the function|does not exist|schema cache/i.test(error.message)) {
      throw new Error('Migration 20261103150000 pendente — aplique-a no Supabase para usar os pedidos de transferência.');
    }
    throw new Error(error.message);
  }
  return (data ?? {}) as T;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listarSetoresParaTransferencia(): Promise<SetorDaTransferencia[]> {
  const { data, error } = await rpcSemTipo<SetorDaTransferencia[]>('fn_transferencia_setores', {});
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listarPessoasDoSetor(setorId: string): Promise<PessoaDoSetor[]> {
  const { data, error } = await rpcSemTipo<PessoaDoSetor[]>('fn_transferencia_pessoas_do_setor', { p_setor_id: setorId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(p => ({ ...p, em_pedido: p.em_pedido === true }));
}

/**
 * Super admin: todos os pedidos. Os outros: só os seus. Quem recorta é o banco.
 * Migration pendente = lista vazia, para o chat não quebrar no intervalo entre
 * o deploy e a aplicação.
 */
export async function listarPedidos(): Promise<PedidoTransferencia[]> {
  const { data, error } = await rpcSemTipo<PedidoTransferencia[]>('fn_transferencia_pedidos_listar', {});
  if (error) return [];
  return data ?? [];
}

// ── Pedir e cancelar ─────────────────────────────────────────────────────────

export interface EntradaPedido {
  direcao: DirecaoPedido;
  origemSetorId: string;
  destinoSetorId: string;
  pessoas: string[];
  levarAcordos: boolean;
  motivo?: string | null;
}

export type ResultadoPedido = { ok: true; id: string; pessoas: number } | { ok: false; erro: string };

export async function pedirTransferencia(e: EntradaPedido): Promise<ResultadoPedido> {
  try {
    const r = await chamar<Retorno & { id?: string; pessoas?: number }>('fn_transferencia_pedir', {
      p_direcao: e.direcao,
      p_origem: e.origemSetorId,
      p_destino: e.destinoSetorId,
      p_pessoas: e.pessoas,
      p_levar: e.levarAcordos,
      p_motivo: e.motivo?.trim() || null,
    });
    if (!r.ok) return { ok: false, erro: mensagemDoPedido(r) };
    return { ok: true, id: String(r.id), pessoas: Number(r.pessoas) || e.pessoas.length };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelarPedido(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await chamar<Retorno>('fn_transferencia_pedido_cancelar', { p_pedido: pedidoId });
    return r.ok ? { ok: true } : { ok: false, erro: mensagemDoPedido(r) };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}

// ── Decidir (só super admin) ─────────────────────────────────────────────────

export async function recusarItens(itemIds: string[], motivo?: string | null): Promise<{ ok: boolean; erro?: string }> {
  if (itemIds.length === 0) return { ok: true };
  try {
    const r = await chamar<Retorno>('fn_transferencia_itens_recusar', { p_itens: itemIds, p_motivo: motivo?.trim() || null });
    return r.ok ? { ok: true } : { ok: false, erro: mensagemDoPedido(r) };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}

export interface ResultadoItem {
  itemId: string;
  nome: string;
  ok: boolean;
  mensagem: string | null;
  acordosApagados: number;
  acordosMovidos: number;
  relatorio: string | null;
  /** A transferência valeu, mas algo à volta dela não (registro, liderança). */
  aviso: string | null;
}

interface Reserva extends Retorno {
  perfil_id?: string; nome?: string; usuario?: string | null;
  origem_empresa_id?: string; origem_setor_id?: string | null; origem_equipe_id?: string | null;
  destino_empresa_id?: string; destino_setor_id?: string;
}

/**
 * Aprova os itens escolhidos de um pedido, um de cada vez.
 *
 * `levarAcordos` só vale dentro da mesma empresa E da mesma regra de negócio:
 * regra diferente é carteira diferente, e tabulação de Nosso produto não vira
 * tabulação Cofen. Quem decide isso é `podeLevarAcordos`.
 */
export async function aprovarItens(params: {
  pedido: PedidoTransferencia;
  itemIds: string[];
  levarAcordos: boolean;
  executadoPorId: string | null;
  onProgresso?: (feitos: number, total: number) => void;
}): Promise<ResultadoItem[]> {
  const { pedido, itemIds, executadoPorId } = params;
  const levar = params.levarAcordos && podeLevarAcordos(pedido);
  const resultados: ResultadoItem[] = [];
  // Sob demanda: a lista do chat (sempre montada) usa este arquivo e não
  // precisa carregar a transferência inteira para ler pedidos.
  const { executarTransferencia } = await import('./transferenciaUsuario.service');

  for (const [n, itemId] of itemIds.entries()) {
    const item = pedido.itens.find(i => i.id === itemId);
    const nome = item?.perfil_nome ?? 'Pessoa';
    params.onProgresso?.(n, itemIds.length);
    const falha = (mensagem: string): ResultadoItem => ({
      itemId, nome, ok: false, mensagem, acordosApagados: 0, acordosMovidos: 0, relatorio: null, aviso: null,
    });

    let reserva: Reserva;
    try {
      reserva = await chamar<Reserva>('fn_transferencia_item_reservar', { p_item: itemId });
    } catch (err) {
      resultados.push(falha(err instanceof Error ? err.message : String(err)));
      continue;
    }
    if (!reserva.ok || !reserva.perfil_id || !reserva.destino_setor_id || !reserva.origem_empresa_id || !reserva.destino_empresa_id) {
      resultados.push(falha(mensagemDoPedido(reserva)));
      continue;
    }

    const mesmaEmpresa = reserva.origem_empresa_id === reserva.destino_empresa_id;
    const r = await executarTransferencia({
      alvo: {
        perfilId: reserva.perfil_id,
        nome: reserva.nome ?? nome,
        usuario: reserva.usuario ?? null,
        origemEmpresaId: reserva.origem_empresa_id,
        origemSetorId: reserva.origem_setor_id ?? null,
        origemEquipeId: reserva.origem_equipe_id ?? null,
        destinoEmpresaId: reserva.destino_empresa_id,
        destinoSetorId: reserva.destino_setor_id,
      },
      levarAcordos: levar && mesmaEmpresa,
      executadoPorId,
    });

    if (r.status === 'falha') {
      await chamar('fn_transferencia_item_falhou', { p_item: itemId, p_erro: r.mensagem }).catch((): void => undefined);
      resultados.push(falha(r.mensagem));
      continue;
    }

    let aviso = r.avisoRegistro;
    try {
      const fim = await chamar<Retorno>('fn_transferencia_item_concluir', {
        p_item: itemId, p_transferencia_id: r.transferenciaId, p_levou: levar && mesmaEmpresa,
      });
      if (!fim.ok) aviso = [aviso, `Transferida, mas o pedido não registrou: ${mensagemDoPedido(fim)}`].filter(Boolean).join(' ');
    } catch (err) {
      aviso = [aviso, `Transferida, mas o pedido não registrou: ${err instanceof Error ? err.message : String(err)}`]
        .filter(Boolean).join(' ');
    }
    if (r.liderancasRemovidas.length) {
      const equipes = r.liderancasRemovidas.join(', ');
      aviso = [aviso, `Deixou de liderar: ${equipes}.`].filter(Boolean).join(' ');
    }

    resultados.push({
      itemId, nome, ok: true, mensagem: null,
      acordosApagados: r.acordosApagados, acordosMovidos: r.acordosMovidos, relatorio: r.relatorio, aviso,
    });
  }
  params.onProgresso?.(itemIds.length, itemIds.length);
  return resultados;
}

/** Dá para levar as tabulações? Só na mesma empresa e na mesma regra de negócio. */
export function podeLevarAcordos(p: Pick<PedidoTransferencia, 'origem' | 'destino'>): boolean {
  if (!p.origem || !p.destino) return false;
  if (p.origem.empresa_id !== p.destino.empresa_id) return false;
  return (p.origem.regra ?? 'nosso_produto') === (p.destino.regra ?? 'nosso_produto');
}
