/**
 * src/services/pix_automatico.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Pix Automático (BookPlay): registro de acordos fechados no Pix automático
 * para acompanhamento de comissão — SEM vínculo com a tabela `acordos`.
 *
 * Regras:
 *   • operador registra NR + valor → linha nasce 'pendente'
 *   • líder+ aprova (trava o % do setor em pct_comissao) ou desaprova
 *   • desaprovado não conta em nenhum total; o dono pode excluir
 *   • % por setor em pix_automatico_config (padrão 0,25)
 *
 * Comissão = valor × pct ÷ 100 (pct 0.25 = 0,25%).
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PixAutoAcordoInsert = Database['public']['Tables']['pix_automatico_acordos']['Insert'];
type PixAutoAcordoUpdate = Database['public']['Tables']['pix_automatico_acordos']['Update'];

export type PixAutoStatus = 'pendente' | 'aprovado' | 'desaprovado';

export const PIX_AUTO_PCT_PADRAO = 0.25;

/**
 * Acordos Pix no mês que dobram a comissão do operador.
 *
 * Regra de negócio da operação: batendo esta quantidade, a comissão do mês vale
 * o dobro. Contam os acordos FEITOS (pendente + aprovado) — desaprovado não
 * existiu. É o mesmo conjunto que o contador mostra ao operador, senão ele veria
 * um número subir e a meta não sair do lugar.
 */
export const PIX_META_ACORDOS_DOBRA = 18;

/**
 * A meta de acordos que vale para um setor.
 *
 * Espelha `comissaoDe`, que já resolve o `pct` por setor com um mapa e um
 * padrão. O ranking mistura operadores de setores diferentes quando quem olha
 * é admin, então a meta tem de ser resolvida POR LINHA — um número só para a
 * tela inteira mostraria "cumpriu" para quem está em setor de meta maior.
 *
 * `PIX_META_ACORDOS_DOBRA` continua sendo o padrão: é o combinado da operação
 * e o default da coluna.
 */
export function metaDobraDoSetor(
  setorId: string | null | undefined,
  metaPorSetor: Record<string, number>,
): number {
  if (setorId != null && metaPorSetor[setorId] != null && metaPorSetor[setorId] > 0) {
    return metaPorSetor[setorId];
  }
  return PIX_META_ACORDOS_DOBRA;
}

/** Mapa setor → meta de acordos, do jeito que as telas consomem. */
export function metasDobraPorSetor(configs: PixAutoConfig[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const c of configs) {
    const m = Number(c.meta_acordos_dobra);
    if (Number.isFinite(m) && m > 0) mapa[c.setor_id] = m;
  }
  return mapa;
}

export interface PixAutoAcordo {
  id: string;
  empresa_id: string;
  operador_id: string;
  operador_nome: string | null;
  setor_id: string | null;
  nr_cliente: string;
  valor: number;
  status: PixAutoStatus;
  pct_comissao: number | null;
  avaliado_por: string | null;
  avaliado_por_nome: string | null;
  avaliado_em: string | null;
  /** Comissão desta linha já paga ao operador (líder+ marca). */
  pago: boolean;
  pago_em: string | null;
  pago_por: string | null;
  pago_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PixAutoConfig {
  id: string;
  empresa_id: string;
  setor_id: string;
  pct: number;
  /**
   * Quantos acordos o operador precisa fazer no mês para o requisito 1 da
   * comissão dobrada. Era a constante `PIX_META_ACORDOS_DOBRA = 18`, fixa no
   * código; virou config por setor na 20260810c. Opcional no tipo porque a
   * coluna pode não existir em ambiente sem a migration.
   */
  meta_acordos_dobra?: number | null;
  /** Interruptor do setor: false = operador só visualiza, não registra. */
  permite_registro_operador: boolean;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  atualizado_em: string;
}

/** Registro histórico de NR (pix_automatico_nr_registro, mantido por triggers). */
export interface PixNrRegistro {
  id: string;
  empresa_id: string;
  nr_normalizado: string;
  nr_cliente: string;
  acordo_id: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  status: 'pendente' | 'validado' | 'recusado';
  avaliado_por: string | null;
  avaliado_por_nome: string | null;
  avaliado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export function normalizarNr(nr: string): string {
  return nr.trim().toLowerCase();
}

/** Comissão de uma linha: aprovado usa o % travado; pendente usa o % do setor. */
export function comissaoDe(a: Pick<PixAutoAcordo, 'valor' | 'status' | 'pct_comissao' | 'setor_id'>, pctPorSetor: Record<string, number>): number {
  const pct = a.status === 'aprovado' && a.pct_comissao != null
    ? Number(a.pct_comissao)
    : (a.setor_id != null && pctPorSetor[a.setor_id] != null ? pctPorSetor[a.setor_id] : PIX_AUTO_PCT_PADRAO);
  return Math.round(Number(a.valor) * pct) / 100; // valor × pct ÷ 100, 2 casas
}

/** Valor numérico BR sem "R$" (ex.: 1234.5 → "1.234,50"). */
function valorBR(v: number): string {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Uma linha do "Copiar": só o CÓDIGO do acordo.
 *
 * A linha já trouxe operador, valor, data e comissão. Quem recebe este texto
 * confere código a código e paga o total — a comissão repetida em cada linha só
 * dava ruído e concorria com o total na leitura rápida.
 */
export function formatarLinhaPix(a: Pick<PixAutoAcordo, 'nr_cliente'>): string {
  return a.nr_cliente;
}

/**
 * O texto completo do "Copiar": um código por linha e, no fim, o total da
 * comissão somado.
 *
 * Somar à mão a comissão de doze acordos colados no WhatsApp é onde o erro
 * entra — e o erro aqui é dinheiro pago a menos ou a mais. A soma sai pronta.
 * O total aparece mesmo com um acordo só: é ele que diz quanto pagar, e sem a
 * comissão por linha não haveria valor nenhum no texto.
 */
export function formatarCopiaPix(
  itens: { acordo: Pick<PixAutoAcordo, 'nr_cliente'>; comissao: number }[],
): string {
  if (itens.length === 0) return '';
  const linhas = itens.map(i => formatarLinhaPix(i.acordo));
  const total = itens.reduce((s, i) => s + i.comissao, 0);
  return [...linhas, `R$ ${valorBR(total)}`].join('\n');
}

// ── Acordos ────────────────────────────────────────────────────────────────

/**
 * Acordos Pix da empresa.
 *
 * `setorId` existe porque a RLS de líder é da EMPRESA, não do setor: sem ele, o
 * líder do Receptivo puxava os acordos (e os operadores, e as equipes) de todos
 * os setores. O recorte é pelo setor CARIMBADO na linha — o mesmo critério do
 * filtro da tela —, então quem mudou de setor não leva o histórico junto.
 */
export async function fetchAcordosPix(
  empresaId: string,
  opts?: { operadorId?: string; setorId?: string | null },
): Promise<PixAutoAcordo[]> {
  let q = supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false });
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);
  if (opts?.setorId)    q = q.eq('setor_id', opts.setorId);
  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchAcordosPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoAcordo[]) ?? [];
}

/**
 * Linhas desenhadas por vez na tabela do Pix.
 *
 * A paginação é de EXIBIÇÃO: a consulta traz o conjunto filtrado inteiro e a
 * tabela desenha uma fatia. Não é economia de rede — é economia de DOM, e é o
 * que mantém corretos os números que somam o filtro todo.
 *
 * Paginar no servidor quebraria dois deles: os totais por status e o pago ×
 * a pagar são "sobre o conjunto visível", ou seja, sobre o RECORTE DO FILTRO.
 * Calculados sobre uma página, o líder que filtra por equipe veria o total das
 * 100 linhas abertas achando que é o da equipe.
 */
export const PIX_LINHAS_POR_PAGINA = 100;

/**
 * Edita um registro do operador — só NR e valor, e só enquanto PENDENTE.
 *
 * O `.eq('status', 'pendente')` repete no cliente o que a policy e o gatilho da
 * migration 20260804c já garantem. Não é desconfiança da RLS: é o que faz a
 * tela dizer "este acordo já foi avaliado" em vez de gravar zero linhas em
 * silêncio quando o líder aprovou enquanto o formulário estava aberto.
 */
export async function editarAcordoPix(p: {
  id: string;
  nrCliente: string;
  valor: number;
}): Promise<{ ok: boolean; error?: string }> {
  const nr = p.nrCliente.trim();
  if (!nr) return { ok: false, error: 'Informe o NR do acordo.' };
  if (!Number.isFinite(p.valor) || p.valor <= 0) return { ok: false, error: 'Valor inválido.' };

  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .update({ nr_cliente: nr, valor: p.valor })
    .eq('id', p.id)
    .eq('status', 'pendente')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Este acordo não está mais pendente e não pode ser editado.' };
  }
  return { ok: true };
}

// ── Pagamento da comissão ──────────────────────────────────────────────────

/**
 * Marca (ou desmarca) o pagamento da comissão. Só líder+ — a policy de UPDATE
 * ampla é dele, e o gatilho devolve estas colunas se um operador tentar.
 *
 * Só linha APROVADA pode virar paga: pagar comissão de acordo pendente ou
 * desaprovado é dinheiro saindo por engano, e o `.eq('status','aprovado')`
 * fecha isso mesmo que a tela ofereça o botão por descuido.
 */
export async function marcarComissaoPaga(p: {
  ids: string[];
  pago: boolean;
  responsavelId: string;
  responsavelNome: string;
}): Promise<{ ok: boolean; count: number; error?: string }> {
  if (p.ids.length === 0) return { ok: true, count: 0 };
  const payload: PixAutoAcordoUpdate = p.pago
    ? {
        pago: true,
        pago_em: new Date().toISOString(),
        pago_por: p.responsavelId,
        pago_por_nome: p.responsavelNome,
      }
    : { pago: false, pago_em: null, pago_por: null, pago_por_nome: null };

  let q = supabase
    .from('pix_automatico_acordos')
    .update(payload)
    .in('id', p.ids);
  if (p.pago) q = q.eq('status', 'aprovado');
  const { data, error } = await q.select('id');
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: (data ?? []).length };
}

export async function criarAcordoPix(p: {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
  nrCliente: string;
  valor: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('pix_automatico_acordos').insert({
    empresa_id:    p.empresaId,
    operador_id:   p.operadorId,
    operador_nome: p.operadorNome,
    setor_id:      p.setorId,
    nr_cliente:    p.nrCliente.trim(),
    valor:         p.valor,
    status:        'pendente',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface LinhaPixLote {
  nrCliente: string;
  valor: number;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
}

/**
 * NRs que NÃO podem ser registrados de novo — o bloqueio de verdade.
 *
 * O critério é o do banco (`fn_pix_nr_bloqueia_duplicado` v3, migration
 * 20260811a): **acordo vivo com status `aprovado` E `pago`**. Só o dinheiro que
 * já saiu tranca o NR.
 *
 * Até 20260811a o critério era o registro histórico
 * (`pix_automatico_nr_registro` em 'pendente'/'validado'). Isso trancava NR
 * cujo acordo já tinha sido excluído — foi o que travou o time em 2026-08-11,
 * quando apagaram um registro sem querer e não conseguiram refazê-lo.
 *
 * Quem lê daqui tem de dizer o mesmo que o trigger, senão a tela promete o que
 * o banco recusa (ou pior: o contrário).
 */
export async function fetchNrsBloqueados(empresaId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .select('nr_cliente')
    .eq('empresa_id', empresaId)
    .eq('status', 'aprovado')
    .eq('pago', true);
  if (error) {
    console.warn('[pix_automatico.service] fetchNrsBloqueados:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { nr_cliente: string }[]).map(r => normalizarNr(r.nr_cliente)));
}

/**
 * NRs que já têm um acordo VIVO não descartado (pendente ou aprovado).
 *
 * Não é bloqueio — é dedupe de importação. Depois da 20260811a o banco só
 * recusa `aprovado + pago`, e sem esta lista subir a mesma planilha duas vezes
 * criaria a linha duplicada em silêncio, que é o engano mais fácil de cometer
 * na tela de importar.
 *
 * O registro manual, de uma linha só, segue a regra do banco e não passa por
 * aqui: lá o operador está digitando um NR de cada vez e sabe o que fez.
 */
export async function fetchNrsEmUso(empresaId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .select('nr_cliente')
    .eq('empresa_id', empresaId)
    .neq('status', 'desaprovado');
  if (error) {
    console.warn('[pix_automatico.service] fetchNrsEmUso:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { nr_cliente: string }[]).map(r => normalizarNr(r.nr_cliente)));
}

/** Histórico completo de NRs da empresa (para consulta/ferramentas futuras). */
export async function fetchNrRegistros(empresaId: string): Promise<PixNrRegistro[]> {
  const { data, error } = await supabase
    .from('pix_automatico_nr_registro')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('atualizado_em', { ascending: false })
    .limit(2000);
  if (error) {
    console.warn('[pix_automatico.service] fetchNrRegistros:', error.message);
    return [];
  }
  return (data as unknown as PixNrRegistro[]) ?? [];
}

/**
 * Cria vários acordos Pix de uma vez (importação de planilha).
 *
 * Dedupe por NR: pula o que já tem acordo vivo não descartado (`fetchNrsEmUso`)
 * e o que se repete dentro da própria planilha. É mais apertado que a regra do
 * banco de propósito — ver o comentário de `fetchNrsEmUso`.
 */
export async function criarAcordosPixLote(
  empresaId: string,
  linhas: LinhaPixLote[],
): Promise<{ ok: boolean; importados: number; ignorados: number; duplicados: number; error?: string }> {
  const bloqueados = await fetchNrsEmUso(empresaId);

  let ignorados = 0;
  let duplicados = 0;
  const vistosNoLote = new Set<string>();
  const novos: PixAutoAcordoInsert[] = [];

  for (const l of linhas) {
    const nr = (l.nrCliente ?? '').trim();
    const valor = Number(l.valor);
    if (!nr || !Number.isFinite(valor) || valor <= 0) { ignorados++; continue; }
    const k = normalizarNr(nr);
    if (bloqueados.has(k) || vistosNoLote.has(k)) { duplicados++; continue; }
    vistosNoLote.add(k);
    novos.push({
      empresa_id:    empresaId,
      operador_id:   l.operadorId,
      operador_nome: l.operadorNome,
      setor_id:      l.setorId,
      nr_cliente:    nr,
      valor,
      status:        'pendente',
    });
  }

  if (novos.length === 0) return { ok: true, importados: 0, ignorados, duplicados };

  const { error } = await supabase.from('pix_automatico_acordos').insert(novos);
  if (error) return { ok: false, importados: 0, ignorados, duplicados, error: error.message };
  return { ok: true, importados: novos.length, ignorados, duplicados };
}

/**
 * Aprova ou desaprova. Na aprovação, trava o % vigente do setor na linha
 * (pct_comissao) — mudanças futuras de configuração não alteram o aprovado.
 */
export async function avaliarAcordoPix(p: {
  id: string;
  aprovar: boolean;
  pctAtual: number;
  avaliadorId: string;
  avaliadorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_acordos')
    .update({
      status:            p.aprovar ? 'aprovado' : 'desaprovado',
      pct_comissao:      p.aprovar ? p.pctAtual : null,
      avaliado_por:      p.avaliadorId,
      avaliado_por_nome: p.avaliadorNome,
      avaliado_em:       new Date().toISOString(),
    })
    .eq('id', p.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Volta uma linha avaliada para pendente (correção de engano do líder).
 *
 * Linha PAGA não volta. O pagamento é um fato sobre dinheiro que já saiu, e
 * desde a 20260811a é ele quem tranca o NR — uma linha `pendente` com
 * `pago = true` seria um estado que a regra nova não sabe ler, e nem excluir
 * daria mais para fazer. O caminho é "Desfazer" o pagamento antes.
 *
 * O `.eq('pago', false)` é o que garante isso mesmo se a tela oferecer o botão
 * por descuido; a mensagem existe porque zero linhas afetadas, sozinho, não
 * explica nada a quem clicou.
 */
export async function reavaliarAcordoPix(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .update({ status: 'pendente', pct_comissao: null, avaliado_por: null, avaliado_por_nome: null, avaliado_em: null })
    .eq('id', id)
    .eq('pago', false)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'A comissão deste acordo já foi paga. Desfaça o pagamento antes de voltar para pendente.' };
  }
  return { ok: true };
}

/**
 * Exclui um registro — passando pela lixeira.
 *
 * A ordem é snapshot ANTES do delete, e o delete só acontece se o snapshot
 * entrou. Ao contrário, uma falha ao gravar na lixeira apagaria a linha do
 * mesmo jeito e o operador acharia que tinha como voltar atrás.
 *
 * Foi exatamente o que faltou em 2026-08-10: o delete era direto, um registro
 * se perdeu e o valor não pôde ser recuperado — ele só existia nesta tabela.
 *
 * Linha PAGA não passa daqui. O trigger `trg_pix_a_impede_pago` (20260811a) é
 * quem de fato recusa; parar antes evita gravar na lixeira uma cópia que o
 * delete seguinte vai rejeitar, e devolve a frase certa em vez do texto cru do
 * Postgres.
 */
export async function excluirAcordoPix(
  id: string,
  quem?: { id?: string | null; nome?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { data: linha, error: errLer } = await supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (errLer)  return { ok: false, error: errLer.message };
  if (!linha)  return { ok: false, error: 'Registro não encontrado — recarregue a lista.' };

  const a = linha as unknown as PixAutoAcordo;
  if (a.pago) {
    return {
      ok: false,
      error: 'A comissão deste acordo já foi paga — ele não pode ser excluído. Desfaça o pagamento antes.',
    };
  }

  const { error: errLix } = await supabase.from('lixeira_pix_automatico').insert({
    empresa_id:        a.empresa_id,
    acordo_id:         a.id,
    nr_cliente:        a.nr_cliente,
    valor:             a.valor,
    status:            a.status,
    operador_id:       a.operador_id,
    operador_nome:     a.operador_nome,
    setor_id:          a.setor_id ?? null,
    dados_completos:   a,
    excluido_por:      quem?.id ?? null,
    excluido_por_nome: quem?.nome ?? null,
  } as never);

  if (errLix) {
    return { ok: false, error: `Não foi possível guardar na lixeira: ${errLix.message}` };
  }

  const { error } = await supabase.from('pix_automatico_acordos').delete().eq('id', id);
  if (error) {
    // A cópia ficou na lixeira sem o delete acontecer. Desfaz para a linha não
    // aparecer nos dois lugares — a tela mostraria o registro vivo E na
    // lixeira, e restaurar depois duplicaria o NR.
    await supabase.from('lixeira_pix_automatico').delete().eq('acordo_id', id);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── Lixeira ────────────────────────────────────────────────────────────────

export interface PixLixeiraItem {
  id: string;
  empresa_id: string;
  acordo_id: string;
  nr_cliente: string;
  valor: number;
  status: string;
  operador_id: string | null;
  operador_nome: string | null;
  setor_id: string | null;
  dados_completos: PixAutoAcordo;
  excluido_por: string | null;
  excluido_por_nome: string | null;
  excluido_em: string;
  expira_em: string;
}

/**
 * Itens da lixeira. `operadorId` restringe ao que era daquele operador — a RLS
 * já faz isso para quem não é líder, e passar aqui evita depender só dela para
 * a tela mostrar a coisa certa.
 */
export async function fetchLixeiraPix(
  empresaId: string,
  opts?: { operadorId?: string },
): Promise<PixLixeiraItem[]> {
  let q = supabase
    .from('lixeira_pix_automatico')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('excluido_em', { ascending: false });
  if (opts?.operadorId) q = q.eq('operador_id', opts.operadorId);

  const { data, error } = await q;
  if (error) {
    console.warn('[pix_automatico.service] fetchLixeiraPix:', error.message);
    return [];
  }
  return (data as unknown as PixLixeiraItem[]) ?? [];
}

/**
 * Restaura um item. Vai por RPC porque a volta precisa de três coisas que o
 * cliente não consegue fazer junto: gravar o `status` original (a policy de
 * INSERT exige `pendente`), realinhar o registro de NR, e sair da lixeira na
 * mesma transação. Ver `fn_pix_restaurar_lixeira` na 20260810c.
 */
export async function restaurarItemLixeiraPix(
  itemId: string,
): Promise<{ ok: boolean; acordoId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('fn_pix_restaurar_lixeira', { p_item_id: itemId });
  if (error) {
    const msg = error.message.includes('SEM_PERMISSAO_RESTAURAR')
      ? 'Só líder ou superior pode restaurar registros do Pix automático.'
      : error.message.includes('LIXEIRA_ITEM_NAO_ENCONTRADO')
        ? 'Este item já saiu da lixeira — recarregue a lista.'
        : error.message;
    return { ok: false, error: msg };
  }
  return { ok: true, acordoId: (data as string) ?? undefined };
}

/** Apaga de vez um item da lixeira. */
export async function excluirItemLixeiraPix(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('lixeira_pix_automatico').delete().eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Remove o que passou dos 3 dias de retenção.
 *
 * Chamada ao abrir a lixeira (purga preguiçosa): não existe job agendado, e sem
 * isto o item expirado continuaria listado como se ainda desse para restaurar.
 */
export async function purgarLixeiraPixExpirada(empresaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_pix_lixeira_purgar', { p_empresa_id: empresaId });
  if (error) {
    console.warn('[pix_automatico.service] purgarLixeiraPixExpirada:', error.message);
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * Dias ÚTEIS que um acordo desaprovado sobrevive antes de ser excluído.
 *
 * O operador é avisado por notificação assim que o líder desaprova, e tem esse
 * prazo para conferir o que aconteceu. Passado o prazo, a linha some sozinha e
 * o NR volta a ficar livre — outra pessoa pode fechar o mesmo acordo depois.
 *
 * Fonte única no TypeScript: `prazoExpurgoDesaprovado` (que desenha a data na
 * tela) e o texto da tela importam DAQUI. Quem mostra e quem cumpre o prazo têm
 * de dizer o mesmo número.
 *
 * ⚠️ A outra ponta é SQL e não tem como importar isto: o mesmo `2` está em
 * `fn_pix_expurga_desaprovados` (migration `20260809a`), que é quem de fato
 * apaga. Mudar o prazo exige uma migration nova junto — senão a tela promete um
 * prazo e o banco cumpre outro.
 */
export const PIX_DIAS_UTEIS_EXPURGO = 2;

/**
 * Apaga os desaprovados cujo prazo já venceu e devolve quantos saíram.
 *
 * Chamada ao abrir a tela: não há job agendado neste projeto, e o expurgo
 * precisa acontecer mesmo assim. É idempotente e barata (índice por status), e
 * a policy do banco garante que só líder+ da empresa consegue executar.
 *
 * Migration ausente → devolve 0 sem barulho, no mesmo padrão de
 * `fetchNrsBloqueados`: o recurso some, o resto da tela segue.
 */
export async function expurgarDesaprovadosVencidos(empresaId: string): Promise<number> {
  // `fn_pix_expurga_desaprovados` é da migration 20260809a e ainda não está no
  // database.types.ts gerado — daí o cast.
  //
  // O cast é no CLIENTE e a chamada segue sendo `cliente.rpc(...)`:
  // `SupabaseClient.rpc` faz `return this.rest.rpc(...)`, então guardar o método
  // numa variável perde o `this` e estoura "Cannot read properties of undefined
  // (reading 'rest')" — o mesmo defeito que já tinha derrubado a exclusão de
  // usuário e a foto do setor (a694d7d).
  const cliente = supabase as unknown as {
    rpc: (nome: string, args: Record<string, unknown>) => Promise<{
      data: unknown; error: { message: string } | null;
    }>;
  };

  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    ({ data, error } = await cliente.rpc('fn_pix_expurga_desaprovados', {
      p_empresa_id: empresaId,
    }));
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  if (error) {
    console.warn('[pix_automatico.service] expurgarDesaprovadosVencidos:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

/**
 * Manda para a lixeira todos os DESAPROVADOS do operador
 * (botão "Limpar desaprovados").
 *
 * Passa pela lixeira como o excluir de uma linha só. É o botão que apaga
 * VÁRIAS de uma vez sem confirmação item a item — justamente o que mais
 * precisa de volta atrás.
 *
 * `pago = false` no recorte: desaprovado pago não deveria existir, mas basta
 * um "Pagar" seguido de "Voltar para pendente" de uma versão antiga para uma
 * linha assim ter ficado no banco. Sem o filtro, o trigger recusaria a linha e
 * derrubaria a limpeza INTEIRA (um DELETE, uma transação).
 */
export async function limparDesaprovados(
  empresaId: string,
  operadorId: string,
  quem?: { id?: string | null; nome?: string | null },
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data: linhas, error: errLer } = await supabase
    .from('pix_automatico_acordos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('operador_id', operadorId)
    .eq('status', 'desaprovado')
    .eq('pago', false);

  if (errLer) return { ok: false, count: 0, error: errLer.message };

  const itens = (linhas ?? []) as unknown as PixAutoAcordo[];
  if (!itens.length) return { ok: true, count: 0 };

  const { error: errLix } = await supabase.from('lixeira_pix_automatico').insert(
    itens.map(a => ({
      empresa_id:        a.empresa_id,
      acordo_id:         a.id,
      nr_cliente:        a.nr_cliente,
      valor:             a.valor,
      status:            a.status,
      operador_id:       a.operador_id,
      operador_nome:     a.operador_nome,
      setor_id:          a.setor_id ?? null,
      dados_completos:   a,
      excluido_por:      quem?.id ?? null,
      excluido_por_nome: quem?.nome ?? null,
    })) as never,
  );
  if (errLix) {
    return { ok: false, count: 0, error: `Não foi possível guardar na lixeira: ${errLix.message}` };
  }

  const ids = itens.map(a => a.id);
  const { data, error } = await supabase
    .from('pix_automatico_acordos')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) {
    await supabase.from('lixeira_pix_automatico').delete().in('acordo_id', ids);
    return { ok: false, count: 0, error: error.message };
  }
  return { ok: true, count: (data ?? []).length };
}

// ── Configuração de % por setor ────────────────────────────────────────────

export async function fetchConfigsPix(empresaId: string): Promise<PixAutoConfig[]> {
  const { data, error } = await supabase
    .from('pix_automatico_config')
    .select('*')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[pix_automatico.service] fetchConfigsPix:', error.message);
    return [];
  }
  return (data as unknown as PixAutoConfig[]) ?? [];
}

export async function upsertConfigPix(p: {
  empresaId: string;
  setorId: string;
  pct: number;
  /** Meta de acordos da dobra. Omitido = não mexe no que já está gravado. */
  metaAcordosDobra?: number;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    empresa_id:          p.empresaId,
    setor_id:            p.setorId,
    pct:                 p.pct,
    atualizado_por:      p.atualizadoPor,
    atualizado_por_nome: p.atualizadoPorNome,
    atualizado_em:       new Date().toISOString(),
  };
  // Só entra no upsert quando veio: `undefined` no payload viraria NULL na
  // coluna, e a meta do setor sumiria ao alguém salvar só o percentual.
  if (p.metaAcordosDobra != null) payload.meta_acordos_dobra = p.metaAcordosDobra;

  const { error } = await supabase
    .from('pix_automatico_config')
    .upsert(payload as never, { onConflict: 'empresa_id,setor_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Meta de Pix automático por setor/mês ───────────────────────────────────

export interface PixAutoMeta {
  id: string;
  empresa_id: string;
  setor_id: string;
  /** Equipe dona da meta. null = linha antiga, de quando a meta era do setor. */
  equipe_id: string | null;
  mes: number;
  ano: number;
  /** Meta do VALOR dos acordos Pix do setor no mês (não da comissão). */
  meta_valor: number;
  /** Meta de QUANTIDADE de acordos Pix no mês. 0 = sem meta de quantidade. */
  meta_acordos: number;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Metas de Pix das EQUIPES de um setor no mês.
 *
 * A meta do setor não é digitada: é a soma das metas das equipes (Bryan,
 * Luciana, Matheus…). Por isso a leitura devolve a lista, e quem consolida é
 * quem exibe — guardar o total do setor também deixaria dois números para a
 * mesma verdade, e um deles ficaria velho.
 *
 * Tolera a migration ausente (tabela inexistente → lista vazia), no mesmo
 * padrão de `fetchNrsBloqueados`: o recurso some, o resto da tela segue.
 */
export async function fetchMetasPixEquipes(
  empresaId: string,
  setorId: string,
  mes: number,
  ano: number,
): Promise<PixAutoMeta[]> {
  const { data, error } = await supabase
    .from('pix_automatico_metas')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('setor_id', setorId)
    .eq('mes', mes)
    .eq('ano', ano);
  if (error) {
    console.warn('[pix_automatico.service] fetchMetasPixEquipes:', error.message);
    return [];
  }
  return (data as unknown as PixAutoMeta[]) ?? [];
}

/**
 * Grava a meta de UMA equipe. `metaValor` e `metaAcordos` zerados apagam a
 * linha: meta zero e "sem meta" são coisas diferentes na tela (uma mostra
 * "faltam R$ 0,00", a outra não mostra nada), e é o apagar que devolve a
 * equipe ao estado de "ainda não definida".
 */
export async function upsertMetaPixEquipe(p: {
  empresaId: string;
  setorId: string;
  equipeId: string;
  mes: number;
  ano: number;
  metaValor: number;
  metaAcordos: number;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (p.metaValor <= 0 && p.metaAcordos <= 0) {
    const { error } = await supabase
      .from('pix_automatico_metas')
      .delete()
      .eq('empresa_id', p.empresaId)
      .eq('equipe_id', p.equipeId)
      .eq('mes', p.mes)
      .eq('ano', p.ano);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('pix_automatico_metas')
    .upsert({
      empresa_id:          p.empresaId,
      setor_id:            p.setorId,
      equipe_id:           p.equipeId,
      mes:                 p.mes,
      ano:                 p.ano,
      meta_valor:          p.metaValor,
      meta_acordos:        p.metaAcordos,
      atualizado_por:      p.atualizadoPor,
      atualizado_por_nome: p.atualizadoPorNome,
    }, { onConflict: 'empresa_id,equipe_id,mes,ano' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Liga/desliga o registro manual dos operadores no setor (interruptor). */
export async function setPermiteRegistroOperador(p: {
  empresaId: string;
  setorId: string;
  permite: boolean;
  atualizadoPor: string;
  atualizadoPorNome: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('pix_automatico_config')
    .upsert({
      empresa_id:                p.empresaId,
      setor_id:                  p.setorId,
      permite_registro_operador: p.permite,
      atualizado_por:            p.atualizadoPor,
      atualizado_por_nome:       p.atualizadoPorNome,
      atualizado_em:             new Date().toISOString(),
    }, { onConflict: 'empresa_id,setor_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
