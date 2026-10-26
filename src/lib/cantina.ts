/**
 * cantina.ts — as contas da cantina que a tela faz, sem React e sem banco.
 *
 * Quem decide de verdade é o banco (migration 20261022153000): janela do item,
 * faixa de retirada, prazo de cancelamento e preço. Aqui mora o espelho que
 * deixa a tela honesta ANTES do clique — o item fora do horário aparece com
 * cadeado, só as faixas válidas viram botão, o «cancelar» some no prazo. Se os
 * dois lados divergirem, o banco recusa e a tela mostra o motivo dele.
 *
 * ## O relógio
 *
 * Tudo é horário de Brasília, e nada usa o relógio do computador cru: o
 * cardápio traz a hora do servidor e a tela guarda a diferença (`deriva`). Um
 * PC com o relógio cinco minutos atrasado ofereceria faixas que o banco recusa.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type CategoriaCantina = 'lanches' | 'bebidas' | 'doces' | 'salgados' | 'refeicoes' | 'outros';

export type StatusPedido = 'novo' | 'preparando' | 'pronto' | 'retirado' | 'nao_retirado' | 'cancelado';

export interface ItemCantina {
  id: string;
  codigo: number;
  nome: string;
  descricao: string | null;
  ingredientes: string[];
  preco: number;
  foto_url: string | null;
  categoria: CategoriaCantina;
  opcoes: string[];
  /** Janela para FAZER o pedido, `HH:MM`. Nula = o horário da cantina. */
  pedido_de: string | null;
  pedido_ate: string | null;
}

export interface ConfigCantina {
  aberta: boolean;
  aviso_titulo: string | null;
  aviso_texto: string | null;
  preparo_min: number;
  cancelamento_min: number;
  faixa_min: number;
  abre_as: string;
  fecha_as: string;
}

export interface Cardapio {
  /** Hora do servidor no momento da leitura (ISO). */
  agora: string;
  config: ConfigCantina;
  itens: ItemCantina[];
}

export interface ItemDoPedido {
  codigo: number | null;
  nome: string;
  preco: number;
  quantidade: number;
  opcao: string | null;
  observacao: string | null;
}

export interface PedidoCantina {
  id: string;
  dia: string;
  numero: number;
  perfil_id: string;
  nome: string;
  empresa_nome: string | null;
  setor_nome: string | null;
  retirada_em: string;
  status: StatusPedido;
  total: number;
  observacao: string | null;
  criado_em: string;
  preparando_em: string | null;
  pronto_em: string | null;
  encerrado_em: string | null;
  motivo_cancelamento: string | null;
  cancelado_pela_cantina: boolean;
  itens: ItemDoPedido[];
  nao_lidas: number;
}

export interface MensagemCantina {
  id: number;
  lado: 'cliente' | 'cantina' | 'sistema';
  texto: string;
  criado_em: string;
  autor_nome: string | null;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

export const CATEGORIAS: { id: CategoriaCantina; rotulo: string }[] = [
  { id: 'lanches',   rotulo: 'Lanches' },
  { id: 'salgados',  rotulo: 'Salgados' },
  { id: 'refeicoes', rotulo: 'Refeições' },
  { id: 'bebidas',   rotulo: 'Bebidas' },
  { id: 'doces',     rotulo: 'Doces' },
  { id: 'outros',    rotulo: 'Outros' },
];

export const STATUS_ROTULO: Record<StatusPedido, string> = {
  novo:         'Recebido',
  preparando:   'Preparando',
  pronto:       'Pronto para retirar',
  retirado:     'Retirado',
  nao_retirado: 'Não retirado',
  cancelado:    'Cancelado',
};

/** Pedido que ainda pede atenção de alguém. */
export function emAndamento(status: StatusPedido): boolean {
  return status === 'novo' || status === 'preparando' || status === 'pronto';
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatarPreco(valor: number): string {
  return BRL.format(Number(valor) || 0);
}

// ── Relógio de Brasília ──────────────────────────────────────────────────────

const PARTES_SP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Minutos desde 00:00 em Brasília, e o dia (`yyyy-MM-dd`). */
export function relogioSP(ms: number): { minutos: number; dia: string } {
  const p = Object.fromEntries(PARTES_SP.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return {
    minutos: Number(p.hour) * 60 + Number(p.minute),
    dia: `${p.year}-${p.month}-${p.day}`,
  };
}

/** `HH:MM` → minutos. */
export function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** minutos → `HH:MM`. */
export function paraHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Hora de Brasília (`HH:MM`) de um instante ISO. */
export function horaSP(iso: string): string {
  return paraHora(relogioSP(Date.parse(iso)).minutos);
}

// ── Faixas de retirada ───────────────────────────────────────────────────────

/**
 * As faixas que o banco aceita agora: múltiplas de `faixa_min`, a partir de
 * agora + preparo (e nunca antes de abrir), até o fechamento inclusive.
 * Mesma conta de `fn_cantina_fazer_pedido`.
 */
export function faixasDeRetirada(agoraMin: number, cfg: ConfigCantina): string[] {
  const faixa = Math.max(1, cfg.faixa_min);
  const minimo = Math.max(agoraMin + cfg.preparo_min, paraMinutos(cfg.abre_as));
  const primeira = Math.ceil(minimo / faixa) * faixa;
  const ultima = paraMinutos(cfg.fecha_as);
  const faixas: string[] = [];
  for (let m = primeira; m <= ultima; m += faixa) faixas.push(paraHora(m));
  return faixas;
}

// ── Janela do item ───────────────────────────────────────────────────────────

export type JanelaItem =
  | { estado: 'aberta' }
  | { estado: 'antes'; abre: string }
  | { estado: 'encerrada'; fechou: string };

/** O item pode ser pedido agora? Mesma régua do banco (fim inclusive no minuto). */
export function janelaDoItem(item: Pick<ItemCantina, 'pedido_de' | 'pedido_ate'>, agoraMin: number): JanelaItem {
  if (!item.pedido_de || !item.pedido_ate) return { estado: 'aberta' };
  if (agoraMin < paraMinutos(item.pedido_de)) return { estado: 'antes', abre: item.pedido_de };
  if (agoraMin > paraMinutos(item.pedido_ate)) return { estado: 'encerrada', fechou: item.pedido_ate };
  return { estado: 'aberta' };
}

// ── Carrinho ─────────────────────────────────────────────────────────────────

export interface LinhaCarrinho {
  /** item + opção: «Refrigerante lata (Fanta Uva)» e «(Coca-Cola)» são linhas diferentes. */
  chave: string;
  item: ItemCantina;
  quantidade: number;
  opcao: string | null;
  observacao: string;
}

export const MAX_POR_LINHA = 20;

export function chaveDaLinha(itemId: string, opcao: string | null): string {
  return `${itemId}|${opcao ?? ''}`;
}

export type AcaoCarrinho =
  | { tipo: 'somar'; item: ItemCantina; opcao: string | null; delta: number }
  | { tipo: 'observacao'; chave: string; texto: string }
  | { tipo: 'remover'; chave: string }
  | { tipo: 'esvaziar' };

export function carrinhoReducer(linhas: LinhaCarrinho[], acao: AcaoCarrinho): LinhaCarrinho[] {
  switch (acao.tipo) {
    case 'somar': {
      const chave = chaveDaLinha(acao.item.id, acao.opcao);
      const atual = linhas.find(l => l.chave === chave);
      const quantidade = Math.min(MAX_POR_LINHA, (atual?.quantidade ?? 0) + acao.delta);
      if (quantidade <= 0) return linhas.filter(l => l.chave !== chave);
      if (atual) return linhas.map(l => (l.chave === chave ? { ...l, quantidade } : l));
      return [...linhas, { chave, item: acao.item, quantidade, opcao: acao.opcao, observacao: '' }];
    }
    case 'observacao':
      return linhas.map(l => (l.chave === acao.chave ? { ...l, observacao: acao.texto.slice(0, 140) } : l));
    case 'remover':
      return linhas.filter(l => l.chave !== acao.chave);
    case 'esvaziar':
      return [];
  }
}

/** Quantas unidades de um item (todas as opções somadas) estão no carrinho. */
export function quantidadeDoItem(linhas: LinhaCarrinho[], itemId: string): number {
  return linhas.reduce((s, l) => s + (l.item.id === itemId ? l.quantidade : 0), 0);
}

export function totalDoCarrinho(linhas: LinhaCarrinho[]): { itens: number; valor: number } {
  return linhas.reduce(
    (t, l) => ({ itens: t.itens + l.quantidade, valor: t.valor + l.item.preco * l.quantidade }),
    { itens: 0, valor: 0 },
  );
}

/** Itens do carrinho que saíram da janela enquanto a pessoa montava o pedido. */
export function linhasForaDaJanela(linhas: LinhaCarrinho[], agoraMin: number): LinhaCarrinho[] {
  return linhas.filter(l => janelaDoItem(l.item, agoraMin).estado !== 'aberta');
}

// ── Pedido ───────────────────────────────────────────────────────────────────

/** Quem pediu ainda pode cancelar? Mesma régua de `fn_cantina_cancelar`. */
export function podeCancelar(p: Pick<PedidoCantina, 'status' | 'retirada_em'>, agoraMs: number, cancelamentoMin: number): boolean {
  if (p.status !== 'novo' && p.status !== 'preparando') return false;
  return agoraMs <= Date.parse(p.retirada_em) - cancelamentoMin * 60_000;
}

/** Até quando quem pediu pode cancelar (`HH:MM`). */
export function limiteDeCancelamento(retiradaIso: string, cancelamentoMin: number): string {
  return horaSP(new Date(Date.parse(retiradaIso) - cancelamentoMin * 60_000).toISOString());
}

/** As etapas da linha do tempo, e até onde o pedido chegou. */
export const ETAPAS: { status: StatusPedido; rotulo: string }[] = [
  { status: 'novo',       rotulo: 'Recebido' },
  { status: 'preparando', rotulo: 'Preparando' },
  { status: 'pronto',     rotulo: 'Pronto' },
  { status: 'retirado',   rotulo: 'Retirado' },
];

export function etapaAtual(status: StatusPedido): number {
  const i = ETAPAS.findIndex(e => e.status === status);
  return i >= 0 ? i : (status === 'nao_retirado' ? 2 : -1);
}

/** O pedido passou da hora de retirada e ainda está na fila. */
export function atrasado(p: Pick<PedidoCantina, 'status' | 'retirada_em'>, agoraMs: number): boolean {
  return emAndamento(p.status) && agoraMs > Date.parse(p.retirada_em);
}

// ── A fila da cantina ────────────────────────────────────────────────────────

export type ColunaFila = 'novo' | 'preparando' | 'pronto' | 'encerrado';

export function colunaDoStatus(s: StatusPedido): ColunaFila {
  if (s === 'novo' || s === 'preparando' || s === 'pronto') return s;
  return 'encerrado';
}

/** Pedidos agrupados por faixa de retirada, na ordem do relógio. */
export function agruparPorFaixa(pedidos: PedidoCantina[]): { faixa: string; pedidos: PedidoCantina[] }[] {
  const grupos = new Map<string, PedidoCantina[]>();
  for (const p of [...pedidos].sort((a, b) => Date.parse(a.retirada_em) - Date.parse(b.retirada_em) || a.numero - b.numero)) {
    const faixa = horaSP(p.retirada_em);
    grupos.set(faixa, [...(grupos.get(faixa) ?? []), p]);
  }
  return [...grupos.entries()].map(([faixa, ps]) => ({ faixa, pedidos: ps }));
}

/**
 * O que a cozinha precisa adiantar: itens dos pedidos ainda não prontos com
 * retirada até `janelaMin` à frente (inclusive os atrasados).
 */
export function resumoDeProducao(
  pedidos: PedidoCantina[], agoraMs: number, janelaMin = 30,
): { nome: string; quantidade: number }[] {
  const limite = agoraMs + janelaMin * 60_000;
  const soma = new Map<string, number>();
  for (const p of pedidos) {
    if (p.status !== 'novo' && p.status !== 'preparando') continue;
    if (Date.parse(p.retirada_em) > limite) continue;
    for (const i of p.itens) {
      const nome = i.opcao ? `${i.nome} (${i.opcao})` : i.nome;
      soma.set(nome, (soma.get(nome) ?? 0) + i.quantidade);
    }
  }
  return [...soma.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome));
}

/**
 * Fotos genéricas de amostra (26/10/2026), por código do cardápio, só para a
 * apresentação à cantina. Valem enquanto o item não tem `foto_url` próprio;
 * quando a cantina cadastrar a foto de verdade, ela ganha. Arquivos em
 * public/images/cantina (Unsplash).
 */
const FOTO_AMOSTRA: Record<number, string> = {
  50: 'xsalada', 51: 'xfrango', 53: 'xsaladinha', 59: 'xegg', 58: 'xcalabresa',
  52: 'hotdog', 57: 'hotduplo',
  8: 'refri', 9: 'coca', 13: 'agua', 14: 'guarana', 15: 'guarana',
};

/** A foto do item: a cadastrada, ou a de amostra, ou nenhuma (ilustração). */
export function fotoDoItem(item: Pick<ItemCantina, 'codigo' | 'foto_url'>): string | null {
  if (item.foto_url) return item.foto_url;
  const arquivo = FOTO_AMOSTRA[item.codigo];
  return arquivo ? `/images/cantina/${arquivo}.jpg` : null;
}

/** O que conta no dia: entregue, não retirado e o que ainda está na fila. */
export function totalDoDia(pedidos: PedidoCantina[]): { pedidos: number; valor: number } {
  return pedidos.reduce(
    (t, p) => (p.status === 'cancelado' ? t : { pedidos: t.pedidos + 1, valor: t.valor + Number(p.total) }),
    { pedidos: 0, valor: 0 },
  );
}
