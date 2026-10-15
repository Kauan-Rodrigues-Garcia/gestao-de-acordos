/**
 * resumoChat.ts — a linha «Autorizações» na lista do chat.
 *
 * Pedido do Cleber, 15/10/2026: as autorizações viram uma conversa fixa do
 * chat, uma por setor. Ela não se apaga, sobe para o topo enquanto houver
 * pedido esperando — com o aviso aceso até alguém decidir, mesmo depois de
 * vista — e, sem pendência, fica na lista pela hora da última movimentação,
 * como qualquer conversa.
 *
 * Puro, sem React: tem teste.
 */
import type { PedidoAutorizacao } from '@/services/autorizacaoPedidos.service';

/** Cargos que veem a empresa inteira (espelha `fn_pode_autorizar_pedido`). */
const VISAO_EMPRESA = new Set(['diretoria', 'administrador', 'super_admin']);

export function tituloDasAutorizacoes(cargo: string | null | undefined, nomeSetor: string | null): string {
  if (cargo && VISAO_EMPRESA.has(cargo)) return 'Autorizações · todos os setores';
  return nomeSetor ? `Autorizações · ${nomeSetor}` : 'Autorizações';
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Alguém';
}

/** Pendente de verdade: status pendente E ainda dentro do prazo. */
export function estaPendente(p: PedidoAutorizacao, agora = Date.now()): boolean {
  return p.status === 'pendente' && new Date(p.expira_em).getTime() > agora;
}

export interface ResumoAutorizacoes {
  pendentes: number;
  /** A segunda linha da conversa na lista. */
  previa: string;
  /** Última movimentação (pedido ou decisão) — ordena a linha sem pendência. */
  ultimaEm: string | null;
}

export function resumoDasAutorizacoes(pedidos: PedidoAutorizacao[], agora = Date.now()): ResumoAutorizacoes {
  const pendentes = pedidos
    .filter((p) => estaPendente(p, agora))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));

  let ultimaEm: string | null = null;
  for (const p of pedidos) {
    for (const t of [p.criado_em, p.decidido_em]) {
      if (t && (!ultimaEm || t > ultimaEm)) ultimaEm = t;
    }
  }

  if (pendentes.length > 0) {
    const p = pendentes[0];
    const mais = pendentes.length > 1 ? ` · e mais ${pendentes.length - 1}` : '';
    const acao = p.modo === 'tornar_direto' ? 'quer tornar DIRETO' : 'pede autorização';
    return { pendentes: pendentes.length, previa: `${primeiroNome(p.solicitante_nome)} ${acao} · ${p.nr_label} ${p.nr_valor}${mais}`, ultimaEm };
  }

  const decididos = pedidos
    .filter((p) => p.status !== 'pendente')
    .sort((a, b) => (b.decidido_em ?? b.criado_em).localeCompare(a.decidido_em ?? a.criado_em));
  const u = decididos[0];
  if (!u) return { pendentes: 0, previa: 'Nenhum pedido por enquanto', ultimaEm };

  const quem = u.decidido_por_nome ? ` por ${primeiroNome(u.decidido_por_nome)}` : '';
  const como =
    u.status === 'aprovado' ? `Aprovado${quem}`
    : u.status === 'recusado' ? `Recusado${quem}`
    : u.status === 'falhou' ? 'Falhou'
    : 'Cancelado';
  return { pendentes: 0, previa: `${como} · ${u.nr_label} ${u.nr_valor}`, ultimaEm };
}

/**
 * Em que posição da lista a linha entra.
 *
 * Com pendência: a primeira, acima até das fixadas — tem gente parada
 * esperando. Sem pendência: depois das fixadas, pela hora da última
 * movimentação, como as outras conversas.
 */
export function posicaoDasAutorizacoes(
  conversas: readonly { fixada: boolean; ultima_mensagem_em: string | null }[],
  resumo: Pick<ResumoAutorizacoes, 'pendentes' | 'ultimaEm'>,
): number {
  if (resumo.pendentes > 0) return 0;
  const minha = resumo.ultimaEm ? Date.parse(resumo.ultimaEm) : NaN;
  if (!Number.isFinite(minha)) return conversas.length;
  const i = conversas.findIndex((c) => {
    if (c.fixada) return false;
    const dela = c.ultima_mensagem_em ? Date.parse(c.ultima_mensagem_em) : 0;
    return !(dela >= minha);
  });
  return i < 0 ? conversas.length : i;
}

/**
 * Pedidos pendentes que chegaram desde a última olhada — o aviso de «pedido
 * novo». O meu próprio pedido não avisa a mim.
 */
export function pedidosQueChegaram(
  vistos: ReadonlySet<string>,
  pedidos: PedidoAutorizacao[],
  meuId: string | null,
  agora = Date.now(),
): PedidoAutorizacao[] {
  return pedidos.filter((p) => estaPendente(p, agora) && !vistos.has(p.id) && p.solicitante_id !== meuId);
}
