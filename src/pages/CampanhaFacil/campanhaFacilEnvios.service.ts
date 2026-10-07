/**
 * Campanha Fácil — liberar a campanha para os operadores.
 *
 * O líder marca quem encaminha; cada um recebe uma notificação simples e
 * encontra a parte dele na aba Campanhas de WhatsApp, uma linha por mensagem
 * (migrations 20260929100000 e 20261007150000). Os envios valem 2 dias. Ver
 * `envios.ts` para a parte pura (repartir, repassar).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { rotaDaCampanhaWhatsapp } from '@/lib/notificacoes-rota';
import {
  repartirRepasse,
  type ContatoEnvio, type OperadorCampanha,
} from './envios';
import { COLUNAS_SETOR_DO_FILTRO, listaDoFiltroDeSetores } from '@/lib/setoresDosFiltros';

/** As tabelas nasceram depois dos tipos gerados — mesmo recurso do numeros.service. */
const db = supabase as unknown as SupabaseClient;

/** Quanto tempo a campanha fica na aba do operador. Espelha o default da migration. */
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
      // Da mesma empresa: o envio só aceita operador da empresa de quem libera.
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

export interface Autor { id: string; nome: string | null; foto: string | null }

interface ParteEnvio { operador: OperadorCampanha; contatos: ContatoEnvio[] }

interface NovoLote {
  empresaId: string;
  setorId: string | null;
  loteId: string;
  titulo: string;
  arquivoNome: string;
  autor: Autor;
  repasse: boolean;
  partes: ParteEnvio[];
}

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

/**
 * Grava um envio por operador, com as mensagens dele, e avisa cada um.
 *
 * Se algo falhar no meio, os envios já gravados são apagados (as mensagens
 * vão junto, em cascata) — metade da equipe com campanha e metade sem é pior
 * do que o líder tentar de novo.
 */
async function gravarLote(l: NovoLote): Promise<number> {
  const criados: { id: string; operador: OperadorCampanha; qtd: number }[] = [];
  try {
    for (const p of l.partes) {
      const { data, error } = await db.from('campanha_facil_envios').insert({
        empresa_id: l.empresaId,
        lote_id: l.loteId,
        setor_id: l.setorId,
        operador_id: p.operador.id,
        operador_nome: p.operador.nome,
        titulo: l.titulo,
        arquivo_nome: l.arquivoNome,
        qtd: p.contatos.length,
        linhas: null,
        repasse: l.repasse,
        criado_por: l.autor.id,
        criado_por_nome: l.autor.nome,
      }).select('id').single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      criados.push({ id, operador: p.operador, qtd: p.contatos.length });

      for (const pedaco of emPedacos(p.contatos, LOTE_GRAVAR)) {
        const { error: eC } = await db.from('campanha_facil_contatos')
          .insert(pedaco.map(c => ({ ...c, envio_id: id })));
        if (eC) throw eC;
      }
    }
  } catch (err) {
    if (criados.length > 0) {
      await db.from('campanha_facil_envios').delete().in('id', criados.map(c => c.id));
    }
    throw err;
  }

  // A notificação é só o aviso; a campanha já está na aba. Falhar aqui não
  // desfaz nada, mas o líder precisa saber: quem não foi avisado não sabe que
  // tem campanha.
  const { error } = await supabase.from('notificacoes').insert(criados.map(c => ({
    usuario_id: c.operador.id,
    empresa_id: l.empresaId,
    titulo: l.repasse ? 'Campanha de WhatsApp repassada' : 'Campanha de WhatsApp pronta',
    mensagem: `${l.titulo} · ${plural(c.qtd, 'mensagem', 'mensagens')} para você enviar`
      + `${l.repasse ? ' (repasse de quem faltou)' : ''}.`,
    rota: rotaDaCampanhaWhatsapp(c.id),
    autor_id: l.autor.id,
    autor_nome: l.autor.nome,
    autor_foto: l.autor.foto,
  })));
  if (error) {
    console.warn('[campanhaFacilEnvios] notificação falhou:', error.message);
    throw new AvisoNaoEnviado(criados.length);
  }

  return criados.length;
}

/** A campanha foi gravada, mas a notificação não saiu. */
export class AvisoNaoEnviado extends Error {
  constructor(readonly gravados: number) {
    super('A campanha foi liberada, mas a notificação não chegou aos operadores.');
  }
}

export async function liberarCampanha(p: {
  empresaId: string;
  setorId: string | null;
  titulo: string;
  arquivoNome: string;
  autor: Autor;
  partes: ParteEnvio[];
}): Promise<number> {
  return gravarLote({ ...p, loteId: crypto.randomUUID(), repasse: false });
}

// ── O que o líder liberou ────────────────────────────────────────────────────

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
  criado_em: string;
  expira_em: string;
  criado_por_nome?: string | null;
  /** Do banco (`fn_campanha_facil_progresso`); sem a migration, vazio. */
  progresso: Progresso;
}

const COLUNAS_ENVIO =
  'id, lote_id, setor_id, operador_id, operador_nome, titulo, arquivo_nome, qtd, repasse, criado_em, expira_em, criado_por_nome';

/** Junta o progresso de cada envio. Sem a função no banco, fica zerado. */
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

/** Os envios ainda válidos que ESTE líder criou, com o progresso de cada um. */
export async function listarEnviosLiberados(autorId: string): Promise<EnvioResumo[]> {
  const { data, error } = await db.from('campanha_facil_envios')
    .select(COLUNAS_ENVIO)
    .eq('criado_por', autorId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return comProgresso((data ?? []) as Omit<EnvioResumo, 'progresso'>[]);
}

/** As campanhas que chegaram PARA esta pessoa — a aba Campanhas de WhatsApp. */
export async function listarMinhasCampanhas(operadorId: string): Promise<EnvioResumo[]> {
  const { data, error } = await db.from('campanha_facil_envios')
    .select(COLUNAS_ENVIO)
    .eq('operador_id', operadorId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return comProgresso((data ?? []) as Omit<EnvioResumo, 'progresso'>[]);
}

interface ContatoGravado extends ContatoEnvio { id: string; envio_id: string }

/**
 * Tira de quem faltou o que ele ainda não enviou e entrega a quem ficou.
 *
 * O que já saiu fica com quem enviou (é registro). Grava os envios novos ANTES
 * de apagar: se a gravação falhar, nada se perdeu e o líder tenta de novo. O
 * envio de quem faltou some se ficar vazio.
 */
export async function repassarEnvios(p: {
  empresaId: string;
  faltaram: EnvioResumo[];
  recebedores: OperadorCampanha[];
  autor: Autor;
}): Promise<number> {
  if (p.faltaram.length === 0 || p.recebedores.length === 0) return 0;
  const ids = p.faltaram.map(e => e.id);

  const pendentes: ContatoGravado[] = [];
  for (const envioId of ids) {
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await db.from('campanha_facil_contatos')
        .select('id, envio_id, ordem, nome, contrato, empresa_cliente, telefone, whatsapp, mensagem, pendencias')
        .eq('envio_id', envioId).neq('status', 'enviado')
        .order('ordem').range(de, de + PAGINA - 1);
      if (error) throw error;
      pendentes.push(...((data ?? []) as ContatoGravado[]));
      if ((data ?? []).length < PAGINA) break;
    }
  }
  if (pendentes.length === 0) return 0;

  const base = p.faltaram[0];
  const partes = repartirRepasse(pendentes, p.recebedores).map(parte => ({
    operador: parte.operador,
    contatos: parte.contatos.map(({ id: _id, envio_id: _envio, ...c }) => c),
  }));
  const n = await gravarLote({
    empresaId: p.empresaId,
    setorId: base.setor_id,
    loteId: base.lote_id,
    titulo: base.titulo,
    arquivoNome: base.arquivo_nome,
    autor: p.autor,
    repasse: true,
    partes,
  }).catch((err) => {
    // Gravou e só o aviso falhou: o repasse vale, segue para apagar.
    if (err instanceof AvisoNaoEnviado) return err.gravados;
    throw err;
  });

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
  return n;
}

/** Apaga uma liberação inteira (os envios de todos os operadores do lote). */
export async function cancelarLote(autorId: string, loteId: string): Promise<void> {
  const { error } = await db.from('campanha_facil_envios').delete()
    .eq('criado_por', autorId).eq('lote_id', loteId);
  if (error) throw error;
}
