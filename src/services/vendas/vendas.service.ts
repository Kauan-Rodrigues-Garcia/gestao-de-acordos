/**
 * vendas.service.ts — o que a aba Vendas lê e grava.
 *
 * ## Escrita só por RPC, e a separação não é burocracia
 *
 * `salvarVenda` e `confirmarVenda` são duas funções porque são dois poderes: o
 * operador lança a venda dele, e quem valida é o líder. Se fossem uma só,
 * `editar_vendas` no operador viraria, na prática, o direito de dar a própria
 * venda como confirmada e assinada.
 *
 * ## `tabelaSemTipo` / `rpcSemTipo`
 *
 * A tabela é nova e ainda não está em `database.types.ts`. Enquanto a migration
 * `20260915100000_vendas_fase1.sql` não for aplicada, toda leitura devolve
 * `disponivel: false` e a tela diz isso em vez de mostrar erro cru — mesmo
 * desenho do Fechamento.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import type { OrigemVenda, SituacaoVenda } from '@/lib/vendas';
import { mensagemDoErro, pareceNaoInstalado } from './erroDoBanco';

/** A linha como o banco a devolve. `conta_na_meta` e `valor_na_meta` são geradas. */
export interface Venda {
  id: string;
  empresa_id: string;
  operador_id: string;
  setor_id: string | null;
  equipe_id: string | null;
  nr_documento: string;
  cliente: string | null;
  uf: string | null;
  valor_total: number;
  valor_entrada: number | null;
  valor_recebido: number;
  forma_pagamento: string | null;
  data_venda: string;
  data_confirmacao: string | null;
  situacao: SituacaoVenda;
  contrato_assinado: boolean;
  motivo: string | null;
  origem: OrigemVenda;
  confirmado_por: string | null;
  confirmado_em: string | null;
  criado_em: string;
  atualizado_em: string;
  /** Gerada pelo banco: a régua «confirmada E assinada». */
  conta_na_meta: boolean;
  /** Gerada pelo banco: `valor_total` na régua, 0 fora dela. */
  valor_na_meta: number;
  /** Join parcial — só o nome, que é o que a tela mostra. */
  perfis?: { id: string; nome: string } | null;
}

const COLUNAS = `
  id, empresa_id, operador_id, setor_id, equipe_id,
  nr_documento, cliente, uf,
  valor_total, valor_entrada, valor_recebido, forma_pagamento,
  data_venda, data_confirmacao,
  situacao, contrato_assinado, motivo, origem,
  confirmado_por, confirmado_em, criado_em, atualizado_em,
  conta_na_meta, valor_na_meta,
  perfis:operador_id ( id, nome )
`;

/**
 * Por qual data a busca recorta.
 *
 * `qualquer` traz a venda que tem **uma das duas** datas no intervalo. É o que
 * a aba Vendas usa desde 21/09/2026: a lista precisa da venda aberta lançada
 * hoje (que só tem data de venda) E da venda de junho confirmada hoje (que
 * conta na meta deste mês). Duas consultas custariam o dobro para trazer
 * quase as mesmas linhas.
 */
export type EixoDaBusca = 'confirmacao' | 'venda' | 'qualquer';

export interface VendasDoPeriodo {
  vendas: Venda[];
  /**
   * A tabela existe neste banco? `false` enquanto a migration não for aplicada.
   * A tela avisa em vez de mostrar «relation does not exist».
   */
  disponivel: boolean;
  erro: string | null;
}


/** Números chegam do PostgREST como string quando a coluna é `numeric`. */
function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function normalizar(linha: Record<string, unknown>): Venda {
  return {
    ...(linha as unknown as Venda),
    valor_total:    num(linha.valor_total),
    valor_recebido: num(linha.valor_recebido),
    valor_entrada:  linha.valor_entrada == null ? null : num(linha.valor_entrada),
    valor_na_meta:  num(linha.valor_na_meta),
    conta_na_meta:  linha.conta_na_meta === true,
  };
}

/**
 * As vendas de um intervalo, pelo eixo pedido.
 *
 * O intervalo é fechado nos dois lados (`>=` e `<=`) porque quem chama pensa em
 * «do dia 1 ao dia 30», não em «até antes do dia 31».
 *
 * Pelo eixo de confirmação, venda ainda aberta **não aparece** — ela não tem
 * data de confirmação, e é assim que o relatório geral se comporta. Quem quer
 * enxergar o que está em aberto pergunta pelo eixo da venda.
 */
export async function buscarVendas(params: {
  empresaId: string;
  de: string;
  ate: string;
  eixo: EixoDaBusca;
}): Promise<VendasDoPeriodo> {
  let consulta = tabelaSemTipo<Record<string, unknown>>('vendas')
    .select(COLUNAS)
    .eq('empresa_id', params.empresaId);

  if (params.eixo === 'qualquer') {
    consulta = consulta.or(
      `and(data_venda.gte.${params.de},data_venda.lte.${params.ate}),`
      + `and(data_confirmacao.gte.${params.de},data_confirmacao.lte.${params.ate})`,
    );
  } else {
    const coluna = params.eixo === 'venda' ? 'data_venda' : 'data_confirmacao';
    consulta = consulta.gte(coluna, params.de).lte(coluna, params.ate);
  }

  const { data, error } = await consulta
    .order(params.eixo === 'confirmacao' ? 'data_confirmacao' : 'data_venda', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    return { vendas: [], disponivel: !pareceNaoInstalado(error.message), erro: error.message };
  }
  return { vendas: (data ?? []).map(normalizar), disponivel: true, erro: null };
}

/**
 * A fila do líder: o que espera decisão.
 *
 * Duas coisas, e não uma — são as duas gavetas que dão trabalho:
 * venda ainda aberta, e venda confirmada que ninguém assinou. A segunda é a
 * que vale dinheiro: «falta de assinatura do contrato» é o maior motivo de
 * cancelamento no relatório, 27 dos 44 de setembro.
 */
export async function buscarPendentes(empresaId: string): Promise<VendasDoPeriodo> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('vendas')
    .select(COLUNAS)
    .eq('empresa_id', empresaId)
    .or('situacao.eq.aberta,and(situacao.eq.confirmada,contrato_assinado.is.false)')
    .order('data_venda', { ascending: true });

  if (error) {
    return { vendas: [], disponivel: !pareceNaoInstalado(error.message), erro: error.message };
  }
  return { vendas: (data ?? []).map(normalizar), disponivel: true, erro: null };
}

export interface EntradaVenda {
  id?: string | null;
  empresaId: string;
  operadorId: string;
  nrDocumento: string;
  cliente: string | null;
  uf: string | null;
  valorTotal: number;
  valorEntrada: number | null;
  formaPagamento: string | null;
  dataVenda: string;
}

export interface Resultado {
  ok: boolean;
  id: string | null;
  erro: string | null;
}

/**
 * As três causas de a tabela não responder, e cada uma pede uma frase.
 *
 * Migration faltando, cache do PostgREST velho, ou uma FOREIGN KEY ausente no
 * join que a consulta pediu. A classificação mora em `erroDoBanco.ts` — e mora
 * lá porque esta função já esteve errada nos três serviços de Vendas ao mesmo
 * tempo, e mandou procurar migration quando faltava constraint.
 */
function traduzir(mensagem: string): string {
  // O CHECK da chave única fala em inglês; o líder precisa saber o que fazer.
  if (/vendas_nr_unico|duplicate key/i.test(mensagem)) {
    return 'Já existe uma venda com este NR nesta empresa.';
  }
  return mensagemDoErro(mensagem, 'A aba Vendas', '20260915100000_vendas_fase1.sql');
}

/** Lança (sem `id`) ou edita (com `id`). Nunca muda situação nem assinatura. */
export async function salvarVenda(entrada: EntradaVenda): Promise<Resultado> {
  const { data, error } = await rpcSemTipo<string>('fn_venda_salvar', {
    p_id:              entrada.id ?? null,
    p_empresa_id:      entrada.empresaId,
    p_operador_id:     entrada.operadorId,
    p_nr_documento:    entrada.nrDocumento,
    p_cliente:         entrada.cliente,
    p_uf:              entrada.uf,
    p_valor_total:     entrada.valorTotal,
    p_valor_entrada:   entrada.valorEntrada,
    p_forma_pagamento: entrada.formaPagamento,
    p_data_venda:      entrada.dataVenda,
  });
  if (error) return { ok: false, id: null, erro: traduzir(error.message) };
  return { ok: true, id: data ?? null, erro: null };
}

/**
 * O ato do líder: situação e assinatura juntas.
 *
 * Juntas porque é o par que decide se a venda conta. Mandá-las em duas
 * chamadas deixaria a venda existir, entre uma e outra, num estado que ninguém
 * pediu — confirmada e não assinada, por exemplo, quando a intenção era as duas.
 */
export async function confirmarVenda(params: {
  id: string;
  situacao: SituacaoVenda;
  assinado: boolean;
  dataConfirmacao: string | null;
  valorRecebido: number | null;
  motivo: string | null;
}): Promise<Resultado> {
  const { data, error } = await rpcSemTipo<string>('fn_venda_confirmar', {
    p_id:               params.id,
    p_situacao:         params.situacao,
    p_assinado:         params.assinado,
    p_data_confirmacao: params.dataConfirmacao,
    p_valor_recebido:   params.valorRecebido,
    p_motivo:           params.motivo,
  });
  if (error) return { ok: false, id: null, erro: traduzir(error.message) };
  return { ok: true, id: data ?? null, erro: null };
}

export async function excluirVenda(id: string, motivo: string | null): Promise<Resultado> {
  const { data, error } = await rpcSemTipo<string>('fn_venda_excluir', {
    p_id: id, p_motivo: motivo,
  });
  if (error) return { ok: false, id: null, erro: traduzir(error.message) };
  return { ok: true, id: data ?? null, erro: null };
}

export async function restaurarVenda(lixeiraId: string): Promise<Resultado> {
  const { data, error } = await rpcSemTipo<string>('fn_venda_restaurar', {
    p_lixeira_id: lixeiraId,
  });
  if (error) return { ok: false, id: null, erro: traduzir(error.message) };
  return { ok: true, id: data ?? null, erro: null };
}

export interface ItemLixeiraVenda {
  id: string;
  venda_id: string;
  operador_nome: string | null;
  nr_documento: string | null;
  cliente: string | null;
  valor_total: number;
  data_venda: string | null;
  situacao: string | null;
  motivo: string | null;
  excluido_por_nome: string | null;
  excluido_em: string;
  expira_em: string;
}

export async function buscarLixeiraVendas(
  empresaId: string,
): Promise<{ itens: ItemLixeiraVenda[]; disponivel: boolean; erro: string | null }> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('lixeira_vendas')
    .select(`
      id, venda_id, operador_nome, nr_documento, cliente, valor_total,
      data_venda, situacao, motivo, excluido_por_nome, excluido_em, expira_em
    `)
    .eq('empresa_id', empresaId)
    .order('excluido_em', { ascending: false });

  if (error) {
    return { itens: [], disponivel: !pareceNaoInstalado(error.message), erro: error.message };
  }
  const itens = (data ?? []).map(l => ({
    ...(l as unknown as ItemLixeiraVenda),
    valor_total: num(l.valor_total),
  }));
  return { itens, disponivel: true, erro: null };
}
