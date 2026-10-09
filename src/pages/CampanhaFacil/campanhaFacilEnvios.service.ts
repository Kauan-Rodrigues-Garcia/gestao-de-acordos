/**
 * Campanha Fácil — liberar a campanha para os operadores, e o histórico.
 *
 * O líder marca quem encaminha; cada um recebe uma notificação e encontra a
 * parte dele na aba Campanhas de WhatsApp, uma linha por mensagem.
 *
 * Desde 20261007190000 cada liberação é uma CAMPANHA (`campanha_facil_lotes`),
 * que fica no histórico do líder depois de vencer — com o placar por operador
 * congelado. A campanha pode ser desativada (some na hora para os operadores),
 * editada (mensagem e quem recebe), relançada e excluída. Quem grava envio é o
 * banco, pelas funções `fn_campanha_facil_*`: o INSERT direto em
 * `campanha_facil_envios` dava 403 para quem libera numa empresa que não é a
 * de casa.
 *
 * Ver `envios.ts` para a parte pura (repartir, repassar, redistribuir).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  repartirRepasse,
  type ContatoEnvio, type MensagemDaCampanha, type OperadorCampanha, type ParteRedistribuida,
} from './envios';
import { COLUNAS_SETOR_DO_FILTRO, listaDoFiltroDeSetores } from '@/lib/setoresDosFiltros';

/** As tabelas nasceram depois dos tipos gerados — mesmo recurso do numeros.service. */
const db = supabase as unknown as SupabaseClient;

/** Quanto tempo a campanha fica na aba do operador. Espelha a migration. */
export const DIAS_VALIDADE_ENVIO = 2;

/** Mensagens por pedido ao gravar: a campanha inteira num corpo só passa do limite. */
const LOTE_GRAVAR = 500;
/** Ids por `in(...)`: a lista vai na URL. */
const LOTE_IDS = 150;
/** O PostgREST devolve no máximo 1000 linhas por pedido. */
const PAGINA = 1000;

function emPedacos<T>(lista: readonly T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho));
  return out;
}

/** O texto do erro do banco (as funções levantam mensagens para a tela). */
export function mensagemDoErro(err: unknown, padrao: string): string {
  const msg = (err as { message?: unknown } | null)?.message;
  if (typeof msg !== 'string' || !msg.trim()) return padrao;
  // Erro técnico (RLS, rede) não serve à pessoa: fica o padrão.
  if (/row-level security|violates|fetch|network|JWT|permission denied/i.test(msg)) return padrao;
  return msg;
}

// ── Quem pode receber ────────────────────────────────────────────────────────

/**
 * Operadores ativos do setor, com os clones dele.
 *
 * O setor alternativo (Treinamento) vive de clones: o operador mantém o
 * `setor_id` de origem e entra no setor pela `equipe_operadores_clones`. Ler só
 * `perfis.setor_id` deixaria o líder desse setor sem ninguém para marcar — o
 * mesmo defeito que o Pix Automático teve em 22/09/2026.
 */
export async function listarOperadoresParaCampanha(
  empresaId: string, setorId: string,
): Promise<OperadorCampanha[]> {
  const [{ data: doSetor, error: e1 }, { data: equipes, error: e2 }] = await Promise.all([
    supabase.from('perfis').select('id, nome')
      .eq('empresa_id', empresaId).eq('setor_id', setorId)
      .eq('perfil', 'operador').eq('ativo', true),
    supabase.from('equipes').select('id').eq('empresa_id', empresaId).eq('setor_id', setorId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const lista = new Map<string, OperadorCampanha>();
  for (const p of (doSetor ?? []) as OperadorCampanha[]) lista.set(p.id, p);

  const equipeIds = ((equipes ?? []) as { id: string }[]).map(e => e.id);
  if (equipeIds.length > 0) {
    const { data: clones, error: e3 } = await supabase.from('equipe_operadores_clones')
      .select('operador_id').eq('empresa_id', empresaId).in('equipe_id', equipeIds);
    if (e3) throw e3;
    const faltando = [...new Set(((clones ?? []) as { operador_id: string }[])
      .map(c => c.operador_id).filter(id => !lista.has(id)))];
    if (faltando.length > 0) {
      // Da mesma empresa: o envio só aceita operador da empresa da campanha.
      const { data: perfisClones, error: e4 } = await supabase.from('perfis').select('id, nome')
        .in('id', faltando).eq('empresa_id', empresaId).eq('perfil', 'operador').eq('ativo', true);
      if (e4) throw e4;
      for (const p of (perfisClones ?? []) as OperadorCampanha[]) lista.set(p.id, p);
    }
  }
  return [...lista.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Setores da empresa, para quem não é preso a um (gerência para cima). */
export async function listarSetoresParaCampanha(
  empresaId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO)
    .eq('empresa_id', empresaId).order('nome');
  if (error) throw error;
  // Sem inativo e sem setor de sistema — ver `lib/setoresDosFiltros`.
  return listaDoFiltroDeSetores(
    (data ?? []) as unknown as { id: string; nome: string; ativo: boolean; tipo: string | null }[],
  );
}

// ── Liberar ──────────────────────────────────────────────────────────────────

interface ParteEnvio { operador: OperadorCampanha; contatos: ContatoEnvio[] }

/** Um envio por operador, pelo banco. Devolve operador → envio. */
async function criarEnvios(
  loteId: string, partes: readonly ParteEnvio[], repasse: boolean,
): Promise<Map<string, string>> {
  const { data, error } = await db.rpc('fn_campanha_facil_envios_criar', {
    p_lote: loteId,
    p_partes: partes.map(p => ({
      operador_id: p.operador.id, operador_nome: p.operador.nome, qtd: p.contatos.length,
    })),
    p_repasse: repasse,
  });
  if (error) throw error;
  return new Map(((data ?? []) as { operador: string; envio: string }[]).map(r => [r.operador, r.envio]));
}

/** As mensagens de cada operador, em pedaços. */
async function gravarContatos(partes: readonly ParteEnvio[], envioPorOperador: Map<string, string>): Promise<void> {
  for (const p of partes) {
    const envioId = envioPorOperador.get(p.operador.id);
    if (!envioId) throw new Error(`O envio de ${p.operador.nome} não foi criado.`);
    for (const pedaco of emPedacos(p.contatos, LOTE_GRAVAR)) {
      const { error } = await db.from('campanha_facil_contatos')
        .insert(pedaco.map(c => ({ ...c, envio_id: envioId })));
      if (error) throw error;
    }
  }
}

/**
 * Cria a campanha (desativada), grava um envio e as mensagens de cada
 * operador e só então lança — o lançamento avisa cada um.
 *
 * Se algo falhar no meio, a campanha inteira é apagada: metade da equipe com
 * campanha e metade sem é pior do que o líder tentar de novo.
 */
export async function liberarCampanha(p: {
  empresaId: string;
  setorId: string | null;
  titulo: string;
  arquivoNome: string;
  /** O modelo com as variáveis — permite editar a mensagem depois. */
  modelo: string;
  semValores: boolean;
  partes: ParteEnvio[];
}): Promise<number> {
  const total = p.partes.reduce((s, x) => s + x.contatos.length, 0);
  const { data, error } = await db.rpc('fn_campanha_facil_lote_criar', {
    p: {
      empresa_id: p.empresaId, setor_id: p.setorId, titulo: p.titulo, arquivo_nome: p.arquivoNome,
      modelo: p.modelo, sem_valores: p.semValores, total,
    },
  });
  if (error) throw error;
  const loteId = data as string;

  try {
    await gravarContatos(p.partes, await criarEnvios(loteId, p.partes, false));
    const { error: eA } = await db.rpc('fn_campanha_facil_lote_ativar', { p_lote: loteId, p_ativa: true });
    if (eA) throw eA;
  } catch (err) {
    await db.rpc('fn_campanha_facil_lote_excluir', { p_lote: loteId });
    throw err;
  }
  return p.partes.length;
}

// ── O histórico ──────────────────────────────────────────────────────────────

export interface PlacarOperador {
  operador_id: string;
  nome: string;
  total: number;
  enviados: number;
  nao_enviados: number;
}

export interface LoteCampanha {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  setor_nome: string | null;
  titulo: string;
  arquivo_nome: string;
  modelo: string | null;
  sem_valores: boolean;
  total: number;
  ativa: boolean;
  lancada_em: string | null;
  desativada_em: string | null;
  relancada_em: string | null;
  editada_em: string | null;
  criado_em: string;
  expira_em: string;
  encerrada_em: string | null;
  /** Congelado quando a campanha encerra; antes disso, é ao vivo (`placarDoLote`). */
  placar: PlacarOperador[] | null;
  /** Quantos operadores votaram que o retorno foi bom / que não deu (20261009150000). */
  votos_bom: number;
  votos_ruim: number;
}

export type SituacaoLote = 'ativa' | 'desativada' | 'encerrada';

export function situacaoDoLote(l: Pick<LoteCampanha, 'ativa' | 'encerrada_em'>): SituacaoLote {
  if (l.encerrada_em) return 'encerrada';
  return l.ativa ? 'ativa' : 'desativada';
}

const COLUNAS_LOTE =
  'id, empresa_id, setor_id, setor_nome, titulo, arquivo_nome, modelo, sem_valores, total, ativa, '
  + 'lancada_em, desativada_em, relancada_em, editada_em, criado_em, expira_em, encerrada_em, placar, '
  + 'votos_bom, votos_ruim';

/** As campanhas que ESTE líder lançou, da mais nova para a mais antiga. */
export async function listarHistorico(autorId: string): Promise<LoteCampanha[]> {
  const todos: LoteCampanha[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from('campanha_facil_lotes')
      .select(COLUNAS_LOTE)
      .eq('criado_por', autorId).not('lancada_em', 'is', null)
      .order('criado_em', { ascending: false })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as unknown as LoteCampanha[]));
    if ((data ?? []).length < PAGINA) break;
  }
  return todos;
}

export interface Progresso { total: number; enviados: number; nao_enviados: number }

export interface EnvioResumo {
  id: string;
  lote_id: string;
  setor_id: string | null;
  operador_id: string;
  operador_nome: string;
  titulo: string;
  arquivo_nome: string;
  qtd: number;
  repasse: boolean;
  ativa: boolean;
  criado_em: string;
  expira_em: string;
  criado_por_nome?: string | null;
  /** Do banco (`fn_campanha_facil_progresso`). */
  progresso: Progresso;
}

const COLUNAS_ENVIO =
  'id, lote_id, setor_id, operador_id, operador_nome, titulo, arquivo_nome, qtd, repasse, ativa, criado_em, expira_em, criado_por_nome';

/** Junta o progresso de cada envio. Sem resposta do banco, fica zerado. */
async function comProgresso(envios: Omit<EnvioResumo, 'progresso'>[]): Promise<EnvioResumo[]> {
  const mapa = new Map<string, Progresso>();
  for (const ids of emPedacos(envios.map(e => e.id), 500)) {
    const { data, error } = await db.rpc('fn_campanha_facil_progresso', { p_envios: ids });
    if (error) { console.warn('[campanhaFacilEnvios] progresso:', error.message); break; }
    for (const r of (data ?? []) as ({ envio_id: string } & Progresso)[]) {
      mapa.set(r.envio_id, { total: r.total, enviados: r.enviados, nao_enviados: r.nao_enviados });
    }
  }
  return envios.map(e => ({ ...e, progresso: mapa.get(e.id) ?? { total: 0, enviados: 0, nao_enviados: 0 } }));
}

/** Os envios de uma campanha ainda aberta, com o andamento de cada um. */
export async function enviosDoLote(loteId: string): Promise<EnvioResumo[]> {
  const { data, error } = await db.from('campanha_facil_envios')
    .select(COLUNAS_ENVIO).eq('lote_id', loteId).order('criado_em');
  if (error) throw error;
  return comProgresso((data ?? []) as Omit<EnvioResumo, 'progresso'>[]);
}

/** Um por operador, somando o original e os repasses. */
export function placarDosEnvios(envios: readonly EnvioResumo[]): (PlacarOperador & { repasse: boolean })[] {
  const mapa = new Map<string, PlacarOperador & { repasse: boolean }>();
  for (const e of envios) {
    const atual = mapa.get(e.operador_id)
      ?? { operador_id: e.operador_id, nome: e.operador_nome, total: 0, enviados: 0, nao_enviados: 0, repasse: false };
    atual.total += e.progresso.total;
    atual.enviados += e.progresso.enviados;
    atual.nao_enviados += e.progresso.nao_enviados;
    atual.repasse ||= e.repasse;
    mapa.set(e.operador_id, atual);
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** As campanhas que chegaram PARA esta pessoa — a aba Campanhas de WhatsApp. */
export async function listarMinhasCampanhas(operadorId: string): Promise<EnvioResumo[]> {
  const { data, error } = await db.from('campanha_facil_envios')
    .select(COLUNAS_ENVIO)
    .eq('operador_id', operadorId).eq('ativa', true).gt('expira_em', new Date().toISOString())
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return comProgresso((data ?? []) as Omit<EnvioResumo, 'progresso'>[]);
}

// ── Controle da campanha ─────────────────────────────────────────────────────

/** Desativar some na hora para os operadores; reativar renova os 2 dias e avisa. */
export async function ativarLote(loteId: string, ativa: boolean): Promise<void> {
  const { error } = await db.rpc('fn_campanha_facil_lote_ativar', { p_lote: loteId, p_ativa: ativa });
  if (error) throw error;
}

/** Some das abas e do histórico. */
export async function excluirLote(loteId: string): Promise<void> {
  const { error } = await db.rpc('fn_campanha_facil_lote_excluir', { p_lote: loteId });
  if (error) throw error;
}

/** Todas as mensagens de uma campanha, só o que a redistribuição usa. */
export async function mensagensDoLote(envioIds: readonly string[]): Promise<MensagemDaCampanha[]> {
  const todas: MensagemDaCampanha[] = [];
  for (const ids of emPedacos(envioIds, LOTE_IDS)) {
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await db.from('campanha_facil_contatos')
        .select('id, operador_id, ordem, status')
        .in('envio_id', ids).order('ordem').range(de, de + PAGINA - 1);
      if (error) throw error;
      todas.push(...((data ?? []) as MensagemDaCampanha[]));
      if ((data ?? []).length < PAGINA) break;
    }
  }
  return todas;
}

/** Grava a edição de uma campanha DESATIVADA. Não relança: isso é `ativarLote`. */
export async function editarLote(p: {
  loteId: string;
  titulo: string;
  /** `null` = mensagem não muda. */
  modelo: string | null;
  partes: readonly ParteRedistribuida[];
}): Promise<void> {
  const { error } = await db.rpc('fn_campanha_facil_lote_editar', {
    p_lote: p.loteId,
    p_titulo: p.titulo,
    p_modelo: p.modelo,
    p_atribuicao: p.partes
      .filter(x => x.contatos.length > 0)
      .map(x => ({ operador_id: x.operador.id, contatos: x.contatos })),
  });
  if (error) throw error;
}

// ── Repasse ──────────────────────────────────────────────────────────────────

interface ContatoGravado extends ContatoEnvio { id: string; envio_id: string }

const COLUNAS_CONTATO_REPASSE =
  'id, envio_id, ordem, nome, contrato, empresa_cliente, telefone, whatsapp, telefone2, whatsapp2, mensagem, pendencias, variaveis';

/**
 * Tira de quem faltou o que ele ainda não enviou e entrega a quem ficou.
 *
 * O que já saiu fica com quem enviou (é registro). Grava os envios novos ANTES
 * de apagar: se a gravação falhar, nada se perdeu e o líder tenta de novo. O
 * envio de quem faltou some se ficar vazio.
 */
export async function repassarEnvios(p: {
  faltaram: EnvioResumo[];
  recebedores: OperadorCampanha[];
}): Promise<number> {
  if (p.faltaram.length === 0 || p.recebedores.length === 0) return 0;
  const ids = p.faltaram.map(e => e.id);

  const pendentes: ContatoGravado[] = [];
  for (const envioId of ids) {
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await db.from('campanha_facil_contatos')
        .select(COLUNAS_CONTATO_REPASSE)
        .eq('envio_id', envioId).neq('status', 'enviado')
        .order('ordem').range(de, de + PAGINA - 1);
      if (error) throw error;
      pendentes.push(...((data ?? []) as ContatoGravado[]));
      if ((data ?? []).length < PAGINA) break;
    }
  }
  if (pendentes.length === 0) return 0;

  const loteId = p.faltaram[0].lote_id;
  const partes = repartirRepasse(pendentes, p.recebedores).map(parte => ({
    operador: parte.operador,
    contatos: parte.contatos.map(({ id: _id, envio_id: _envio, ...c }) => c),
  }));
  const envioPorOperador = await criarEnvios(loteId, partes, true);
  try {
    await gravarContatos(partes, envioPorOperador);
  } catch (err) {
    await db.from('campanha_facil_envios').delete().in('id', [...envioPorOperador.values()]);
    throw err;
  }

  // O aviso não desfaz o repasse: quem recebeu acha na aba de qualquer jeito.
  const { error: eAviso } = await db.rpc('fn_campanha_facil_avisar_repasse', {
    p_envios: [...envioPorOperador.values()],
  });
  if (eAviso) console.warn('[campanhaFacilEnvios] aviso do repasse:', eAviso.message);

  for (const pedaco of emPedacos(pendentes.map(c => c.id), LOTE_IDS)) {
    const { error } = await db.from('campanha_facil_contatos').delete().in('id', pedaco);
    if (error) throw error;
  }

  // O envio de quem faltou: some se não sobrou nada; fica se já tinha enviado algo.
  const restantes = await comProgresso(p.faltaram.map(({ progresso: _p, ...e }) => e));
  const vazios = restantes.filter(e => e.progresso.total === 0).map(e => e.id);
  if (vazios.length > 0) {
    const { error } = await db.from('campanha_facil_envios').delete().in('id', vazios);
    if (error) throw error;
  }
  return partes.length;
}
