/**
 * mensagensWhatsapp.service.ts — ler e gravar as mensagens de WhatsApp da
 * pessoa (`acordos_mensagens_whatsapp`, migration 20260928160000).
 *
 * A RLS já recorta pela pessoa logada; o `usuario_id` vai no filtro mesmo
 * assim, para a consulta usar o índice e deixar claro de quem é a lista.
 *
 * Cliente sem tipo pelo mesmo motivo de `tourVisto.service.ts`:
 * `database.types.ts` é gerado do banco e ainda não conhece a tabela.
 */
import { supabase } from '@/lib/supabase';
import {
  GRUPOS_MENSAGEM, type GrupoMensagem, type MensagemWhatsapp,
} from '@/lib/mensagensWhatsapp';

const TABELA = 'acordos_mensagens_whatsapp';

type Resposta<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;

interface Consulta<T = unknown> extends Resposta<T> {
  select(colunas: string): Consulta<T>;
  insert(valores: unknown): Consulta<T>;
  upsert(valores: unknown): Consulta<T>;
  delete(): Consulta<T>;
  eq(coluna: string, valor: string): Consulta<T>;
  in(coluna: string, valores: string[]): Consulta<T>;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta<T>;
}

function tabela<T>(): Consulta<T> {
  return (supabase.from as unknown as (t: string) => Consulta<T>)(TABELA);
}

/** A tabela ainda não foi criada neste banco (migration não aplicada). */
function tabelaAusente(erro: { message: string; code?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === '42P01' || erro.code === 'PGRST205' || /acordos_mensagens_whatsapp/.test(erro.message);
}

export interface ResultadoMensagens {
  mensagens: MensagemWhatsapp[];
  /** false = a tabela não existe; a tela segue com o texto do sistema. */
  disponivel: boolean;
  erro: string | null;
}

/**
 * Nunca rejeita: a aba Acordos não pode quebrar porque as mensagens não
 * vieram. Sem elas, vale o texto do sistema.
 */
export async function listarMensagensWhatsapp(usuarioId: string): Promise<ResultadoMensagens> {
  let data: MensagemWhatsapp[] | null;
  let error: { message: string; code?: string } | null;
  try {
    ({ data, error } = await tabela<MensagemWhatsapp[]>()
      .select('id, status, titulo, conteudo, ordem')
      .eq('usuario_id', usuarioId)
      .order('ordem', { ascending: true }));
  } catch (e) {
    return { mensagens: [], disponivel: true, erro: e instanceof Error ? e.message : String(e) };
  }
  if (error) {
    return { mensagens: [], disponivel: !tabelaAusente(error), erro: tabelaAusente(error) ? null : error.message };
  }
  const validas = (data ?? []).filter(m => (GRUPOS_MENSAGEM as readonly string[]).includes(m.status));
  return { mensagens: validas, disponivel: true, erro: null };
}

/** Uma mensagem como o editor a devolve: `id` nulo = nova. */
export interface MensagemEditada {
  id: string | null;
  status: GrupoMensagem;
  titulo: string;
  conteudo: string;
}

/**
 * Grava a lista INTEIRA da pessoa, como o editor a deixou.
 *
 * O editor trabalha no rascunho e salva de uma vez; aqui isso vira três
 * passos: apagar o que saiu da lista, atualizar o que já existia e inserir o
 * novo. A `ordem` é a posição dentro do grupo — a primeira é a padrão.
 */
export async function salvarMensagensWhatsapp(
  usuarioId: string,
  anteriores: readonly MensagemWhatsapp[],
  editadas: readonly MensagemEditada[],
): Promise<{ erro: string | null }> {
  const ordemNoGrupo = new Map<GrupoMensagem, number>();
  const linhas = editadas.map(m => {
    const ordem = ordemNoGrupo.get(m.status) ?? 0;
    ordemNoGrupo.set(m.status, ordem + 1);
    return {
      id: m.id,
      usuario_id: usuarioId,
      status: m.status,
      titulo: m.titulo.trim(),
      conteudo: m.conteudo.trim(),
      ordem,
    };
  });

  const ficam = new Set(linhas.map(l => l.id).filter((id): id is string => Boolean(id)));
  const sairam = anteriores.map(m => m.id).filter(id => !ficam.has(id));
  if (sairam.length > 0) {
    const { error } = await tabela().delete().eq('usuario_id', usuarioId).in('id', sairam);
    if (error) return { erro: error.message };
  }

  const existentes = linhas.filter(l => l.id);
  if (existentes.length > 0) {
    const agora = new Date().toISOString();
    const { error } = await tabela().upsert(existentes.map(l => ({ ...l, atualizado_em: agora })));
    if (error) return { erro: error.message };
  }

  // Sem a chave `id`: um `id: null` explícito furaria o DEFAULT do banco.
  const novas = linhas.filter(l => !l.id).map(l => ({
    usuario_id: l.usuario_id, status: l.status, titulo: l.titulo, conteudo: l.conteudo, ordem: l.ordem,
  }));
  if (novas.length > 0) {
    const { error } = await tabela().insert(novas);
    if (error) return { erro: error.message };
  }

  return { erro: null };
}
