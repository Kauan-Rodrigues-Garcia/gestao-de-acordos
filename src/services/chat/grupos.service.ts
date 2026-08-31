/**
 * grupos.service.ts — a conversa com mais de duas pessoas.
 *
 * ## Tudo passa por RPC, e isso não é excesso de zelo
 *
 * `chat_conversas` e `chat_participantes` não têm policy de UPDATE nem de
 * INSERT para `authenticated`. Se tivessem, «adicionar alguém ao grupo» seria
 * um INSERT que qualquer cliente sabe montar — inclusive para um grupo que a
 * pessoa não administra, e inclusive marcando `admin = true` para si mesma.
 *
 * As funções do banco (`fn_chat_grupo_*`) são `SECURITY DEFINER` e conferem
 * duas coisas antes de cada escrita: a permissão do painel e a administração
 * DAQUELE grupo. Este módulo é só a tradução das mensagens de erro.
 *
 * ## Quem eu posso colocar no grupo
 *
 * Os mesmos contatos da conversa direta (`listarContatos`). Não há lista
 * própria: se eu posso chamar a pessoa no privado, posso colocá-la no grupo.
 * Depois de dentro, o alcance deixa de valer — quem está no grupo fala com
 * quem está no grupo, mesmo sem se alcançar fora dele.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface MembroGrupo {
  perfil_id: string;
  nome:      string;
  usuario:   string | null;
  foto_url:  string | null;
  cargo:     string;
  /** Administra o grupo: foto, nome, quem entra e sai, e a trava de escrita. */
  admin:     boolean;
}

/**
 * O que o banco devolve quando recusa, em português de gente.
 *
 * As mensagens do `RAISE EXCEPTION` já são legíveis — este mapa existe para os
 * erros que o PostgREST embrulha antes de chegar aqui.
 */
function traduzir(msg: string): string {
  if (/violates row-level security|permission denied/i.test(msg)) {
    return 'Você não tem permissão para isso neste grupo.';
  }
  if (/chat_conversa_coerente/i.test(msg)) return 'O grupo precisa de um nome.';
  // `RAISE EXCEPTION` chega como está, e é a mensagem certa em quase todo caso.
  return msg.replace(/^.*?:\s*/, '') || 'Não foi possível concluir.';
}

export async function criarGrupo(
  nome: string, membros: string[], fotoUrl?: string | null,
): Promise<{ id: string | null; erro: string | null }> {
  const { data, error } = await rpcSemTipo<string>('fn_chat_grupo_criar', {
    p_nome:     nome,
    p_membros:  membros,
    p_foto_url: fotoUrl ?? null,
  });
  if (error) return { id: null, erro: traduzir(error.message) };
  return { id: (data as unknown as string) ?? null, erro: null };
}

/**
 * Nome, foto e trava — cada um opcional.
 *
 * `undefined` é «não mexe nisto»; `null` na foto é «remove a foto». Sem essa
 * distinção, salvar só o nome apagaria a foto do grupo junto, e a pessoa
 * descobriria isso depois.
 */
export async function configurarGrupo(params: {
  conversaId: string;
  nome?:      string;
  fotoUrl?:   string | null;
  somenteLideranca?: boolean;
}): Promise<{ erro: string | null }> {
  const { error } = await rpcSemTipo('fn_chat_grupo_config', {
    p_conversa: params.conversaId,
    p_nome:     params.nome ?? null,
    // '' é o pedido de REMOVER, entendido assim pela função do banco.
    p_foto_url: params.fotoUrl === undefined ? null : (params.fotoUrl ?? ''),
    p_somente_lideranca: params.somenteLideranca ?? null,
  });
  return { erro: error ? traduzir(error.message) : null };
}

export async function adicionarAoGrupo(
  conversaId: string, membros: string[],
): Promise<{ adicionados: number; erro: string | null }> {
  const { data, error } = await rpcSemTipo<number>('fn_chat_grupo_adicionar', {
    p_conversa: conversaId,
    p_membros:  membros,
  });
  if (error) return { adicionados: 0, erro: traduzir(error.message) };
  return { adicionados: Number(data ?? 0), erro: null };
}

export async function removerDoGrupo(
  conversaId: string, perfilId: string,
): Promise<{ erro: string | null }> {
  const { error } = await rpcSemTipo('fn_chat_grupo_remover', {
    p_conversa: conversaId,
    p_membro:   perfilId,
  });
  return { erro: error ? traduzir(error.message) : null };
}

export async function sairDoGrupo(conversaId: string): Promise<{ erro: string | null }> {
  const { error } = await rpcSemTipo('fn_chat_grupo_sair', { p_conversa: conversaId });
  return { erro: error ? traduzir(error.message) : null };
}

export async function listarMembros(conversaId: string): Promise<MembroGrupo[]> {
  const { data, error } = await rpcSemTipo<MembroGrupo[]>('fn_chat_grupo_membros', {
    p_conversa: conversaId,
  });
  if (error) {
    console.warn('[chat/grupos] listarMembros:', error.message);
    return [];
  }
  return data ?? [];
}

/** Tamanho máximo da foto do grupo. Igual ao anexo do chat. */
export const LIMITE_FOTO_GRUPO = 5 * 1024 * 1024;

/**
 * Sobe a foto do grupo e devolve a URL pública.
 *
 * Vai para `grupos/<conversaId>/` no balde `chat`, e a policy de escrita do
 * storage confere `fn_chat_grupo_administro` a partir dessa segunda pasta —
 * é o caminho que autoriza, não um campo enviado pelo cliente.
 */
export async function subirFotoDoGrupo(
  conversaId: string, arquivo: File,
): Promise<{ url: string | null; erro: string | null }> {
  if (arquivo.size > LIMITE_FOTO_GRUPO) {
    return { url: null, erro: 'A imagem passa de 5 MB.' };
  }
  if (!arquivo.type.startsWith('image/')) {
    return { url: null, erro: 'Escolha uma imagem.' };
  }

  const extensao = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  // O nome muda a cada troca: reaproveitar o mesmo caminho deixaria a foto
  // velha no cache do navegador de todo mundo por tempo indefinido.
  const caminho = `grupos/${conversaId}/${Date.now()}.${extensao}`;

  const { error } = await supabase.storage.from('chat')
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (error) return { url: null, erro: error.message };

  const { data } = supabase.storage.from('chat').getPublicUrl(caminho);
  return { url: data.publicUrl, erro: null };
}
