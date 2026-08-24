/**
 * rhGestao.service.ts — a camada de acesso do RH Gestão.
 *
 * ## Leitura direta, escrita por RPC
 *
 * As consultas são `select` comum: a RLS já recorta o que cada pessoa enxerga
 * (`fn_rh_lancamento_visivel`), então repetir o filtro aqui só criaria uma
 * segunda régua para divergir da primeira.
 *
 * Toda ESCRITA passa por RPC, e nenhuma tabela do fluxo tem policy de INSERT,
 * UPDATE ou DELETE. Dois motivos:
 *
 *   • cada passo mexe em várias linhas e precisa de todas ou de nenhuma —
 *     concluir uma equipe congela o percentual de N pessoas e muda o status
 *     das N;
 *   • a RPC confere permissão, escopo E estado atual antes de agir, então
 *     chamar com o id de outra equipe encontra a mesma recusa que a tela.
 *
 * ## As mensagens de erro
 *
 * O banco levanta exceções com prefixo (`RH_PENDENTES:`, `RH_FORA_DO_ESCOPO:`).
 * `mensagemRh` traduz cada uma para uma frase que diz o próximo passo — o texto
 * cru do Postgres não ajuda ninguém a resolver.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { StatusLancamento } from './rhEstados';

type Tabelas = Database['public']['Tables'];

export type RhCelulaRow      = Tabelas['rh_celulas']['Row'];
export type RhConfigSetorRow = Tabelas['rh_config_setores']['Row'];
export type RhFechamentoRow  = Tabelas['rh_fechamentos']['Row'];
export type RhEventoRow      = Tabelas['rh_eventos']['Row'];

/**
 * Um lançamento como a tela consome, com o status já estreitado.
 *
 * As quatro colunas de dispensa vêm da migration `20260823200000` e ainda não
 * estão em `database.types.ts`, que é gerado do banco. Opcionais de propósito:
 * enquanto a migration não é aplicada, o campo chega `undefined` e a tela lê
 * isso como «não dispensado», que é o comportamento de antes.
 */
export interface RhLancamento extends Omit<Tabelas['rh_lancamentos']['Row'], 'status'> {
  status: StatusLancamento;
  /** Fora da folha desta competência. Diferente de `valor = 0`. */
  dispensado?: boolean | null;
  motivo_dispensa?: string | null;
  dispensado_por?: string | null;
  dispensado_por_nome?: string | null;
}

export interface RhResultado<T> {
  ok: boolean;
  dados?: T;
  erro?: string;
}

// ── Tradução de erro ─────────────────────────────────────────────────────────

/**
 * A frase que a tela mostra quando o banco recusa.
 *
 * Cada `RAISE EXCEPTION` das RPCs já carrega a explicação depois dos dois
 * pontos; o que falta é tirar o prefixo técnico e o ruído do driver. Quando o
 * prefixo não é conhecido, devolve a mensagem inteira — inventar um texto
 * genérico esconderia justamente o caso que ninguém previu.
 */
export function mensagemRh(bruta: string): string {
  const m = /RH_[A-Z_]+:\s*(.+)$/s.exec(bruta);
  if (m) return m[1].trim();
  if (/function|does not exist|schema cache/i.test(bruta)) {
    return 'O módulo RH Gestão ainda não está disponível neste banco.';
  }
  if (/permission denied|row-level security/i.test(bruta)) {
    return 'Você não tem acesso a este registro.';
  }
  return bruta;
}

async function chamar<T>(
  nome: string, args: Record<string, unknown>,
): Promise<RhResultado<T>> {
  // O cast existe porque `rpc` é tipada por união de nomes e este helper é
  // genérico de propósito — cada função exportada abaixo tem a assinatura certa.
  const { data, error } = await (supabase.rpc as unknown as (
    n: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(nome, args);

  if (error) return { ok: false, erro: mensagemRh(error.message) };
  return { ok: true, dados: data as T };
}

// ── Configuração ─────────────────────────────────────────────────────────────

export async function listarCelulas(empresaId: string): Promise<RhCelulaRow[]> {
  const { data, error } = await supabase
    .from('rh_celulas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('ordem')
    .order('nome');
  if (error) {
    console.warn('[rhGestao] listarCelulas:', error.message);
    return [];
  }
  return data ?? [];
}

export async function listarConfigSetores(empresaId: string): Promise<RhConfigSetorRow[]> {
  const { data, error } = await supabase
    .from('rh_config_setores')
    .select('*')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[rhGestao] listarConfigSetores:', error.message);
    return [];
  }
  return data ?? [];
}

/** Cria ou renomeia uma cidade/célula. */
export async function salvarCelula(p: {
  id?: string; empresaId: string; nome: string; ordem: number;
}): Promise<RhResultado<RhCelulaRow>> {
  const payload = {
    ...(p.id ? { id: p.id } : {}),
    empresa_id: p.empresaId, nome: p.nome.trim(), ordem: p.ordem,
  };
  const { data, error } = await supabase
    .from('rh_celulas')
    .upsert(payload, { onConflict: 'empresa_id,nome' })
    .select('*')
    .single();
  if (error) return { ok: false, erro: mensagemRh(error.message) };
  return { ok: true, dados: data };
}

/**
 * Liga um setor ao RH, com cidade e tipo de remuneração.
 *
 * É esta linha que substitui o `if (setor === 'Play 4')` que o pedido proíbe:
 * a tela pergunta ao setor qual é o tipo, e o setor responde pela configuração.
 */
export async function salvarConfigSetor(p: {
  empresaId: string; setorId: string; celulaId: string;
  tipoRemuneracao: 'premiacao' | 'comissao'; ativo: boolean;
  autorId: string; autorNome: string;
}): Promise<RhResultado<RhConfigSetorRow>> {
  const { data, error } = await supabase
    .from('rh_config_setores')
    .upsert({
      empresa_id: p.empresaId, setor_id: p.setorId, celula_id: p.celulaId,
      tipo_remuneracao: p.tipoRemuneracao, ativo: p.ativo,
      atualizado_por: p.autorId, atualizado_por_nome: p.autorNome,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,setor_id' })
    .select('*')
    .single();
  if (error) return { ok: false, erro: mensagemRh(error.message) };
  return { ok: true, dados: data };
}

// ── Competência ──────────────────────────────────────────────────────────────

export async function listarFechamentos(empresaId: string): Promise<RhFechamentoRow[]> {
  const { data, error } = await supabase
    .from('rh_fechamentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('competencia', { ascending: false })
    .limit(36);
  if (error) {
    console.warn('[rhGestao] listarFechamentos:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Abre a competência e semeia os lançamentos.
 *
 * Repetível: chamar de novo acrescenta quem entrou depois e não toca em quem já
 * está lá. É o que permite ao RH clicar «atualizar pessoas» sem medo de apagar
 * valor digitado.
 */
export async function abrirCompetencia(p: {
  empresaId: string;
  /** `yyyy-MM` — o rótulo da folha. */
  competencia: string;
  /** `yyyy-MM` do desempenho conferido. Omitido = o mês anterior. */
  mesApuracao?: string | null;
  /** `yyyy-MM-dd`. */
  prazo?: string | null;
}): Promise<RhResultado<RhFechamentoRow>> {
  return chamar<RhFechamentoRow>('fn_rh_abrir_competencia', {
    p_empresa_id:   p.empresaId,
    p_competencia:  `${p.competencia}-01`,
    p_mes_apuracao: p.mesApuracao ? `${p.mesApuracao}-01` : null,
    p_prazo:        p.prazo ?? null,
  });
}

export async function definirPrazo(p: {
  fechamentoId: string; prazo: string | null; motivo?: string | null;
}): Promise<RhResultado<RhFechamentoRow>> {
  return chamar<RhFechamentoRow>('fn_rh_definir_prazo', {
    p_fechamento_id: p.fechamentoId,
    p_prazo:  p.prazo,
    p_motivo: p.motivo ?? null,
  });
}

export async function finalizarCompetencia(
  fechamentoId: string,
): Promise<RhResultado<RhFechamentoRow>> {
  return chamar<RhFechamentoRow>('fn_rh_finalizar_competencia', {
    p_fechamento_id: fechamentoId,
  });
}

export async function reabrirCompetencia(
  fechamentoId: string, motivo: string,
): Promise<RhResultado<RhFechamentoRow>> {
  return chamar<RhFechamentoRow>('fn_rh_reabrir_competencia', {
    p_fechamento_id: fechamentoId, p_motivo: motivo,
  });
}

// ── Lançamentos ──────────────────────────────────────────────────────────────

/**
 * Os lançamentos de uma competência que a pessoa enxerga.
 *
 * Sem filtro de escopo aqui, de propósito: a RLS já recorta, e um filtro no
 * cliente seria uma segunda régua para divergir. O líder recebe os operadores
 * das equipes que lidera; a gerência, o setor; o RH, a empresa.
 */
export async function listarLancamentos(fechamentoId: string): Promise<RhLancamento[]> {
  const { data, error } = await supabase
    .from('rh_lancamentos')
    .select('*')
    .eq('fechamento_id', fechamentoId)
    .order('setor_nome_snapshot')
    .order('equipe_nome_snapshot')
    .order('nome_snapshot');
  if (error) {
    console.warn('[rhGestao] listarLancamentos:', error.message);
    return [];
  }
  return (data ?? []) as RhLancamento[];
}

export async function salvarLancamento(p: {
  lancamentoId: string; valor: number; observacao?: string | null;
}): Promise<RhResultado<RhLancamento>> {
  return chamar<RhLancamento>('fn_rh_salvar_lancamento', {
    p_lancamento_id: p.lancamentoId,
    p_valor: p.valor,
    p_observacao: p.observacao ?? null,
  });
}

/**
 * Congela percentual, meta e recebido de um lançamento.
 *
 * O número vem do cliente porque `calcularProjecao` é a única definição de
 * «181%» no projeto — ver `rhPercentual.ts`. O banco recusa depois que a
 * gerência validou: a fotografia conferida não pode ser trocada por baixo.
 */
export async function congelarPercentual(p: {
  lancamentoId: string; percentual: number; meta: number; recebido: number;
}): Promise<RhResultado<RhLancamento>> {
  return chamar<RhLancamento>('fn_rh_congelar_percentual', {
    p_lancamento_id: p.lancamentoId,
    p_percentual: p.percentual,
    p_meta: p.meta,
    p_recebido: p.recebido,
  });
}

// ── Transições ───────────────────────────────────────────────────────────────

/*
 * `equipeId` aceita `null` — é o balde «Sem equipe».
 *
 * `perfis.equipe_id` é opcional e a semeadura traz todo mundo do setor
 * configurado: líder sem equipe própria, gerente, recém-admitido. Essas linhas
 * nascem com `equipe_id_snapshot` nulo.
 *
 * Até a migration `20260824120000` as RPCs comparavam com `=`, e em SQL
 * `NULL = NULL` não é verdadeiro — nenhuma linha era encontrada. O balde ficava
 * eternamente pendente e travava o setor inteiro, porque `fn_rh_enviar_setor`
 * exige TODOS os lançamentos do setor validados.
 */
export async function concluirEquipe(
  fechamentoId: string, equipeId: string | null,
): Promise<RhResultado<number>> {
  return chamar<number>('fn_rh_concluir_equipe', {
    p_fechamento_id: fechamentoId, p_equipe_id: equipeId,
  });
}

export async function validarEquipe(
  fechamentoId: string, equipeId: string | null,
): Promise<RhResultado<number>> {
  return chamar<number>('fn_rh_validar_equipe', {
    p_fechamento_id: fechamentoId, p_equipe_id: equipeId,
  });
}

export async function enviarSetor(
  fechamentoId: string, setorId: string,
): Promise<RhResultado<number>> {
  return chamar<number>('fn_rh_enviar_setor', {
    p_fechamento_id: fechamentoId, p_setor_id: setorId,
  });
}

export async function aprovarOperador(
  lancamentoId: string,
): Promise<RhResultado<RhLancamento>> {
  return chamar<RhLancamento>('fn_rh_aprovar_operador', { p_lancamento_id: lancamentoId });
}

export async function aprovarEquipe(
  fechamentoId: string, equipeId: string | null,
): Promise<RhResultado<number>> {
  return chamar<number>('fn_rh_aprovar_equipe', {
    p_fechamento_id: fechamentoId, p_equipe_id: equipeId,
  });
}

export async function devolverOperador(
  lancamentoId: string, motivo: string,
): Promise<RhResultado<RhLancamento>> {
  if (!motivo.trim()) return { ok: false, erro: 'Informe o motivo da devolução.' };
  return chamar<RhLancamento>('fn_rh_devolver_operador', {
    p_lancamento_id: lancamentoId, p_motivo: motivo.trim(),
  });
}

export async function devolverEquipe(
  fechamentoId: string, equipeId: string | null, motivo: string,
): Promise<RhResultado<number>> {
  if (!motivo.trim()) return { ok: false, erro: 'Informe o motivo da devolução.' };
  return chamar<number>('fn_rh_devolver_equipe', {
    p_fechamento_id: fechamentoId, p_equipe_id: equipeId, p_motivo: motivo.trim(),
  });
}

/**
 * Marca (ou desmarca) o operador como fora da folha desta competência.
 *
 * Não é lançar zero: zero é «conferi e deu zero», e é pago como zero. Fora da
 * folha é «não há o que pagar» — não atingiu, entrou no meio do mês, esteve
 * afastado. O motivo é obrigatório ao dispensar, e fica registrado com o autor.
 *
 * O efeito prático: `fn_rh_concluir_equipe` deixa de exigir valor dessa linha,
 * e a equipe fecha sem ninguém ter digitado um zero que viraria pagamento.
 */
export async function dispensarOperador(
  lancamentoId: string, dispensado: boolean, motivo?: string,
): Promise<RhResultado<RhLancamento>> {
  if (dispensado && !(motivo ?? '').trim()) {
    return { ok: false, erro: 'Informe por que este operador fica fora da folha.' };
  }
  return chamar<RhLancamento>('fn_rh_dispensar_operador', {
    p_lancamento_id: lancamentoId,
    p_dispensado:    dispensado,
    p_motivo:        dispensado ? (motivo ?? '').trim() : null,
  });
}

// ── Crachá ───────────────────────────────────────────────────────────────────

export interface RhCracha {
  operador_id: string;
  cracha: string | null;
}

/**
 * Crachás que a pessoa pode ver.
 *
 * A RLS de `rh_dados_operadores` é a mais estreita do módulo: só quem enxerga
 * aquela pessoa no escopo do RH — e a própria pessoa. Fora do módulo, ninguém
 * consulta esta tabela, e é por isso que o crachá não aparece nas outras telas.
 */
export async function listarCrachas(empresaId: string): Promise<RhCracha[]> {
  const { data, error } = await supabase
    .from('rh_dados_operadores')
    .select('operador_id, cracha')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[rhGestao] listarCrachas:', error.message);
    return [];
  }
  return data ?? [];
}

export async function salvarCracha(p: {
  empresaId: string; operadorId: string; cracha: string | null;
}): Promise<RhResultado<{ cracha: string | null }>> {
  return chamar<{ cracha: string | null }>('fn_rh_salvar_cracha', {
    p_empresa_id: p.empresaId,
    p_operador_id: p.operadorId,
    p_cracha: p.cracha?.trim() || null,
  });
}

// ── Trilha ───────────────────────────────────────────────────────────────────

/** Quantos eventos a tela mostra de uma vez. */
export const RH_EVENTOS_LIMITE = 300;

export async function listarEventos(
  fechamentoId: string, opts?: { lancamentoId?: string; limite?: number },
): Promise<RhEventoRow[]> {
  let q = supabase
    .from('rh_eventos')
    .select('*')
    .eq('fechamento_id', fechamentoId)
    .order('criado_em', { ascending: false })
    .limit(opts?.limite ?? RH_EVENTOS_LIMITE);
  if (opts?.lancamentoId) q = q.eq('lancamento_id', opts.lancamentoId);

  const { data, error } = await q;
  if (error) {
    console.warn('[rhGestao] listarEventos:', error.message);
    return [];
  }
  return data ?? [];
}
