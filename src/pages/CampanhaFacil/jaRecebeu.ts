/**
 * «Este cliente já recebeu mensagem hoje» (26/10/2026, migration 20261026190000).
 *
 * Setores que cobram a mesma carteira mandam a mesma campanha para o mesmo
 * cliente no mesmo horário — ele denuncia e o número é banido. Cada mensagem
 * que sai pela Campanha Fácil fica registrada com o número usado, e a tela
 * avisa quantas o cliente já recebeu hoje e a que horas foi a última.
 *
 * A chave é o Nr.Documento (`contrato`) e também os números da lista: o cliente
 * com dois contratos tem dois Nr.Documento. O banco não diz setor nem operador,
 * só o número e o horário.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** As funções nasceram depois dos tipos gerados. */
const db = supabase as unknown as SupabaseClient;

/** Uma mensagem que o cliente já recebeu hoje. */
export interface Recebimento {
  /** Só dígitos, com o 55. `null` = mensagem copiada (número não informado). */
  numero: string | null;
  enviado_em: string;
  /** Achada pelo mesmo Nr.Documento. `false` = só pelo número: outro contrato. */
  mesmo_contrato: boolean;
}

/** Um cliente a consultar. `k` é a chave de volta (id do contato ou linha do mailing). */
export interface ItemConsulta {
  k: string;
  /** A empresa do sistema: o Nr.Documento só vale dentro do mesmo ERP. */
  e: string | null;
  c: string | null;
  n: string[];
}

/** O teto do banco é 5000 por chamada; menos que isso mantém cada uma leve. */
const LOTE = 2000;

/** Os números do cliente, sem vazios nem repetidos. */
export function numerosDoCliente(...numeros: (string | null | undefined)[]): string[] {
  return [...new Set(numeros.filter((n): n is string => !!n))];
}

/** Os envios de hoje de cada cliente, pela chave, do mais antigo para o mais novo. */
export async function consultarJaRecebeu(itens: readonly ItemConsulta[]): Promise<Map<string, Recebimento[]>> {
  const porChave = new Map<string, Recebimento[]>();
  const validos = itens.filter((i) => i.c || i.n.length > 0);
  for (let de = 0; de < validos.length; de += LOTE) {
    const { data, error } = await db.rpc('fn_campanha_facil_ja_recebeu', { p_itens: validos.slice(de, de + LOTE) });
    if (error) throw error;
    for (const r of (data ?? []) as (Recebimento & { chave: string })[]) {
      const lista = porChave.get(r.chave) ?? [];
      lista.push({ numero: r.numero, enviado_em: r.enviado_em, mesmo_contrato: r.mesmo_contrato });
      porChave.set(r.chave, lista);
    }
  }
  for (const lista of porChave.values()) lista.sort((a, b) => a.enviado_em.localeCompare(b.enviado_em));
  return porChave;
}

/**
 * Registra que a mensagem saiu, e por qual número (`null` = copiada). Não
 * trava o envio: se falhar, só o aviso dos outros fica sem esta mensagem.
 */
export async function registrarDisparo(contatoId: string, numero: string | null): Promise<void> {
  const { error } = await db.rpc('fn_campanha_facil_registrar_disparo', { p_contato: contatoId, p_numero: numero });
  if (error) throw error;
}

/** Por onde a mensagem chegou, do ponto de vista de quem está olhando. */
export type OrigemDoNumero = 'fone1' | 'fone2' | 'outro' | 'copiada';

export function origemDoNumero(numero: string | null, fone1: string | null, fone2: string | null): OrigemDoNumero {
  if (!numero) return 'copiada';
  if (numero === fone1) return 'fone1';
  if (numero === fone2) return 'fone2';
  return 'outro';
}

export const ROTULO_ORIGEM: Record<OrigemDoNumero, string> = {
  fone1: 'WhatsApp',
  fone2: 'Fone 2',
  outro: 'Outro número',
  copiada: 'Mensagem copiada (número não informado)',
};

export function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** «Já recebeu 3 mensagens hoje · a última às 09:05». */
export function fraseRecebidos(lista: readonly Recebimento[]): string {
  const n = lista.length;
  const ultima = lista[n - 1];
  return `Já recebeu ${n === 1 ? '1 mensagem' : `${n} mensagens`} hoje · a última às ${horaDe(ultima.enviado_em)}`;
}

/**
 * A ordem da campanha com os escolhidos no fim, sem mudar a ordem relativa de
 * ninguém. O rodízio reparte pela posição, então cada operador recebe esses
 * clientes por último na lista dele.
 */
export function comNoFim<T>(itens: readonly T[], noFim: (item: T) => boolean): T[] {
  const antes: T[] = [];
  const depois: T[] = [];
  for (const i of itens) (noFim(i) ? depois : antes).push(i);
  return depois.length === 0 ? [...itens] : [...antes, ...depois];
}
