/**
 * servico.ts — a conversa do Modo TV 2 com o banco.
 *
 * `database.types.ts` é gerado do banco e ainda não conhece `tv_paineis` nem as
 * `fn_tv_*` novas (migration 20261027170000). O cliente sem tipo abaixo é o
 * mesmo caminho do Modo TV antigo; quando os tipos forem regenerados, trocar
 * por `supabase.from('tv_paineis')` é substituição direta.
 *
 * Nenhuma consulta recorta por cargo: quem decide o que cada um vê é a RLS
 * (`fn_tv_alvo_no_meu_alcance`).
 */
import { supabase } from '@/lib/supabase';
import type { AlvoTv, ConexaoTv, NumerosTv, Painel, RespostaTv, TemaId, Unidade, VersaoTv } from './tipos';
import { telasValidas, temaValido } from './templates';

interface Erro { message: string; code?: string }
interface Consulta extends PromiseLike<{ data: unknown; error: Erro | null }> {
  select(colunas?: string): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  delete(): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  single(): Consulta;
}

const db = (tabela: string): Consulta =>
  (supabase.from as unknown as (t: string) => Consulta)(tabela);

async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: T; error: Erro | null }>)(nome, args);
  if (error) throw new Error(mensagemAmigavel(error));
  return data;
}

/** Tabela/função que ainda não existe = migration não aplicada. */
export function semMigration(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /does not exist|não existe|schema cache|PGRST20[25]|42P01|42883/i.test(m);
}

function mensagemAmigavel(e: Erro): string {
  return e.message || 'Erro ao falar com o banco.';
}

function lerPainel(linha: Record<string, unknown>): Painel {
  return {
    id: String(linha.id),
    nome: String(linha.nome ?? ''),
    tema: temaValido(linha.tema),
    unidade: linha.unidade === 'bruto' ? 'bruto' : 'ho',
    segundos_por_tela: Number(linha.segundos_por_tela) || 20,
    telas: telasValidas(linha.telas),
    tela_fixa: typeof linha.tela_fixa === 'string' ? linha.tela_fixa : null,
    setor_id: linha.setor_id as string,
    equipe_id: (linha.equipe_id as string | null) ?? null,
    atualizado_em: linha.atualizado_em as string,
  };
}

// ── Montagem (logado) ────────────────────────────────────────────────────────

const COLUNAS_PAINEL = 'id, nome, tema, unidade, segundos_por_tela, telas, tela_fixa, setor_id, equipe_id, atualizado_em';

export async function listarPaineis(empresaId: string): Promise<Painel[]> {
  const { data, error } = await db('tv_paineis')
    .select(COLUNAS_PAINEL)
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw new Error(mensagemAmigavel(error));
  return ((data ?? []) as Record<string, unknown>[]).map(lerPainel);
}

export async function listarAlvos(empresaId: string): Promise<AlvoTv[]> {
  return (await rpc<AlvoTv[] | null>('fn_tv_alvos', { p_empresa_id: empresaId })) ?? [];
}

export async function criarPainel(dados: {
  nome: string; setor_id: string; equipe_id: string | null; empresa_id: string;
}): Promise<Painel> {
  const { data, error } = await db('tv_paineis')
    .insert({ ...dados, telas: [] })
    .select(COLUNAS_PAINEL)
    .single();
  if (error) throw new Error(mensagemAmigavel(error));
  return lerPainel(data as Record<string, unknown>);
}

export async function salvarPainel(p: {
  id: string; nome: string; tema: TemaId; unidade: Unidade; segundos_por_tela: number; telas: Painel['telas'];
}): Promise<void> {
  const { error } = await db('tv_paineis')
    .update({ nome: p.nome, tema: p.tema, unidade: p.unidade, segundos_por_tela: p.segundos_por_tela, telas: p.telas })
    .eq('id', p.id);
  if (error) throw new Error(mensagemAmigavel(error));
}

/**
 * Para a TV numa tela (ou volta o rodízio, com `null`). Vai para a TV na hora,
 * sem passar pelo «Publicar»: é controle remoto, não edição.
 */
export async function fixarTela(painelId: string, telaId: string | null): Promise<void> {
  const { error } = await db('tv_paineis').update({ tela_fixa: telaId }).eq('id', painelId);
  if (error) throw new Error(mensagemAmigavel(error));
}

export async function excluirPainel(id: string): Promise<void> {
  const { error } = await db('tv_paineis').delete().eq('id', id);
  if (error) throw new Error(mensagemAmigavel(error));
}

export async function previa(painelId: string): Promise<NumerosTv | null> {
  return rpc<NumerosTv | null>('fn_tv_previa', { p_painel_id: painelId });
}

export async function listarConexoes(painelIds: string[]): Promise<ConexaoTv[]> {
  if (!painelIds.length) return [];
  const { data, error } = await db('tv_conexoes')
    .select('id, painel_id, nome, conectada_em, ultimo_sinal, saiu_em, versao_exibida')
    .in('painel_id', painelIds)
    .order('conectada_em');
  if (error) throw new Error(mensagemAmigavel(error));
  return (data ?? []) as ConexaoTv[];
}

export async function conectarTv(codigo: string, painelId: string, nome: string): Promise<void> {
  await rpc<string>('fn_tv_conectar', { p_codigo: codigo, p_painel_id: painelId, p_nome: nome });
}

export async function desconectarTv(conexaoId: string): Promise<void> {
  await rpc<boolean>('fn_tv_desconectar', { p_conexao_id: conexaoId });
}

const TAMANHO_MAX = { imagem: 8 * 1024 * 1024, video: 40 * 1024 * 1024 };

/** Envia para `tv/paineis/<painel>/` e devolve a URL pública. */
export async function enviarMidia(painelId: string, arquivo: File, tipo: 'imagem' | 'video'): Promise<string> {
  const ok = tipo === 'imagem' ? /^image\/(png|jpe?g|webp|gif)$/.test(arquivo.type) : /^video\/(mp4|webm)$/.test(arquivo.type);
  if (!ok) throw new Error(tipo === 'imagem' ? 'Use PNG, JPG, WEBP ou GIF.' : 'Use MP4 ou WEBM.');
  if (arquivo.size > TAMANHO_MAX[tipo]) {
    throw new Error(`Arquivo grande demais (máx. ${TAMANHO_MAX[tipo] / 1024 / 1024} MB).`);
  }
  const ext = (arquivo.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const caminho = `paineis/${painelId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('tv').upload(caminho, arquivo, {
    contentType: arquivo.type, cacheControl: '86400', upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from('tv').getPublicUrl(caminho).data.publicUrl;
}

// ── A TV (sem login) ─────────────────────────────────────────────────────────

export async function pedirCodigo(): Promise<{ token: string; codigo: string; expira_em: string }> {
  return rpc('fn_tv_conexao_nova');
}

export async function verTv(token: string): Promise<RespostaTv> {
  const r = await rpc<RespostaTv>('fn_tv_ver', { p_token: token });
  if (r?.estado === 'conectada') {
    const p = r.painel as unknown as Record<string, unknown>;
    return { ...r, painel: lerPainel(p) };
  }
  return r ?? { estado: 'desconhecida' };
}

/** A pergunta curta: em que versão está o painel desta TV. */
export async function versaoTv(token: string): Promise<VersaoTv> {
  return (await rpc<VersaoTv | null>('fn_tv_versao', { p_token: token })) ?? { estado: 'desconhecida' };
}

/**
 * Avisa que a página da TV está fechando. `keepalive` deixa a requisição
 * terminar depois que a aba some — `supabase.rpc` não tem essa opção.
 */
export function avisarSaida(token: string): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !chave) return;
  try {
    void fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/fn_tv_sair`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    }).catch(() => {});
  } catch { /* a página já está indo embora */ }
}
