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
  'id, envio_id, ordem, nome, contrato, empresa_cliente, telefone, whatsapp, mensagem, mensagem_editada, pendencias, status, enviado_em';

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

export async function definirStatus(id: string, status: StatusContato): Promise<void> {
  const { error } = await db.from('campanha_facil_contatos').update({ status }).eq('id', id);
  if (error) throw error;
}

/** `null` volta para a mensagem original. */
export async function editarMensagem(id: string, texto: string | null): Promise<void> {
  const { error } = await db.from('campanha_facil_contatos').update({ mensagem_editada: texto }).eq('id', id);
  if (error) throw error;
}
