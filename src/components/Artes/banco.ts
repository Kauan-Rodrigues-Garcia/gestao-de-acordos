/**
 * banco.ts — as artes falando com o banco (migration 20261117180000).
 * Sem a migration as chamadas falham com «função não existe»: o aviso não
 * aparece e a configuração explica.
 */
import { supabase } from '@/lib/supabase';
import { faltaMigration, mensagemDoErro, ErroDoBanco } from '@/components/VotacaoLideres/banco';
import { conteudoDoBanco, ehTema, modeloPorId, type ConteudoDaArte, type ModeloDeArte, type TemaDaArte } from './modelos';

export { faltaMigration, mensagemDoErro };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  // Funções novas ainda não estão nos tipos gerados do Supabase.
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string; code?: string } | null }>;
  };
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw new ErroDoBanco(error.message, error.code);
  return data as T;
}

export interface ArteBase {
  id: string;
  titulo: string;
  modelo: ModeloDeArte;
  conteudo: ConteudoDaArte;
  tema: TemaDaArte;
  inicio: string;
}

/** Uma arte no ar para mim. */
export interface MinhaArte extends ArteBase { vi: boolean }

/** Uma linha do painel (super_admin). */
export interface ArteNaLista extends ArteBase {
  setores: string[] | null;
  setores_nomes: string[];
  fim: string | null;
  criada_em: string;
  encerrada_em: string | null;
  publico: number;
  viram: number;
}

type Bruta = Record<string, unknown> & { modelo: string; tema: string; conteudo: unknown };

/** Modelo desconhecido (app velho, banco novo) fica de fora; tema desconhecido vira o do modelo. */
function normalizar<T extends ArteBase>(lista: Bruta[] | null): T[] {
  return (lista ?? []).flatMap(a => {
    const m = modeloPorId(a.modelo);
    if (!m) return [];
    return [{ ...a, modelo: m.id, tema: ehTema(a.tema) ? a.tema : m.temaPadrao, conteudo: conteudoDoBanco(m, a.conteudo) } as unknown as T];
  });
}

export const lerMinhas = async () => normalizar<MinhaArte>(await rpc<Bruta[]>('fn_artes_minhas'));
export const marcarVi = (id: string) => rpc<void>('fn_artes_vi', { p_id: id });

export const listar = async () => normalizar<ArteNaLista>(await rpc<Bruta[]>('fn_artes_listar'));
export const encerrar = (id: string) => rpc<void>('fn_artes_encerrar', { p_id: id });

export interface DadosParaLancar {
  titulo: string;
  modelo: ModeloDeArte;
  conteudo: ConteudoDaArte;
  tema: TemaDaArte;
  /** `null` = todo mundo. */
  setores: string[] | null;
  inicio: string | null;
  fim: string | null;
}

export const lancar = (d: DadosParaLancar) => rpc<string>('fn_artes_lancar', {
  p_titulo: d.titulo, p_modelo: d.modelo, p_conteudo: d.conteudo, p_tema: d.tema,
  p_setores: d.setores, p_inicio: d.inicio, p_fim: d.fim,
});

const TAMANHO_MAX = 8 * 1024 * 1024;

/** Envia a imagem própria para o bucket «artes» e devolve a URL pública. */
export async function enviarImagem(arquivo: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(arquivo.type)) throw new Error('Use PNG, JPG, WEBP ou GIF.');
  if (arquivo.size > TAMANHO_MAX) throw new Error('Imagem grande demais (máx. 8 MB).');
  const ext = (arquivo.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const mes = new Date().toISOString().slice(0, 7);
  const caminho = `${mes}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('artes').upload(caminho, arquivo, {
    contentType: arquivo.type, cacheControl: '604800', upsert: false,
  });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? 'Falta aplicar a migration das artes (pasta «artes»).' : error.message);
  return supabase.storage.from('artes').getPublicUrl(caminho).data.publicUrl;
}
