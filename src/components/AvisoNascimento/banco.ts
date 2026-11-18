/**
 * banco.ts — o aviso de nascimento falando com o banco (migration 20261118150000).
 *
 * Nomes, textos e foto vêm do banco e nunca do código: o repositório é público.
 * Sem a migration as chamadas falham com «função não existe»: nada aparece.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { faltaMigration, mensagemDoErro, ErroDoBanco } from '@/components/VotacaoLideres/banco';
import { conteudoDoBanco, type ConteudoDoLivro } from './conteudo';

export { faltaMigration, mensagemDoErro };

const BALDE = 'avisos-nascimento';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcSemTipo<T>(fn, args);
  if (error) throw new ErroDoBanco(error.message, (error as { code?: string }).code);
  return data as T;
}

export interface MeuAviso {
  id: string;
  conteudo: ConteudoDoLivro;
  foto_caminho: string;
  pode_recado: boolean;
  vi: boolean;
  meu_recado: string | null;
}

export interface PessoaDoAviso {
  id: string;
  nome: string | null;
  cargo: string;
  no_publico: boolean;
  viu_em: string | null;
  recado: string | null;
  recado_em: string | null;
}

export interface AvisoNoPainel {
  id: string;
  setor_id: string;
  setor_nome: string;
  conteudo: ConteudoDoLivro;
  foto_caminho: string | null;
  homenageada_id: string | null;
  liberado_em: string | null;
  encerrado_em: string | null;
  /** O banco diz se esta pessoa envia foto, libera e recolhe. */
  posso_liberar: boolean;
  pessoas: PessoaDoAviso[];
}

type ComConteudo = { conteudo: unknown };
const normalizar = <T extends ComConteudo>(l: T[] | null) => (l ?? []).map(a => ({ ...a, conteudo: conteudoDoBanco(a.conteudo) }));

export const lerMeus = async () => normalizar(await rpc<Array<Omit<MeuAviso, 'conteudo'> & ComConteudo>>('fn_nascimento_meu')) as MeuAviso[];
export const lerPainel = async () => normalizar(await rpc<Array<Omit<AvisoNoPainel, 'conteudo'> & ComConteudo>>('fn_nascimento_painel')) as AvisoNoPainel[];
export const marcarVi = (id: string) => rpc<void>('fn_nascimento_vi', { p_id: id });
export const salvarRecado = (id: string, texto: string) => rpc<void>('fn_nascimento_recado', { p_id: id, p_texto: texto });
export const liberarAviso = (id: string, liberar: boolean) => rpc<void>('fn_nascimento_liberar', { p_id: id, p_liberar: liberar });

/** URL de uma hora: o balde é privado. */
export async function urlDaFoto(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Não deu para abrir a foto.');
  return data.signedUrl;
}

const TAMANHO_MAX = 8 * 1024 * 1024;

export async function enviarFoto(id: string, arquivo: File): Promise<void> {
  if (!/^image\/(png|jpe?g|webp)$/.test(arquivo.type)) throw new Error('Use PNG, JPG ou WEBP.');
  if (arquivo.size > TAMANHO_MAX) throw new Error('Imagem grande demais (máx. 8 MB).');
  const ext = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
  const caminho = `${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BALDE).upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: '3600', upsert: false });
  if (error) throw new Error(error.message);
  await rpc<void>('fn_nascimento_definir_foto', { p_id: id, p_caminho: caminho });
}
