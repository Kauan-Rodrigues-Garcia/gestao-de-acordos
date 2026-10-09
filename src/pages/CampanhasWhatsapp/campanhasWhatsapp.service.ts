/**
 * Campanhas de WhatsApp — leitura e escrita da parte do operador
 * (`campanha_facil_contatos`, migration 20261007150000).
 *
 * O operador só altera `status` e `mensagem_editada` (grant por coluna); a
 * hora do envio e o carimbo o banco põe.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Contato, StatusContato } from './whatsapp';

/** A tabela nasceu depois dos tipos gerados. */
const db = supabase as unknown as SupabaseClient;

const PAGINA = 1000;
const COLUNAS =
  'id, envio_id, ordem, nome, contrato, empresa_cliente, telefone, whatsapp, telefone2, whatsapp2, mensagem, mensagem_editada, pendencias, status, enviado_em';

/**
 * A campanha foi desativada ou excluída pelo líder: o banco não deixa mais
 * mexer nela (20261007190000). A tela tira a campanha da lista.
 */
export class CampanhaIndisponivel extends Error {
  constructor() { super('Esta campanha foi desativada pelo líder.'); }
}

/** Todas as mensagens de uma campanha, na ordem (o PostgREST pagina em 1000). */
export async function listarContatos(envioId: string): Promise<Contato[]> {
  const todos: Contato[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from('campanha_facil_contatos')
      .select(COLUNAS).eq('envio_id', envioId)
      .order('ordem').range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as Contato[]));
    if ((data ?? []).length < PAGINA) break;
  }
  return todos;
}

// Campanha desativada: a policy esconde a linha e o UPDATE passa sem mudar
// nada — sem erro. O `select('id')` é o que mostra que nada mudou.
export async function definirStatus(id: string, status: StatusContato): Promise<void> {
  const { data, error } = await db.from('campanha_facil_contatos').update({ status }).eq('id', id).select('id');
  if (error) throw error;
  if ((data ?? []).length === 0) throw new CampanhaIndisponivel();
}

// ── Avaliação do retorno (20261009150000) ───────────────────────────────────

/** O voto do operador na campanha: `true` = bom retorno, `false` = não deu. */
export type Avaliacao = boolean;

/** Os votos desta pessoa nas campanhas dadas (a policy só devolve os dela). */
export async function minhasAvaliacoes(loteIds: readonly string[]): Promise<Map<string, Avaliacao>> {
  const mapa = new Map<string, Avaliacao>();
  if (loteIds.length === 0) return mapa;
  const { data, error } = await db.from('campanha_facil_avaliacoes')
    .select('lote_id, bom').in('lote_id', [...new Set(loteIds)]);
  if (error) throw error;
  for (const r of (data ?? []) as { lote_id: string; bom: boolean }[]) mapa.set(r.lote_id, r.bom);
  return mapa;
}

/** `null` tira o voto. */
export async function avaliarCampanha(loteId: string, bom: Avaliacao | null): Promise<void> {
  const { error } = await db.rpc('fn_campanha_facil_avaliar', { p_lote: loteId, p_bom: bom });
  if (error) throw error;
}

// ── Histórico do operador (20261009180000) ───────────────────────────────────

export interface Participacao {
  lote_id: string;
  titulo: string;
  liberada_por: string | null;
  setor_nome: string | null;
  lancada_em: string;
  encerrada_em: string | null;
  ativa: boolean;
  total: number;
  enviados: number;
  nao_enviados: number;
  /** O voto que a pessoa deu: `true` bom retorno, `false` sem retorno, `null` não avaliou. */
  bom: boolean | null;
}

/** As campanhas de que esta pessoa participou, da mais nova para a mais antiga. */
export async function minhasParticipacoes(): Promise<Participacao[]> {
  const { data, error } = await db.rpc('fn_campanha_facil_minhas_participacoes');
  if (error) throw error;
  return (data ?? []) as Participacao[];
}

/** `null` volta para a mensagem original. */
export async function editarMensagem(id: string, texto: string | null): Promise<void> {
  const { data, error } = await db.from('campanha_facil_contatos').update({ mensagem_editada: texto }).eq('id', id).select('id');
  if (error) throw error;
  if ((data ?? []).length === 0) throw new CampanhaIndisponivel();
}
