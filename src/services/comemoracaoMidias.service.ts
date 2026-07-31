/**
 * comemoracaoMidias.service.ts — GIFs e sons enviados pelo líder.
 *
 * Migration 20260731f. O catálogo padrão (efeitos animados e sons
 * sintetizados) vive em código e NÃO passa por aqui — só a mídia própria.
 *
 * O limite de tamanho é do BUCKET, não deste arquivo: validação só no
 * navegador é contornável pela API, e um GIF de 40 MB trava a tela de todo
 * mundo do setor. A checagem daqui existe para dar erro legível antes de
 * gastar a subida.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type TipoMidia = 'gif' | 'som';

export interface MidiaComemoracao {
  id:         string;
  empresa_id: string;
  tipo:       TipoMidia;
  nome:       string;
  url:        string;
  caminho:    string;
  criado_por: string | null;
  criado_em:  string;
  /** Só para som: onde o trecho começa. */
  inicio_s?:  number;
  /** Só para som: quanto o trecho dura. null = arquivo inteiro. */
  trecho_s?:  number | null;
}

export const BUCKET = 'comemoracoes';

/**
 * Espelha `file_size_limit` do bucket (migration 20260731g). O teto de verdade
 * é o do bucket; isto existe para dar erro legível antes de gastar a subida.
 */
export const LIMITE_GIF_BYTES = 5 * 1024 * 1024;
export const LIMITE_SOM_BYTES = 10 * 1024 * 1024;

const MIME_GIF = ['image/gif', 'image/png', 'image/webp'];
const MIME_SOM = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];

interface Resultado<T = null> {
  ok:    boolean;
  erro:  string | null;
  dados: T | null;
}

function limiteDe(tipo: TipoMidia): number {
  return tipo === 'gif' ? LIMITE_GIF_BYTES : LIMITE_SOM_BYTES;
}

function emMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Erro legível, ou null se o arquivo serve. */
export function validarArquivo(arquivo: File, tipo: TipoMidia): string | null {
  const permitidos = tipo === 'gif' ? MIME_GIF : MIME_SOM;
  if (!permitidos.includes(arquivo.type)) {
    return tipo === 'gif'
      ? 'Envie um GIF, PNG ou WEBP.'
      : 'Envie um MP3, WAV ou OGG.';
  }
  const limite = limiteDe(tipo);
  if (arquivo.size > limite) {
    return `O arquivo tem ${emMB(arquivo.size)}. O limite é ${emMB(limite)}.`;
  }
  return null;
}

/**
 * Nome de arquivo seguro para o Storage.
 *
 * Acento e espaço no caminho quebram a URL pública em alguns navegadores, e
 * nome repetido sobrescreveria a mídia de outra pessoa — daí o sufixo.
 */
export function caminhoDoArquivo(empresaId: string, tipo: TipoMidia, nomeOriginal: string): string {
  const extensao = (nomeOriginal.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const base = nomeOriginal
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
        .replace(new RegExp('[\u0300-\u036f]', 'g'), '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase() || 'midia';
  const sufixo = Math.random().toString(36).slice(2, 8);
  return `${empresaId}/${tipo}/${base}-${sufixo}.${extensao}`;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** null = migration 20260731f ainda não aplicada; a tela esconde o recurso. */
export async function listarMidias(empresaId: string): Promise<MidiaComemoracao[] | null> {
  const { data, error } = await supabase
    .from('comemoracao_midias')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false });

  if (error) {
    if (error.code === '42P01') return null;
    logger.warn('[comemoracaoMidias] erro ao listar:', error.message);
    return [];
  }
  return (data ?? []) as MidiaComemoracao[];
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function enviarMidia(params: {
  empresaId: string;
  criadoPor: string;
  tipo:      TipoMidia;
  arquivo:   File;
  nome?:     string;
  /** Trecho escolhido (só som). Ausente = arquivo inteiro. */
  trecho?:   { inicio: number; duracao: number } | null;
}): Promise<Resultado<MidiaComemoracao>> {
  const problema = validarArquivo(params.arquivo, params.tipo);
  if (problema) return { ok: false, erro: problema, dados: null };

  const caminho = caminhoDoArquivo(params.empresaId, params.tipo, params.arquivo.name);

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, params.arquivo, { upsert: false, contentType: params.arquivo.type });

  if (erroUpload) {
    logger.warn('[comemoracaoMidias] erro no upload:', erroUpload.message);
    return {
      ok: false,
      erro: /bucket/i.test(erroUpload.message)
        ? 'O bucket "comemoracoes" não existe. Aplique a migration 20260731f.'
        : 'Não foi possível enviar o arquivo.',
      dados: null,
    };
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(caminho);

  const { data, error } = await supabase
    .from('comemoracao_midias')
    .insert({
      empresa_id: params.empresaId,
      criado_por: params.criadoPor,
      tipo:       params.tipo,
      nome:       (params.nome ?? params.arquivo.name).slice(0, 60),
      url:        publicUrl,
      caminho,
      // Só grava o trecho quando ele existe: assim a coluna continua NULL para
      // GIF e para som enviado antes da 20260731g, que toca inteiro.
      ...(params.trecho
        ? { inicio_s: params.trecho.inicio, trecho_s: params.trecho.duracao }
        : {}),
    })
    .select('*')
    .single();

  if (error || !data) {
    // O arquivo já subiu; sem a linha ele viraria lixo invisível no bucket.
    await supabase.storage.from(BUCKET).remove([caminho]);
    logger.warn('[comemoracaoMidias] erro ao registrar:', error?.message);
    return { ok: false, erro: 'Não foi possível salvar a mídia.', dados: null };
  }

  return { ok: true, erro: null, dados: data as MidiaComemoracao };
}

export async function excluirMidia(midia: MidiaComemoracao): Promise<Resultado> {
  const { error } = await supabase.from('comemoracao_midias').delete().eq('id', midia.id);
  if (error) {
    logger.warn('[comemoracaoMidias] erro ao excluir:', error.message);
    return { ok: false, erro: 'Não foi possível excluir a mídia.', dados: null };
  }
  // O arquivo vai depois: se esta parte falhar sobra um órfão no bucket, o que
  // é bem melhor que uma linha apontando para arquivo que não existe mais.
  await supabase.storage.from(BUCKET).remove([midia.caminho]);
  return { ok: true, erro: null, dados: null };
}
