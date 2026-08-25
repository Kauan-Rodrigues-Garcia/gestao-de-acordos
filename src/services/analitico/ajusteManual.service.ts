/**
 * ajusteManual.service.ts — a correção temporária do recebimento.
 *
 * ## O que é, e por que contraria uma regra do projeto
 *
 * A regra diz que nada altera o valor do analítico. Ela continua valendo: este
 * módulo **não toca em `analitico_recebimentos`**. O ajuste vive numa tabela
 * separada (migrations `20260823150000` e `20260825120000`) e é somado na
 * LEITURA.
 *
 * ## Um card por operador
 *
 * Desde `20260825120000` existe no máximo UMA linha ativa por operador por mês,
 * garantida por índice único. O líder informa o valor TOTAL da pessoa; o
 * histórico de cada alteração mora em `analitico_ajustes_eventos`, escrito por
 * gatilho.
 *
 * O card é compartilhado: todo líder que enxerga o operador — inclusive por
 * clone, via `fn_setores_do_operador` — vê e edita o mesmo registro. O desenho
 * anterior mostrava a cada líder só o que ele mesmo tinha lançado, e em agosto
 * isso produziu lançamentos em dobro para três operadores do Play 5.
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
import type { AnaliticoDashboardLinha, AnaliticoRecebimento } from '@/lib/supabase';
import { PP_HO_PERCENTUAL } from '@/lib/index';

/**
 * A linha sintética tem o formato de um recebimento, sem os campos que só um
 * recebimento de verdade tem (`pagamentos_detalhados`, o join do perfil).
 * Declarada assim para o compilador cobrar os obrigatórios sem exigir o que não
 * existe.
 */
type AnaliticoRecebimentoSintetico = AnaliticoRecebimento;

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

/**
 * O `lote_id` das linhas sintéticas na lista do Analítico.
 *
 * As linhas do relatório vêm de uma importação e carregam o id do lote. O
 * ajuste não veio de lote nenhum, e este valor fixo é o que permite a tela
 * reconhecê-lo sem inventar um campo novo no tipo — e sem confundi-lo com um
 * recebimento de verdade, que tem acordo para tabular e linha para excluir.
 */
export const LOTE_AJUSTE_MANUAL = 'ajuste-manual';

/** Esta linha da lista é um ajuste manual, e não um recebimento do ERP? */
export function ehLinhaDeAjuste(linha: { lote_id?: string | null }): boolean {
  return linha.lote_id === LOTE_AJUSTE_MANUAL;
}

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

/**
 * Uma linha do histórico do card.
 *
 * Escrita por gatilho no banco (`fn_ajuste_registrar_evento`), nunca daqui. É
 * dela que sai a frase que o líder lê — «atualizado de 5.000 para 6.000
 * (+1.000) por Fulano em 25/08» —, e é `delta` que responde a pergunta que ele
 * realmente faz: quanto entrou hoje.
 */
export interface EventoAjuste {
  id: string;
  ajusteId: string;
  tipo: 'criado' | 'atualizado' | 'cancelado';
  /** `null` na criação: não havia valor antes. */
  valorAnterior: number | null;
  valorNovo: number;
  /** `valorNovo - valorAnterior`, já calculado no banco. */
  delta: number;
  observacao: string | null;
  autorNome: string | null;
  criadoEm: string;
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
 * recebe os cards de quem ele supervisiona (`fn_ajuste_no_meu_alcance`, clone
 * incluído), e o operador recebe o que caiu no próprio recebimento. Repetir
 * esse recorte aqui criaria duas verdades — e a que engana é sempre a do
 * cliente.
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

/**
 * As somas viram linhas da LISTA do Analítico (a tabela de recebimentos).
 *
 * `ajustesComoLinhas` serve às agregações; esta serve à lista que a pessoa lê,
 * e ao total que essa lista soma na frente dela. Sem isto, o operador via o
 * card «Total recebido» de «Meus recebimentos» sem o ajuste — enquanto o
 * ranking da aba ao lado, que vem de outro caminho, já o incluía. Dois números
 * na mesma tela, e nada explicando a diferença.
 *
 * A linha é de LEITURA: `lote_id` marca a origem, `TabulacaoCell` a reconhece e
 * mostra um selo em vez de «Tabular acordo». Ela é a soma do mês, e não uma
 * linha por lançamento: o detalhe com autor e motivo mora na aba Ajuste de
 * recebimento, que é onde alguém vai procurá-lo.
 */
export function ajustesComoRecebimentos(
  somas: Map<string, { valor: number; setorId: string | null; equipeId: string | null }>,
  empresaId: string,
  mes: string,
  isPaguePlay: boolean,
): AnaliticoRecebimentoSintetico[] {
  const dia = primeiroDiaDaCompetencia(mes);
  const linhas: AnaliticoRecebimentoSintetico[] = [];

  for (const [operadorId, info] of somas) {
    if (!info.valor) continue;
    linhas.push({
      // Determinístico: a reconciliação da lista casa por `id`, e um id novo a
      // cada leitura faria a linha piscar em toda releitura.
      id:                `${LOTE_AJUSTE_MANUAL}:${operadorId}:${dia}`,
      empresa_id:        empresaId,
      operador_id:       operadorId,
      operador_usuario:  '',
      codigo:            ROTULO_AJUSTE,
      nome_cliente:      null,
      forma_pagamento:   'boleto_pix',
      forma_detalhe:     ROTULO_AJUSTE,
      valor_recebido:    info.valor,
      total_ho:          isPaguePlay ? info.valor * PP_HO_PERCENTUAL : 0,
      data_pagamento:    dia,
      mes_referencia:    dia,
      acordo_id:         null,
      // Tabulado: o ajuste tem dono e motivo. Marcá-lo como não tabulado o
      // jogaria na fila de «recebimento sem acordo», que é outra conversa — e
      // faria a tela sair procurando um acordo que não existe.
      status_tabulacao:  'tabulado',
      visto:             true,
      importado_por_id:  null,
      importado_em:      dia,
      lote_id:           LOTE_AJUSTE_MANUAL,
      setor_id:          info.setorId,
    });
  }
  return linhas;
}

/**
 * O histórico de um card, do mais novo para o mais velho.
 *
 * Carregado sob demanda — só quando alguém abre o card. Trazê-lo junto da
 * lista multiplicaria por N uma consulta que roda em toda abertura da aba,
 * para mostrar o que quase ninguém abre.
 */
export async function listarEventos(ajusteId: string): Promise<EventoAjuste[]> {
  const { data, error } = await db('analitico_ajustes_eventos')
    .select('*')
    .eq('ajuste_id', ajusteId)
    .order('criado_em', { ascending: false })
    .limit(200);

  if (error || !data) {
    if (error && !migrationPendente(error.message)) {
      console.warn('[ajusteManual] histórico falhou:', error.message);
    }
    return [];
  }
  return (data as Record<string, unknown>[]).map(paraEvento);
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

/**
 * O total do card passa a ser outro.
 *
 * Note o que NÃO está aqui: nenhuma conta de diferença. O líder informa o total
 * — «a Milena está com 6.000» — e o `delta` de +1.000 é derivado pelo gatilho, a
 * partir do valor que já estava na linha. Calcular a diferença no cliente
 * exigiria ler o valor atual antes de escrever, e duas pessoas editando o mesmo
 * card fariam a segunda gravar uma diferença calculada sobre um valor velho.
 *
 * `motivo` é opcional: exigir texto a cada atualização diária vira pedágio, e
 * quem paga pedágio escreve ".". Quando vem preenchido, entra no histórico
 * daquele evento.
 */
export async function editarAjuste(params: {
  id: string;
  valor: number;
  motivo?: string;
  editadoPor: string;
  editadoPorNome: string;
}): Promise<{ erro: string | null }> {
  const anotacao = params.motivo?.trim();
  const { error } = await db('analitico_ajustes_manuais').update({
    valor:             params.valor,
    ...(anotacao ? { motivo: anotacao } : {}),
    editado_por:       params.editadoPor,
    editado_por_nome:  params.editadoPorNome,
    atualizado_em:     new Date().toISOString(),
  }).eq('id', params.id);
  return { erro: error ? traduzir(error.message) : null };
}

/**
 * «Apagar» o card, na tela. Cancelar, no banco.
 *
 * Para quem usa é apagar: o card some da lista e o valor para de somar em todo
 * lugar. Por baixo a linha fica, com quem cancelou e quando — e some do índice
 * único, o que libera o operador para receber um card novo no mesmo mês.
 *
 * Um ajuste manual de valor é exatamente o registro que alguém vai querer
 * auditar depois; principalmente os que foram desfeitos.
 */
export async function cancelarAjuste(params: {
  id: string;
  motivo?: string;
  canceladoPor: string;
  canceladoPorNome: string;
}): Promise<{ erro: string | null }> {
  const { error } = await db('analitico_ajustes_manuais').update({
    cancelado:            true,
    cancelado_por:        params.canceladoPor,
    cancelado_por_nome:   params.canceladoPorNome,
    cancelado_em:         new Date().toISOString(),
    motivo_cancelamento:  params.motivo?.trim() || null,
    atualizado_em:        new Date().toISOString(),
  }).eq('id', params.id);
  return { erro: error ? traduzir(error.message) : null };
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

function paraEvento(l: Record<string, unknown>): EventoAjuste {
  const anterior = l.valor_anterior;
  return {
    id:            String(l.id),
    ajusteId:      String(l.ajuste_id),
    tipo:          (l.tipo as EventoAjuste['tipo']) ?? 'atualizado',
    valorAnterior: anterior === null || anterior === undefined ? null : Number(anterior),
    valorNovo:     Number(l.valor_novo) || 0,
    delta:         Number(l.delta) || 0,
    observacao:    (l.observacao as string | null) ?? null,
    autorNome:     (l.autor_nome as string | null) ?? null,
    criadoEm:      String(l.criado_em),
  };
}

function migrationPendente(mensagem: string): boolean {
  return /could not find the table|does not exist|schema cache/i.test(mensagem);
}

/** Texto cru do Postgres → frase que diz o que fazer. */
export function traduzir(mensagem: string): string {
  if (migrationPendente(mensagem)) {
    return 'Migration 20260825120000 pendente — aplique-a no Supabase para usar o ajuste de recebimento.';
  }
  // A trava do card único. Ela dispara quando duas pessoas criam o card do
  // mesmo operador ao mesmo tempo — e a mensagem precisa dizer o que fazer, não
  // nomear o índice: quem está na tela não sabe o que é `ux_ajuste_card…`.
  if (/ux_ajuste_card_por_operador_mes|duplicate key/i.test(mensagem)) {
    return 'Esta pessoa já tem um card neste mês. Recarregue a aba e edite o card existente.';
  }
  if (/ajuste_valor_nao_zero/i.test(mensagem)) {
    return 'O valor precisa ser diferente de zero.';
  }
  if (/ajuste_motivo_preenchido/i.test(mensagem)) {
    return 'Escreva o motivo — ele é obrigatório e fica registrado.';
  }
  if (/row-level security|permission denied/i.test(mensagem)) {
    return 'O banco recusou: você não tem permissão para isso.';
  }
  return mensagem;
}
