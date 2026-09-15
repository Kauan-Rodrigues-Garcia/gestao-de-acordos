/**
 * acompanhamento.service.ts — feedback e ausências, o que a aba lê e grava.
 *
 * Leitura direta nas tabelas, escrita só por RPC — mesmo desenho de `vendas` e
 * `indicacoes`. A lista de pessoas é RPC porque junta equipe pela liderança,
 * ausência de hoje e resumo de feedback numa ida só.
 *
 * ## O alcance é do banco, e é um só
 *
 * `fn_acompanhamento_alcancados` decide quem aparece — nas duas policies, nas
 * RPCs de escrita e na lista de pessoas. A tela só ESTREITA dentro disso (o
 * seletor de nível), nunca amplia.
 *
 * ## Feedback sem `ver_feedbacks` não é erro
 *
 * A policy entrega zero linhas, e a lista de pessoas traz `feedbacks` nulo.
 * Nulo quer dizer «não é para você», e zero quer dizer «ninguém escreveu» — a
 * tela precisa distinguir os dois, então o tipo preserva a diferença.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { mensagemDoErro, pareceNaoInstalado } from './erroDoBanco';

const MIGRATION = '20260915220000_vendas_fase8_feedback_e_ausencias.sql';

export interface Resultado<T = null> {
  ok: boolean;
  dado: T | null;
  erro: string | null;
}

function traduzir(mensagem: string): string {
  return mensagemDoErro(mensagem, 'A aba Acompanhamento', MIGRATION);
}

function numOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

function textoOuNulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

/* ── Pessoas ─────────────────────────────────────────────────────────────── */

export interface PessoaAcompanhada {
  id: string;
  nome: string;
  foto_url: string | null;
  cargo: string;
  situacao: string;
  ferias_ate: string | null;
  setor_id: string | null;
  setor_nome: string | null;
  /** A equipe que CREDITA — a que o líder lidera, não `perfis.equipe_id`. */
  equipe_id: string | null;
  equipe_nome: string | null;
  /** `null` = sem `ver_feedbacks`. `0` = ninguém escreveu. */
  feedbacks: number | null;
  ultimo_feedback: string | null;
  /** Tipo da ausência que cobre hoje, se houver. */
  ausente_hoje: string | null;
  ausente_ate: string | null;
}

export interface PessoasDoAlcance {
  pessoas: PessoaAcompanhada[];
  /** `false` enquanto a migration não for aplicada. A tela avisa em vez de gritar. */
  disponivel: boolean;
  erro: string | null;
}

export async function buscarPessoas(empresaId: string): Promise<PessoasDoAlcance> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_acompanhamento_pessoas', { p_empresa_id: empresaId },
  );

  if (error) {
    return {
      pessoas: [],
      disponivel: !pareceNaoInstalado(error.message),
      erro: traduzir(error.message),
    };
  }

  const pessoas = (Array.isArray(data) ? data : []).map((l): PessoaAcompanhada => ({
    id:              String(l.id),
    nome:            String(l.nome ?? '—'),
    foto_url:        textoOuNulo(l.foto_url),
    cargo:           String(l.cargo ?? ''),
    situacao:        String(l.situacao ?? 'ativo'),
    ferias_ate:      textoOuNulo(l.ferias_ate),
    setor_id:        textoOuNulo(l.setor_id),
    setor_nome:      textoOuNulo(l.setor_nome),
    equipe_id:       textoOuNulo(l.equipe_id),
    equipe_nome:     textoOuNulo(l.equipe_nome),
    feedbacks:       numOuNulo(l.feedbacks),
    ultimo_feedback: textoOuNulo(l.ultimo_feedback),
    ausente_hoje:    textoOuNulo(l.ausente_hoje),
    ausente_ate:     textoOuNulo(l.ausente_ate),
  }));

  return { pessoas, disponivel: true, erro: null };
}

/* ── Feedback ────────────────────────────────────────────────────────────── */

export interface Feedback {
  id: string;
  empresa_id: string;
  operador_id: string;
  autor_id: string | null;
  /** Congelado na gravação: a RLS de `perfis` pode não mostrar a autora a quem lê. */
  autor_nome: string;
  data_feedback: string;
  texto: string;
  criado_em: string;
  atualizado_em: string;
}

const COLUNAS_FEEDBACK =
  'id, empresa_id, operador_id, autor_id, autor_nome, data_feedback, texto, criado_em, atualizado_em';

export async function buscarFeedbacks(operadorId: string): Promise<Resultado<Feedback[]>> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('feedbacks')
    .select(COLUNAS_FEEDBACK)
    .eq('operador_id', operadorId)
    .order('data_feedback', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: (data ?? []) as unknown as Feedback[], erro: null };
}

export async function salvarFeedback(params: {
  /** Nulo cria; preenchido corrige (só o autor). */
  id: string | null;
  empresaId: string;
  operadorId: string;
  data: string;
  texto: string;
}): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_feedback_salvar', {
    p_id:            params.id,
    p_empresa_id:    params.empresaId,
    p_operador_id:   params.operadorId,
    p_data_feedback: params.data,
    p_texto:         params.texto,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}

export async function excluirFeedback(id: string): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_feedback_excluir', { p_id: id });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}

/* ── Ausências ───────────────────────────────────────────────────────────── */

export interface Ausencia {
  id: string;
  empresa_id: string;
  operador_id: string;
  tipo: string;
  inicio: string;
  fim: string;
  meio_periodo: boolean;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

const COLUNAS_AUSENCIA =
  'id, empresa_id, operador_id, tipo, inicio, fim, meio_periodo, observacao, criado_em, atualizado_em';

export async function buscarAusencias(operadorId: string): Promise<Resultado<Ausencia[]>> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('ausencias')
    .select(COLUNAS_AUSENCIA)
    .eq('operador_id', operadorId)
    .order('inicio', { ascending: false });

  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: (data ?? []) as unknown as Ausencia[], erro: null };
}

export async function salvarAusencia(params: {
  /** Nulo lança; preenchido corrige. */
  id: string | null;
  empresaId: string;
  operadorId: string;
  tipo: string;
  inicio: string;
  fim: string;
  meioPeriodo: boolean;
  observacao: string;
}): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_ausencia_salvar', {
    p_id:           params.id,
    p_empresa_id:   params.empresaId,
    p_operador_id:  params.operadorId,
    p_tipo:         params.tipo,
    p_inicio:       params.inicio,
    p_fim:          params.fim,
    p_meio_periodo: params.meioPeriodo,
    p_observacao:   params.observacao,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}

export async function excluirAusencia(id: string): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_ausencia_excluir', { p_id: id });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}
