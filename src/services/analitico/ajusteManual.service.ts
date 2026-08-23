/**
 * ajusteManual.service.ts — a correção temporária do recebimento.
 *
 * ## O que é, e por que contraria uma regra do projeto
 *
 * A regra diz que nada altera o valor do analítico. Ela continua valendo: este
 * módulo **não toca em `analitico_recebimentos`**. O ajuste vive numa tabela
 * separada (migration `20260823150000`) e é somado na LEITURA.
 *
 * A diferença não é cosmética. Somar na leitura significa que desligar a
 * correção — no dia em que o ERP for consertado — é parar de somar: nenhum dado
 * precisa ser desfeito, nenhuma reimportação é necessária, e a trilha de quem
 * lançou o quê continua inteira para auditoria.
 *
 * ## Onde o valor entra
 *
 * Em dois lugares, e só dois — os dois caminhos por onde o recebimento do
 * analítico chega às telas:
 *
 *   1. `buscarAnaliticoDashboardMes` → linhas do dashboard e do Painel Metas;
 *   2. `buscarResumoOperadoresAnalitico` → o resumo por operador da aba Quartis.
 *
 * Entrando ali, o ajuste sobe sozinho para **equipe e setor**: o escopo
 * (`escopoAnalitico.ts`) recorta por `operador_id` e por `setor_id`, e as linhas
 * sintéticas trazem os dois. Foi essa a razão de escolher esses pontos em vez de
 * somar em cada tela — somar em cada tela seria somar em oito lugares e esquecer
 * o nono.
 *
 * ## Não é Pix e não é cartão
 *
 * A linha sintética sai com `forma_detalhe = 'Ajuste manual'`, que é como ela
 * aparece na quebra por forma de pagamento. Rotulá-la como Pix inflaria um
 * número que a conciliação bancária confere — e alguém iria procurar o dinheiro.
 *
 * `forma_pagamento` precisa ser `'boleto_pix' | 'cartao'` (é o tipo da linha do
 * relatório), e vai `'boleto_pix'` por ser o balde não-cartão. É por isso que o
 * rótulo detalhado existe: ele é o que a tela mostra.
 */
import { supabase } from '@/lib/supabase';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { PP_HO_PERCENTUAL } from '@/lib/index';

// ── Cliente sem tipo ─────────────────────────────────────────────────────────
//
// `database.types.ts` é gerado do banco e ainda não conhece estas duas tabelas.
// Mesmo padrão de `tickets.service.ts`: quando os tipos forem regerados, trocar
// por `supabase.from('analitico_ajustes_manuais')` é substituição direta.

interface Consulta extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(colunas?: string): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function db(tabela: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(tabela);
}

/** O rótulo da forma, na tela e no relatório. Um lugar só. */
export const ROTULO_AJUSTE = 'Ajuste manual';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AjusteManual {
  id: string;
  empresaId: string;
  operadorId: string;
  operadorNome: string | null;
  setorId: string | null;
  equipeId: string | null;
  /** Primeiro dia do mês de competência, `yyyy-MM-dd`. */
  mesReferencia: string;
  /** Positivo soma, negativo tira. */
  valor: number;
  motivo: string;
  criadoPor: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
  cancelado: boolean;
  canceladoPorNome: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  editadoPorNome: string | null;
  atualizadoEm: string;
}

export interface SolicitacaoAjuste {
  id: string;
  ajusteId: string;
  tipo: 'editar' | 'cancelar';
  valorProposto: number | null;
  motivoProposto: string | null;
  justificativa: string;
  status: 'aberta' | 'aprovada' | 'recusada';
  solicitadoPorNome: string | null;
  solicitadoEm: string;
  resolvidoPorNome: string | null;
  resolvidoEm: string | null;
  resposta: string | null;
}

/** `2026-08` → `2026-08-01`. A competência é sempre o dia 1. */
export function primeiroDiaDaCompetencia(mes: string): string {
  return `${mes.slice(0, 7)}-01`;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Os ajustes de um mês.
 *
 * A RLS decide o recorte: quem administra recebe a empresa inteira, o líder
 * recebe o que lançou, e o operador recebe o que caiu no próprio recebimento.
 * Repetir esse recorte aqui criaria duas verdades — e a que engana é sempre a
 * do cliente.
 *
 * Migration pendente devolve lista vazia em vez de tela quebrada, mesmo padrão
 * de `listarTickets`: a Vercel publica no push, antes de a migration ser
 * aplicada.
 */
export async function listarAjustes(
  empresaId: string, mes: string,
): Promise<AjusteManual[]> {
  const { data, error } = await db('analitico_ajustes_manuais')
    .select('*, perfis!analitico_ajustes_manuais_operador_id_fkey(nome)')
    .eq('empresa_id', empresaId)
    .eq('mes_referencia', primeiroDiaDaCompetencia(mes))
    .order('criado_em', { ascending: false });

  if (error || !data) {
    if (error && !migrationPendente(error.message)) {
      console.warn('[ajusteManual] leitura falhou:', error.message);
    }
    return [];
  }
  return (data as Record<string, unknown>[]).map(paraAjuste);
}

/**
 * Só o que SOMA: do mês, da empresa, não cancelado.
 *
 * Separado de `listarAjustes` de propósito — esta é a consulta que roda em toda
 * abertura do Dashboard, e ela não precisa do `join` de nome nem dos cancelados.
 */
export async function somasPorOperador(
  empresaId: string, mes: string,
): Promise<Map<string, { valor: number; setorId: string | null; equipeId: string | null }>> {
  const mapa = new Map<string, { valor: number; setorId: string | null; equipeId: string | null }>();

  const { data, error } = await db('analitico_ajustes_manuais')
    .select('operador_id, setor_id, equipe_id, valor, cancelado')
    .eq('empresa_id', empresaId)
    .eq('mes_referencia', primeiroDiaDaCompetencia(mes));

  if (error || !data) return mapa;

  for (const linha of data as Record<string, unknown>[]) {
    if (linha.cancelado === true) continue;
    const id = String(linha.operador_id);
    const atual = mapa.get(id);
    const valor = Number(linha.valor) || 0;
    if (atual) {
      atual.valor += valor;
    } else {
      mapa.set(id, {
        valor,
        setorId:  (linha.setor_id as string | null) ?? null,
        equipeId: (linha.equipe_id as string | null) ?? null,
      });
    }
  }
  return mapa;
}

/**
 * As somas viram linhas do relatório.
 *
 * É esta função que faz o ajuste chegar ao Dashboard, ao Painel Metas, ao
 * escopo de equipe e ao de setor sem nenhuma delas saber que ele existe.
 *
 * ## O dia da linha
 *
 * O ajuste é de COMPETÊNCIA, não de data — ninguém informa "em que dia" o erro
 * do ERP aconteceu. Ele entra no dia 1 do mês, e a consequência honesta é que a
 * coluna do dia 1 no gráfico de evolução cresce. A alternativa (espalhar pelos
 * dias) inventaria um histórico que não existe.
 *
 * ## O H.O.
 *
 * Calculado com a mesma constante do resto do sistema, e só na PaguePlay — na
 * BookPlay `total_ho` é zero em toda linha do relatório, e um valor aqui faria
 * o ajuste ser o único registro com H.O. na operação inteira.
 */
export function ajustesComoLinhas(
  somas: Map<string, { valor: number; setorId: string | null; equipeId: string | null }>,
  mes: string,
  isPaguePlay: boolean,
): AnaliticoDashboardLinha[] {
  const dia = primeiroDiaDaCompetencia(mes);
  const linhas: AnaliticoDashboardLinha[] = [];

  for (const [operadorId, info] of somas) {
    if (!info.valor) continue;
    linhas.push({
      dia,
      operador_id: operadorId,
      setor_id: info.setorId,
      forma_pagamento: 'boleto_pix',
      forma_detalhe: ROTULO_AJUSTE,
      // Tabulado: o ajuste tem dono e motivo. Marcá-lo como não tabulado o
      // jogaria no aviso de "recebimento sem acordo", que é outra conversa.
      status_tabulacao: 'tabulado',
      total: info.valor,
      total_ho: isPaguePlay ? info.valor * PP_HO_PERCENTUAL : 0,
      // Zero pagamentos: o ajuste não é um pagamento, e contá-lo estragaria o
      // ticket médio — que é `recebido ÷ pagamentos`.
      qtd: 0,
    });
  }
  return linhas;
}

export async function listarSolicitacoes(
  empresaId: string,
): Promise<SolicitacaoAjuste[]> {
  const { data, error } = await db('analitico_ajustes_solicitacoes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('solicitado_em', { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(paraSolicitacao);
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function lancarAjuste(params: {
  empresaId: string;
  operadorId: string;
  setorId: string | null;
  equipeId: string | null;
  mes: string;
  /** Já com o sinal: positivo soma, negativo tira. */
  valor: number;
  motivo: string;
  criadoPor: string;
  criadoPorNome: string;
}): Promise<{ erro: string | null }> {
  const { error } = await db('analitico_ajustes_manuais').insert({
    empresa_id:      params.empresaId,
    operador_id:     params.operadorId,
    setor_id:        params.setorId,
    equipe_id:       params.equipeId,
    mes_referencia:  primeiroDiaDaCompetencia(params.mes),
    valor:           params.valor,
    motivo:          params.motivo.trim(),
    criado_por:      params.criadoPor,
    criado_por_nome: params.criadoPorNome,
  });
  return { erro: error ? traduzir(error.message) : null };
}

/** Só quem administra — a RLS recusa o resto. */
export async function editarAjuste(params: {
  id: string;
  valor: number;
  motivo: string;
  editadoPor: string;
  editadoPorNome: string;
}): Promise<{ erro: string | null }> {
  const { error } = await db('analitico_ajustes_manuais').update({
    valor:             params.valor,
    motivo:            params.motivo.trim(),
    editado_por:       params.editadoPor,
    editado_por_nome:  params.editadoPorNome,
    atualizado_em:     new Date().toISOString(),
  }).eq('id', params.id);
  return { erro: error ? traduzir(error.message) : null };
}

/**
 * Cancelar não apaga.
 *
 * A linha fica, para de somar, e guarda quem cancelou e por quê. Um ajuste
 * manual de valor é exatamente o registro que alguém vai querer auditar depois
 * — inclusive, e principalmente, os que foram desfeitos.
 */
export async function cancelarAjuste(params: {
  id: string;
  motivo: string;
  canceladoPor: string;
  canceladoPorNome: string;
}): Promise<{ erro: string | null }> {
  const { error } = await db('analitico_ajustes_manuais').update({
    cancelado:            true,
    cancelado_por:        params.canceladoPor,
    cancelado_por_nome:   params.canceladoPorNome,
    cancelado_em:         new Date().toISOString(),
    motivo_cancelamento:  params.motivo.trim(),
    atualizado_em:        new Date().toISOString(),
  }).eq('id', params.id);
  return { erro: error ? traduzir(error.message) : null };
}

export async function abrirSolicitacao(params: {
  ajusteId: string;
  empresaId: string;
  tipo: 'editar' | 'cancelar';
  valorProposto: number | null;
  motivoProposto: string | null;
  justificativa: string;
  solicitadoPor: string;
  solicitadoPorNome: string;
}): Promise<{ erro: string | null }> {
  const { error } = await db('analitico_ajustes_solicitacoes').insert({
    ajuste_id:            params.ajusteId,
    empresa_id:           params.empresaId,
    tipo:                 params.tipo,
    valor_proposto:       params.valorProposto,
    motivo_proposto:      params.motivoProposto?.trim() || null,
    justificativa:        params.justificativa.trim(),
    solicitado_por:       params.solicitadoPor,
    solicitado_por_nome:  params.solicitadoPorNome,
  });
  return { erro: error ? traduzir(error.message) : null };
}

export async function responderSolicitacao(params: {
  id: string;
  status: 'aprovada' | 'recusada';
  resposta: string;
  resolvidoPor: string;
  resolvidoPorNome: string;
}): Promise<{ erro: string | null }> {
  const { error } = await db('analitico_ajustes_solicitacoes').update({
    status:              params.status,
    resposta:            params.resposta.trim() || null,
    resolvido_por:       params.resolvidoPor,
    resolvido_por_nome:  params.resolvidoPorNome,
    resolvido_em:        new Date().toISOString(),
  }).eq('id', params.id);
  return { erro: error ? traduzir(error.message) : null };
}

/**
 * Avisa quem pode resolver o pedido.
 *
 * O destinatário sai do PAINEL DE PERMISSÕES, não de uma lista de cargo escrita
 * aqui: lê `cargos_permissoes`, separa os cargos com
 * `ajuste_recebimento_administrar` ligada e notifica quem tem esses cargos. É a
 * regra permanente do projeto, e vale também para notificação — uma lista de
 * cargo no código voltaria a decidir por fora do painel, só que em silêncio.
 *
 * `administrador` e `super_admin` entram sempre: eles recebem `true` para toda
 * chave por construção do resolvedor, e a linha deles em `cargos_permissoes`
 * pode nem existir.
 *
 * Falha em silêncio de propósito. O pedido JÁ foi gravado quando esta função
 * roda; não avisar é ruim, mas derrubar a tela depois de gravar seria pior — a
 * pessoa tentaria de novo e abriria dois pedidos.
 */
export async function notificarQuemAdministra(params: {
  empresaId: string;
  titulo: string;
  mensagem: string;
}): Promise<void> {
  try {
    const { data: cargos } = await db('cargos_permissoes')
      .select('cargo, permissoes')
      .eq('empresa_id', params.empresaId);

    const habilitados = new Set<string>(['administrador', 'super_admin']);
    for (const linha of (cargos ?? []) as Record<string, unknown>[]) {
      const mapa = linha.permissoes as Record<string, boolean> | null;
      if (mapa?.ajuste_recebimento_administrar === true) {
        habilitados.add(String(linha.cargo));
      }
    }

    const { data: pessoas } = await db('perfis')
      .select('id')
      .eq('empresa_id', params.empresaId)
      .in('perfil', [...habilitados]);

    const ids = ((pessoas ?? []) as { id: string }[]).map(p => p.id);
    if (!ids.length) return;

    const { criarNotificacao } = await import('@/services/notificacoes.service');
    await Promise.allSettled(ids.map(id => criarNotificacao({
      usuario_id: id,
      titulo:     params.titulo,
      mensagem:   params.mensagem,
      empresa_id: params.empresaId,
    })));
  } catch {
    // Ver o cabeçalho: o pedido já está gravado. Não avisar é aceitável.
  }
}

// ── Conversões e erros ───────────────────────────────────────────────────────

function paraAjuste(l: Record<string, unknown>): AjusteManual {
  const perfil = l.perfis as { nome?: string } | null;
  return {
    id:                 String(l.id),
    empresaId:          String(l.empresa_id),
    operadorId:         String(l.operador_id),
    operadorNome:       perfil?.nome ?? null,
    setorId:            (l.setor_id as string | null) ?? null,
    equipeId:           (l.equipe_id as string | null) ?? null,
    mesReferencia:      String(l.mes_referencia),
    valor:              Number(l.valor) || 0,
    motivo:             String(l.motivo ?? ''),
    criadoPor:          (l.criado_por as string | null) ?? null,
    criadoPorNome:      (l.criado_por_nome as string | null) ?? null,
    criadoEm:           String(l.criado_em),
    cancelado:          l.cancelado === true,
    canceladoPorNome:   (l.cancelado_por_nome as string | null) ?? null,
    canceladoEm:        (l.cancelado_em as string | null) ?? null,
    motivoCancelamento: (l.motivo_cancelamento as string | null) ?? null,
    editadoPorNome:     (l.editado_por_nome as string | null) ?? null,
    atualizadoEm:       String(l.atualizado_em ?? l.criado_em),
  };
}

function paraSolicitacao(l: Record<string, unknown>): SolicitacaoAjuste {
  return {
    id:                String(l.id),
    ajusteId:          String(l.ajuste_id),
    tipo:              (l.tipo as 'editar' | 'cancelar') ?? 'editar',
    valorProposto:     l.valor_proposto === null || l.valor_proposto === undefined
                         ? null : Number(l.valor_proposto),
    motivoProposto:    (l.motivo_proposto as string | null) ?? null,
    justificativa:     String(l.justificativa ?? ''),
    status:            (l.status as SolicitacaoAjuste['status']) ?? 'aberta',
    solicitadoPorNome: (l.solicitado_por_nome as string | null) ?? null,
    solicitadoEm:      String(l.solicitado_em),
    resolvidoPorNome:  (l.resolvido_por_nome as string | null) ?? null,
    resolvidoEm:       (l.resolvido_em as string | null) ?? null,
    resposta:          (l.resposta as string | null) ?? null,
  };
}

function migrationPendente(mensagem: string): boolean {
  return /could not find the table|does not exist|schema cache/i.test(mensagem);
}

/** Texto cru do Postgres → frase que diz o que fazer. */
export function traduzir(mensagem: string): string {
  if (migrationPendente(mensagem)) {
    return 'Migration 20260823150000 pendente — aplique-a no Supabase para usar o ajuste de recebimento.';
  }
  if (/ajuste_valor_nao_zero/i.test(mensagem)) {
    return 'O valor precisa ser diferente de zero.';
  }
  if (/ajuste_motivo_preenchido|solicitacao_justificativa/i.test(mensagem)) {
    return 'Escreva o motivo — ele é obrigatório e fica registrado.';
  }
  if (/row-level security|permission denied/i.test(mensagem)) {
    return 'O banco recusou: você não tem permissão para isso.';
  }
  return mensagem;
}
