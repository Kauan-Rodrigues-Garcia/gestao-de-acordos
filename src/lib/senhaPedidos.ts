/**
 * senhaPedidos.ts — os pedidos de reset de senha, sem React e sem banco.
 *
 * Pedido do Cleber, 05/11/2026: a liderança pede o reset no diálogo de
 * Usuários, o super admin aprova no canal «Senhas» do chat, o servidor gera a
 * senha e ela aparece para quem pediu. As regras vivem no banco (migration
 * 20261105100000); aqui só o que a tela mostra.
 */

export type StatusSenhaPedido = 'pendente' | 'executando' | 'aprovado' | 'recusado' | 'cancelado' | 'expirado';

/** Quanto vale a senha provisória (20261110230000). O banco é quem manda; isto é só o texto. */
export const HORAS_SENHA_PROVISORIA = 2;

export interface PedidoSenha {
  id: string;
  empresa_id: string;
  solicitante_id: string | null;
  solicitante_nome: string;
  solicitante_cargo: string | null;
  solicitante_setor: string | null;
  solicitante_foto: string | null;
  alvo_id: string | null;
  alvo_nome: string;
  alvo_usuario: string | null;
  alvo_cargo: string | null;
  alvo_setor: string | null;
  alvo_foto: string | null;
  motivo: string | null;
  status: StatusSenhaPedido;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  motivo_recusa: string | null;
  erro: string | null;
  /** Só com o pedido aprovado, enquanto a pessoa não trocou e dentro do prazo (`expira_em`). */
  senha: string | null;
  trocada_em: string | null;
  /** Até quando a senha provisória vale (aprovação + 2 h). */
  expira_em?: string | null;
  /** Quando o pedido foi enviado ou reenviado — a ordem do canal. */
  movido_em?: string | null;
  criado_em: string;
}

export const ROTULO_STATUS_SENHA: Readonly<Record<StatusSenhaPedido, string>> = {
  pendente: 'Aguardando',
  executando: 'Resetando…',
  aprovado: 'Resetada',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

export const pedidoSenhaAberto = (p: Pick<PedidoSenha, 'status'>) => p.status === 'pendente' || p.status === 'executando';

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Alguém';
}

// ── A linha no chat ─────────────────────────────────────────────────────────

export interface ResumoSenhas {
  pendentes: number;
  previa: string;
  ultimaEm: string | null;
}

/** O último movimento do pedido: enviado, reenviado ou decidido. Ordena o canal. */
export function ultimaMovimentacao(p: Pick<PedidoSenha, 'decidido_em' | 'criado_em' | 'movido_em'>): string {
  let u = p.movido_em ?? p.criado_em;
  if (p.decidido_em && p.decidido_em > u) u = p.decidido_em;
  return u;
}

export function resumoDasSenhas(pedidos: readonly PedidoSenha[], souSuperAdmin: boolean): ResumoSenhas {
  const abertos = pedidos.filter(pedidoSenhaAberto).sort((a, b) => ultimaMovimentacao(b).localeCompare(ultimaMovimentacao(a)));
  let ultimaEm: string | null = null;
  for (const p of pedidos) {
    const u = ultimaMovimentacao(p);
    if (!ultimaEm || u > ultimaEm) ultimaEm = u;
  }

  if (abertos.length > 0) {
    const p = abertos[0];
    const mais = abertos.length > 1 ? ` · e mais ${abertos.length - 1}` : '';
    const previa = souSuperAdmin
      ? `${primeiroNome(p.solicitante_nome)} pede resetar a senha de ${p.alvo_nome}${mais}`
      : `Aguardando: senha de ${p.alvo_nome}${mais}`;
    return { pendentes: abertos.length, previa, ultimaEm };
  }

  const ultimo = [...pedidos].sort((a, b) => ultimaMovimentacao(b).localeCompare(ultimaMovimentacao(a)))[0];
  if (!ultimo) return { pendentes: 0, previa: 'Nenhum pedido por enquanto', ultimaEm };
  return { pendentes: 0, previa: `${ROTULO_STATUS_SENHA[ultimo.status]} · ${ultimo.alvo_nome}`, ultimaEm };
}

/** Pedidos decididos depois da última olhada no canal — acende o canal para quem pediu. */
export function senhasDecididasDesde(pedidos: readonly PedidoSenha[], vistoEm: string | null): number {
  return pedidos.filter(p => (p.status === 'aprovado' || p.status === 'recusado')
    && p.decidido_em && (!vistoEm || p.decidido_em > vistoEm)).length;
}

/** Pedidos abertos que chegaram desde a última olhada — o aviso de «pedido novo». */
export function senhasNovas(vistos: ReadonlySet<string>, pedidos: readonly PedidoSenha[], meuId: string | null): PedidoSenha[] {
  return pedidos.filter(p => pedidoSenhaAberto(p) && !vistos.has(p.id) && p.solicitante_id !== meuId);
}

// ── Erros do banco ──────────────────────────────────────────────────────────

const ERROS: Record<string, string> = {
  sem_permissao: 'Seu cargo não pode pedir reset de senha.',
  motivo_longo: 'O motivo passa de 300 caracteres.',
  alvo_inexistente: 'Pessoa não encontrada.',
  propria_senha: 'Para trocar a sua própria senha, use o botão de chave na barra do topo.',
  alvo_invalido: 'Não dá para pedir a senha desta conta (desligada, ou cargo de cúpula).',
  fora_do_seu_setor: 'Você só pede o reset de pessoas do seu setor.',
  ja_pedido: 'Já há um pedido aberto para esta pessoa',
  so_super_admin: 'Só o super admin decide pedidos de senha.',
  pedido_inexistente: 'Pedido não encontrado.',
  em_andamento: 'Outro super admin está aprovando este pedido agora.',
  ja_decidido: 'Este pedido já foi decidido',
};

export function mensagemDoPedidoSenha(r: { erro?: string | null; por?: string | null } | null | undefined): string {
  const codigo = String(r?.erro ?? '').trim();
  const base = ERROS[codigo] ?? (codigo ? `Não foi possível concluir (${codigo}).` : 'Não foi possível concluir.');
  if (r?.por) return `${base.replace(/\.$/, '')} (${r.por}).`;
  return /[.:]$/.test(base) ? base : `${base}.`;
}
