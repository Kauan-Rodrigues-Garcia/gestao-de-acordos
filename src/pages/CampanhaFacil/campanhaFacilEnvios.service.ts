/**
 * Campanha Fácil — liberar a campanha para os operadores (20260929100000).
 *
 * O líder marca quem encaminha; cada um recebe uma notificação e baixa dali a
 * planilha com a parte dele. Os envios valem 2 dias. Ver `envios.ts` para a
 * parte pura (repartir, repassar).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { rotaDoEnvioCampanha } from '@/lib/notificacoes-rota';
import { CampaignXlsx } from './lib/xlsx-export';
import {
  itemDaLinha, repartirRepasse,
  type LinhaEnvio, type OperadorCampanha,
} from './envios';

/** A tabela nasceu depois dos tipos gerados — mesmo recurso do numeros.service. */
const db = supabase as unknown as SupabaseClient;

/** Quanto tempo o operador tem para baixar. Espelha o default da migration. */
export const DIAS_VALIDADE_ENVIO = 2;

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
      const { data: perfisClones, error: e4 } = await supabase.from('perfis').select('id, nome')
        .in('id', faltando).eq('perfil', 'operador').eq('ativo', true);
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
  const { data, error } = await supabase.from('setores').select('id, nome')
    .eq('empresa_id', empresaId).order('nome');
  if (error) throw error;
  return (data ?? []) as { id: string; nome: string }[];
}

// ── Liberar ──────────────────────────────────────────────────────────────────

export interface Autor { id: string; nome: string | null; foto: string | null }

interface ParteEnvio { operador: OperadorCampanha; linhas: LinhaEnvio[] }

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
 * Grava um envio por operador e avisa cada um.
 *
 * Um INSERT por operador, e não um só: cada envio carrega as mensagens prontas,
 * e a campanha inteira num corpo só pode passar do limite do pedido.
 *
 * Se um falhar no meio, os já gravados são apagados — metade da equipe com
 * campanha e metade sem é pior do que o líder tentar de novo.
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
        qtd: p.linhas.length,
        linhas: p.linhas,
        repasse: l.repasse,
        criado_por: l.autor.id,
        criado_por_nome: l.autor.nome,
      }).select('id').single();
      if (error) throw error;
      criados.push({ id: (data as { id: string }).id, operador: p.operador, qtd: p.linhas.length });
    }
  } catch (err) {
    if (criados.length > 0) {
      await db.from('campanha_facil_envios').delete().in('id', criados.map(c => c.id));
    }
    throw err;
  }

  // A notificação é o aviso; o envio já está gravado. Falhar aqui não desfaz a
  // campanha — o líder vê o envio no painel e pode repassar.
  const { error } = await supabase.from('notificacoes').insert(criados.map(c => ({
    usuario_id: c.operador.id,
    empresa_id: l.empresaId,
    titulo: l.repasse ? `Campanha repassada — ${l.titulo}` : `Campanha pronta — ${l.titulo}`,
    mensagem: `${plural(c.qtd, 'contato', 'contatos')} para você encaminhar`
      + `${l.repasse ? ' (repasse de quem faltou)' : ''}. `
      + `Clique para baixar a planilha. Fica disponível por ${DIAS_VALIDADE_ENVIO} dias.`,
    rota: rotaDoEnvioCampanha(c.id),
    autor_id: l.autor.id,
    autor_nome: l.autor.nome,
    autor_foto: l.autor.foto,
  })));
  if (error) console.warn('[campanhaFacilEnvios] notificação falhou:', error.message);

  return criados.length;
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
}

/** Os envios ainda válidos que ESTE líder criou — sem as linhas. */
export async function listarEnviosLiberados(autorId: string): Promise<EnvioResumo[]> {
  const { data, error } = await db.from('campanha_facil_envios')
    .select('id, lote_id, setor_id, operador_id, operador_nome, titulo, arquivo_nome, qtd, repasse, criado_em, expira_em')
    .eq('criado_por', autorId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EnvioResumo[];
}

/**
 * Tira a parte de quem faltou e entrega a quem ficou.
 *
 * Grava os envios novos ANTES de apagar os antigos: se a gravação falhar, nada
 * se perdeu e o líder tenta de novo.
 */
export async function repassarEnvios(p: {
  empresaId: string;
  faltaram: EnvioResumo[];
  recebedores: OperadorCampanha[];
  autor: Autor;
}): Promise<number> {
  if (p.faltaram.length === 0 || p.recebedores.length === 0) return 0;
  const ids = p.faltaram.map(e => e.id);
  const { data, error } = await db.from('campanha_facil_envios')
    .select('id, linhas').in('id', ids);
  if (error) throw error;

  const porId = new Map(((data ?? []) as { id: string; linhas: LinhaEnvio[] }[]).map(r => [r.id, r.linhas]));
  const linhas = ids.flatMap(id => porId.get(id) ?? []);
  const base = p.faltaram[0];

  const n = await gravarLote({
    empresaId: p.empresaId,
    setorId: base.setor_id,
    loteId: base.lote_id,
    titulo: base.titulo,
    arquivoNome: base.arquivo_nome,
    autor: p.autor,
    repasse: true,
    partes: repartirRepasse(linhas, p.recebedores),
  });

  const { error: eDel } = await db.from('campanha_facil_envios').delete().in('id', ids);
  if (eDel) throw eDel;
  return n;
}

/** Apaga uma liberação inteira (os envios de todos os operadores do lote). */
export async function cancelarLote(autorId: string, loteId: string): Promise<void> {
  const { error } = await db.from('campanha_facil_envios').delete()
    .eq('criado_por', autorId).eq('lote_id', loteId);
  if (error) throw error;
}

// ── O operador baixa ─────────────────────────────────────────────────────────

/**
 * Monta o Excel da parte do operador e baixa.
 *
 * `false` quando o envio não existe mais: passou dos 2 dias, ou o líder
 * repassou a parte para outra pessoa. A policy esconde os dois casos, então
 * não dá para dizer qual — a mensagem cobre ambos.
 */
export async function baixarEnvioCampanha(envioId: string): Promise<boolean> {
  const { data, error } = await db.from('campanha_facil_envios')
    .select('arquivo_nome, linhas').eq('id', envioId).maybeSingle();
  if (error) throw error;
  if (!data) return false;

  const { arquivo_nome, linhas } = data as { arquivo_nome: string; linhas: LinhaEnvio[] };
  const bytes = CampaignXlsx.createWorkbook((linhas ?? []).map(itemDaLinha));
  if (!CampaignXlsx.isValidWorkbook(bytes)) throw new Error('A planilha não foi gerada corretamente.');

  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo_nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
