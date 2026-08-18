/**
 * autorizacaoPedidos.service.ts — pedidos de autorização de NR/Código.
 *
 * Substitui o fluxo em que o líder ia até a máquina do operador digitar usuário
 * e senha (`autorizacao_lider.service.ts`). O operador pede, quem pode decidir
 * decide de onde estiver, e o servidor executa.
 *
 * ## Nada aqui decide nada
 *
 * As três operações são RPCs `SECURITY DEFINER`. Quem pode ver, quem pode
 * aprovar e o que a aprovação faz vive na migration `20260818180000` — este
 * arquivo só transporta. É o mesmo motivo de `fn_transferir_acordo_nr` existir:
 * `select`/`update` direto na tabela de outro operador falha em silêncio sob a
 * RLS, e uma regra de autorização escrita no navegador é uma regra que o
 * navegador pode reescrever.
 *
 * ## Aprovar EXECUTA
 *
 * Não libera um botão na tela do operador: ele já fechou a janela ao solicitar.
 * A RPC move o acordo anterior para a lixeira, transfere a titularidade do NR,
 * cria o acordo do solicitante e notifica os dois lados. Não há desfazer.
 */

import { supabase } from '@/lib/supabase';

export type ModoPedido = 'transferencia_completa' | 'troca_extra';
export type StatusPedido = 'pendente' | 'aprovado' | 'recusado' | 'cancelado' | 'falhou';

/** O que a gaveta mostra sem precisar abrir o acordo. */
export interface ResumoPedido {
  cliente?: string | null;
  valor?: number | null;
  vencimento?: string | null;
  parcelas?: number | null;
  tipo?: string | null;
  setorNome?: string | null;
}

export interface PedidoAutorizacao {
  id: string;
  empresa_id: string;
  solicitante_id: string;
  solicitante_nome: string;
  setor_id: string | null;
  modo: ModoPedido;
  nr_label: string;
  nr_valor: string;
  acordo_alvo_id: string | null;
  dono_id: string | null;
  dono_nome: string | null;
  extra_atual_id: string | null;
  extra_atual_op_id: string | null;
  extra_atual_op_nome: string | null;
  resumo: ResumoPedido;
  status: StatusPedido;
  decidido_por_id: string | null;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  motivo_recusa: string | null;
  erro: string | null;
  acordo_criado_id: string | null;
  criado_em: string;
  expira_em: string;
}

/**
 * Colunas lidas na listagem.
 *
 * `payload` fica de fora de propósito: é o acordo inteiro, pesa, e a gaveta não
 * precisa dele — `resumo` existe exatamente para isso. Quem executa o payload é
 * o servidor, que já o tem.
 */
const COLUNAS = `
  id, empresa_id, solicitante_id, solicitante_nome, setor_id, modo,
  nr_label, nr_valor, acordo_alvo_id, dono_id, dono_nome,
  extra_atual_id, extra_atual_op_id, extra_atual_op_nome,
  resumo, status, decidido_por_id, decidido_por_nome, decidido_em,
  motivo_recusa, erro, acordo_criado_id, criado_em, expira_em
`;

export interface EntradaSolicitacao {
  modo: ModoPedido;
  /** 'NR' ou 'Código' — o rótulo da empresa, só para exibir. */
  nrLabel: string;
  nrValor: string;
  /** O acordo a criar, montado pela tela exatamente como ela o inseriria. */
  payload: Record<string, unknown>;
  resumo: ResumoPedido;
  acordoAlvoId?: string | null;
  donoId?: string | null;
  donoNome?: string | null;
  extraAtualId?: string | null;
  extraAtualOpId?: string | null;
  extraAtualOpNome?: string | null;
}

export type ResultadoSolicitacao =
  | { ok: true; id: string; repetido: boolean }
  | { ok: false; erro: string };

/** Mensagens de erro do servidor traduzidas para o que a pessoa lê. */
const ERROS: Record<string, string> = {
  sem_sessao:          'Sessão expirada. Entre novamente.',
  perfil_inexistente:  'Perfil não encontrado nesta empresa.',
  modo_invalido:       'Tipo de pedido inválido.',
  nr_vazio:            'O NR/Código do pedido está vazio.',
  nao_autorizado:      'Você não tem permissão para decidir este pedido.',
  pedido_inexistente:  'Pedido não encontrado — pode ter sido cancelado.',
  ja_decidido:         'Este pedido já foi decidido por outra pessoa.',
  expirado:            'Este pedido expirou. O operador precisa solicitar de novo.',
  acordo_inexistente:  'O acordo original não existe mais.',
  empresa_negada:      'Este pedido é de outra empresa.',
  destinatario_invalido: 'O solicitante não pertence mais a esta empresa.',
  falha_transferencia: 'A transferência do acordo falhou. Nada foi alterado.',
};

export function mensagemDeErro(codigo: string | null | undefined): string {
  const c = String(codigo ?? '').trim();
  return ERROS[c] ?? (c ? `Não foi possível concluir (${c}).` : 'Não foi possível concluir.');
}

/** Cria o pedido e notifica quem pode decidir. */
export async function solicitarAutorizacao(
  e: EntradaSolicitacao,
): Promise<ResultadoSolicitacao> {
  const { data, error } = await supabase.rpc('fn_autorizacao_solicitar', {
    p_modo: e.modo,
    p_nr_label: e.nrLabel,
    p_nr_valor: e.nrValor,
    p_payload: e.payload as never,
    p_resumo: e.resumo as never,
    p_acordo_alvo_id: e.acordoAlvoId ?? null,
    p_dono_id: e.donoId ?? null,
    p_dono_nome: e.donoNome ?? null,
    p_extra_atual_id: e.extraAtualId ?? null,
    p_extra_atual_op_id: e.extraAtualOpId ?? null,
    p_extra_atual_op_nome: e.extraAtualOpNome ?? null,
  });
  if (error) return { ok: false, erro: error.message };
  const r = data as { ok?: boolean; id?: string; erro?: string; repetido?: boolean } | null;
  if (!r?.ok) return { ok: false, erro: mensagemDeErro(r?.erro) };
  return { ok: true, id: String(r.id), repetido: r.repetido === true };
}

export type ResultadoDecisao =
  | { ok: true; status: 'aprovado' | 'recusado'; acordoId?: string | null }
  | { ok: false; erro: string };

/**
 * Aprova ou recusa. Aprovar é irreversível — ver o cabeçalho.
 *
 * Dois líderes clicando ao mesmo tempo é o caso normal, não o raro: a
 * notificação chega para todos juntos. O servidor trava a linha e o segundo
 * recebe `ja_decidido` com o nome de quem chegou antes, em vez de executar a
 * transferência sobre um acordo que o primeiro já apagou.
 */
export async function decidirAutorizacao(params: {
  id: string;
  aprovar: boolean;
  motivo?: string | null;
}): Promise<ResultadoDecisao> {
  const { data, error } = await supabase.rpc('fn_autorizacao_decidir', {
    p_id: params.id,
    p_aprovar: params.aprovar,
    p_motivo: params.motivo ?? null,
  });
  if (error) return { ok: false, erro: error.message };
  const r = data as {
    ok?: boolean; status?: string; erro?: string; por?: string; acordo_id?: string;
  } | null;
  if (!r?.ok) {
    const base = mensagemDeErro(r?.erro);
    return { ok: false, erro: r?.por ? `${base} (por ${r.por})` : base };
  }
  return {
    ok: true,
    status: r.status === 'recusado' ? 'recusado' : 'aprovado',
    acordoId: r.acordo_id ?? null,
  };
}

/** O solicitante desiste. Só funciona enquanto ninguém decidiu. */
export async function cancelarAutorizacao(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_autorizacao_cancelar', { p_id: id });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
}

/**
 * Os pedidos que quem está logado pode ver.
 *
 * Não filtra por cargo: a policy de `autorizacoes_pedidos` já devolve os
 * pendentes que a pessoa pode decidir mais os que ela mesma criou. Repetir o
 * filtro aqui seria a terceira cópia da regra — e a que fica desatualizada.
 *
 * Erro vira lista vazia: a gaveta é um acessório de todas as telas, e derrubar
 * a navegação porque a consulta dela falhou seria trocar um recurso por um
 * defeito de produto.
 */
export async function listarPedidos(params: {
  /** Quantos dias de histórico decidido trazer junto. 0 = só pendentes. */
  diasHistorico?: number;
  limite?: number;
} = {}): Promise<PedidoAutorizacao[]> {
  const { diasHistorico = 2, limite = 50 } = params;
  try {
    const desde = new Date(Date.now() - diasHistorico * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('autorizacoes_pedidos')
      .select(COLUNAS)
      // Pendente sempre entra, independente da idade; decidido só o recente —
      // a gaveta mostra "foi autorizado por fulano", que é a memória curta que
      // impede duas pessoas de perguntarem a mesma coisa.
      .or(`status.eq.pendente,criado_em.gte.${desde}`)
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error) {
      console.warn('[autorizacaoPedidos] listar:', error.message);
      return [];
    }
    return (data ?? []) as unknown as PedidoAutorizacao[];
  } catch (e) {
    console.warn('[autorizacaoPedidos] listar:', e instanceof Error ? e.message : e);
    return [];
  }
}
