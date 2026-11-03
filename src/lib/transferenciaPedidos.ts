/**
 * transferenciaPedidos.ts — os pedidos de transferência, sem React e sem banco.
 *
 * Pedido do Cleber, 03/11/2026: quem não é super admin PEDE a transferência
 * (tirar gente do próprio setor ou trazer gente de outro), e o super admin
 * aprova uma parte e recusa o resto. Os pedidos moram no canal
 * «Transferências» do chat. As regras de quem pode o quê vivem no banco
 * (migration 20261103150000); aqui só o que a tela mostra.
 */
import { marcaDaCidade } from '@/lib/marca';
import { ehRegraDoSetor, type RegraDoSetor } from '@/lib/regraDoSetor';

export type DirecaoPedido = 'tirar' | 'trazer';
export type StatusPedido = 'pendente' | 'concluido' | 'cancelado';
export type StatusItem = 'pendente' | 'executando' | 'transferida' | 'recusada' | 'cancelada' | 'sem_efeito';

/** Um setor como o banco devolve para a transferência. */
export interface SetorDaTransferencia {
  id: string;
  nome: string;
  empresa_id: string | null;
  cidade: string | null;
  regra: string | null;
  /** É um setor de quem pergunta (`fn_transferencia_meus_setores`). */
  meu?: boolean;
}

export interface PessoaDoSetor {
  id: string;
  nome: string;
  cargo: string | null;
  /** Já está em outro pedido aberto: não dá para pedir de novo. */
  em_pedido: boolean;
}

/** O cadastro de HOJE da pessoa. Só vem para o super admin. */
export interface CadastroAtual {
  usuario: string | null;
  empresa_id: string;
  setor_id: string | null;
  equipe_id: string | null;
  cargo: string | null;
  apto: boolean;
}

export interface ItemPedido {
  id: string;
  perfil_id: string | null;
  perfil_nome: string;
  perfil_cargo: string | null;
  status: StatusItem;
  reservado_em: string | null;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  motivo_recusa: string | null;
  erro: string | null;
  levou_acordos: boolean | null;
  atual: CadastroAtual | null;
}

export interface PedidoTransferencia {
  id: string;
  empresa_id: string;
  solicitante_id: string | null;
  solicitante_nome: string;
  solicitante_cargo: string | null;
  solicitante_setor: string | null;
  solicitante_foto: string | null;
  direcao: DirecaoPedido;
  origem: SetorDaTransferencia | null;
  destino: SetorDaTransferencia | null;
  levar_acordos: boolean;
  motivo: string | null;
  status: StatusPedido;
  criado_em: string;
  concluido_em: string | null;
  itens: ItemPedido[];
}

// ── Etiquetas do setor ──────────────────────────────────────────────────────

export interface EtiquetasDoSetor {
  /** Pela cidade: Birigui é BookPlay, Marília é PaguePlay (`lib/marca.ts`). */
  marca: 'BookPlay' | 'PaguePlay' | null;
  /** Pela regra do setor (`lib/regraDoSetor.ts`). */
  regra: RegraDoSetor | null;
}

export function etiquetasDoSetor(s: Pick<SetorDaTransferencia, 'cidade' | 'regra'> | null | undefined): EtiquetasDoSetor {
  return {
    marca: marcaDaCidade(s?.cidade)?.nome ?? null,
    regra: s && ehRegraDoSetor(s.regra) ? s.regra : null,
  };
}

/** Os setores agrupados pela marca, para a lista de escolha. Sem marca vai por último. */
export function setoresPorMarca<S extends Pick<SetorDaTransferencia, 'cidade' | 'nome'>>(
  setores: readonly S[],
): { marca: 'BookPlay' | 'PaguePlay' | null; setores: S[] }[] {
  const grupos = new Map<'BookPlay' | 'PaguePlay' | null, S[]>([['BookPlay', []], ['PaguePlay', []], [null, []]]);
  for (const s of setores) grupos.get(marcaDaCidade(s.cidade)?.nome ?? null)!.push(s);
  return [...grupos.entries()]
    .filter(([, lista]) => lista.length > 0)
    .map(([marca, lista]) => ({ marca, setores: [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }));
}

// ── Estado do pedido ────────────────────────────────────────────────────────

export const ROTULO_ITEM: Readonly<Record<StatusItem, string>> = {
  pendente: 'Aguardando',
  executando: 'Transferindo…',
  transferida: 'Transferida',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  sem_efeito: 'Sem efeito',
};

export const itemAberto = (i: Pick<ItemPedido, 'status'>) => i.status === 'pendente' || i.status === 'executando';

export function itensAbertos(p: PedidoTransferencia): ItemPedido[] {
  return p.itens.filter(itemAberto);
}

export const pedidoAberto = (p: PedidoTransferencia) => p.status === 'pendente' && p.itens.some(itemAberto);

/** «tirar 3 pessoas do Play 2 para o Play 3». */
export function fraseDoPedido(p: Pick<PedidoTransferencia, 'origem' | 'destino' | 'itens'>): string {
  const n = p.itens.length;
  const quem = n === 1 ? p.itens[0]?.perfil_nome ?? '1 pessoa' : `${n} pessoas`;
  return `${quem} do ${p.origem?.nome ?? 'setor de origem'} para o ${p.destino?.nome ?? 'setor de destino'}`;
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Alguém';
}

// ── A linha no chat ─────────────────────────────────────────────────────────

export interface ResumoTransferencias {
  /** Pedidos com alguém esperando decisão. */
  pendentes: number;
  previa: string;
  /** Última movimentação — ordena a linha quando não há pendência. */
  ultimaEm: string | null;
}

function ultimaMovimentacao(p: PedidoTransferencia): string {
  let u = p.concluido_em && p.concluido_em > p.criado_em ? p.concluido_em : p.criado_em;
  for (const i of p.itens) if (i.decidido_em && i.decidido_em > u) u = i.decidido_em;
  return u;
}

export function resumoDasTransferencias(pedidos: readonly PedidoTransferencia[], souSuperAdmin: boolean): ResumoTransferencias {
  const abertos = pedidos.filter(pedidoAberto).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  let ultimaEm: string | null = null;
  for (const p of pedidos) {
    const u = ultimaMovimentacao(p);
    if (!ultimaEm || u > ultimaEm) ultimaEm = u;
  }

  if (abertos.length > 0) {
    const p = abertos[0];
    const mais = abertos.length > 1 ? ` · e mais ${abertos.length - 1}` : '';
    const previa = souSuperAdmin
      ? `${primeiroNome(p.solicitante_nome)} pede ${fraseDoPedido(p)}${mais}`
      : `Aguardando: ${fraseDoPedido(p)}${mais}`;
    return { pendentes: abertos.length, previa, ultimaEm };
  }

  const ultimo = [...pedidos].sort((a, b) => ultimaMovimentacao(b).localeCompare(ultimaMovimentacao(a)))[0];
  if (!ultimo) return { pendentes: 0, previa: 'Nenhum pedido por enquanto', ultimaEm };
  const feitas = ultimo.itens.filter(i => i.status === 'transferida').length;
  const recusas = ultimo.itens.filter(i => i.status === 'recusada').length;
  const partes = [
    feitas ? `${feitas} ${feitas === 1 ? 'transferida' : 'transferidas'}` : '',
    recusas ? `${recusas} ${recusas === 1 ? 'recusada' : 'recusadas'}` : '',
  ].filter(Boolean);
  const como = ultimo.status === 'cancelado' ? 'Cancelado' : partes.join(' · ') || 'Concluído';
  return { pendentes: 0, previa: `${como} · ${ultimo.destino?.nome ?? ''}`.replace(/ · $/, ''), ultimaEm };
}

/**
 * Pedidos decididos depois da última vez que a pessoa olhou o canal. É o que
 * acende o canal para quem pediu (ele não fica no topo, só avisa).
 */
export function decididosDesde(pedidos: readonly PedidoTransferencia[], vistoEm: string | null): number {
  return pedidos.filter(p => p.status !== 'pendente' && p.concluido_em && (!vistoEm || p.concluido_em > vistoEm)
    && p.itens.some(i => i.status === 'transferida' || i.status === 'recusada')).length;
}

/** Pedidos abertos que chegaram desde a última olhada — o aviso de «pedido novo». */
export function pedidosNovos(vistos: ReadonlySet<string>, pedidos: readonly PedidoTransferencia[], meuId: string | null): PedidoTransferencia[] {
  return pedidos.filter(p => pedidoAberto(p) && !vistos.has(p.id) && p.solicitante_id !== meuId);
}

// ── Erros do banco ──────────────────────────────────────────────────────────

const ERROS: Record<string, string> = {
  sem_permissao: 'Seu cargo não pode pedir transferência.',
  direcao_invalida: 'Tipo de pedido inválido.',
  motivo_longo: 'O motivo passa de 500 caracteres.',
  setor_invalido: 'Setor inválido ou inativo. O Núcleo só pela transferência do super admin.',
  mesmo_setor: 'Origem e destino são o mesmo setor.',
  setor_nao_e_seu: 'Você só pede para tirar gente do seu setor, ou trazer gente para ele.',
  sem_pessoas: 'Escolha pelo menos uma pessoa.',
  pessoas_demais: 'No máximo 100 pessoas por pedido.',
  pessoa_invalida: 'Alguém não está mais no setor de origem, ou não pode ser transferido',
  ja_em_pedido: 'Já há um pedido aberto para',
  so_super_admin: 'Só o super admin decide pedidos de transferência.',
  item_inexistente: 'Essa pessoa não está mais no pedido.',
  em_andamento: 'Outro super admin está transferindo essa pessoa agora.',
  ja_decidido: 'Essa pessoa já foi decidida',
  sem_efeito: 'A pessoa mudou de setor, foi desligada, ou o destino não está mais ativo.',
  nao_reservado: 'A reserva dessa pessoa venceu. Tente de novo.',
  nao_transferida: 'A transferência não chegou ao destino.',
  pedido_inexistente: 'Pedido não encontrado.',
};

export function mensagemDoPedido(r: { erro?: string | null; nomes?: unknown; por?: string | null } | null | undefined): string {
  const codigo = String(r?.erro ?? '').trim();
  const base = ERROS[codigo] ?? (codigo ? `Não foi possível concluir (${codigo}).` : 'Não foi possível concluir.');
  const nomes = Array.isArray(r?.nomes) ? (r!.nomes as unknown[]).map(String).filter(Boolean) : [];
  if (nomes.length) return `${base}: ${nomes.join(', ')}.`;
  if (r?.por) return `${base} por ${r.por}.`;
  return /[.:]$/.test(base) ? base : `${base}.`;
}
