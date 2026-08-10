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

/**
 * `imagem` separada de `gif` desde a 20260801a.
 *
 * PNG e WEBP já subiam antes, rotulados como gif — o card sempre teve um slot
 * de mídia só. A separação é de organização: com 30 arquivos na biblioteca,
 * procurar o troféu animado no meio das fotos da equipe é o que atrasa.
 */
export type TipoMidia = 'gif' | 'imagem' | 'som';

/** Rótulo no singular, para as mensagens da tela. */
export const NOME_TIPO: Record<TipoMidia, string> = {
  gif:    'GIF',
  imagem: 'imagem',
  som:    'som',
};

/** Cota de "manter salvos" por tipo, POR EMPRESA (não por pessoa). */
export const MAX_FIXADAS_POR_TIPO = 4;

/** Teto total da biblioteca, por empresa. Espelha o trigger da 20260801a. */
export const MAX_MIDIAS = 30;

/** Quantos dias a mídia não fixada sobrevive. */
export const DIAS_VALIDADE = 3;

export interface MidiaComemoracao {
  id:         string;
  empresa_id: string;
  tipo:       TipoMidia;
  nome:       string;
  url:        string;
  caminho:    string;
  criado_por: string | null;
  criado_em:  string;
  /**
   * Só para som: segundo em que a música começa.
   *
   * Quanto tempo toca NÃO fica aqui — é a duração da comemoração. A coluna
   * `trecho_s` do banco existe da 20260731g e ficou sem uso pelo mesmo motivo:
   * duas durações concorrentes deixariam uma delas sobrando.
   */
  inicio_s?:  number;
  /** Fixada não expira (20260801a). */
  fixada?:    boolean;
  /** Quando a faxina apaga. NULL = fixada. */
  expira_em?: string | null;
}

export const BUCKET = 'comemoracoes';

/**
 * Espelha `file_size_limit` do bucket (10 MB desde a 20260731g). O teto de
 * verdade é o do bucket; isto existe para dar erro legível antes de gastar a
 * subida inteira.
 */
export const LIMITE_BYTES = 10 * 1024 * 1024;

const MIME_GIF    = ['image/gif'];
const MIME_IMAGEM = ['image/png', 'image/webp', 'image/jpeg'];
const MIME_SOM    = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];

const MIME_POR_TIPO: Record<TipoMidia, readonly string[]> = {
  gif:    MIME_GIF,
  imagem: MIME_IMAGEM,
  som:    MIME_SOM,
};

/** `accept` do input de arquivo. */
export function mimesAceitos(tipo: TipoMidia): string {
  return MIME_POR_TIPO[tipo].join(',');
}

/**
 * As duas gavetas da TELA — não as do banco.
 *
 * O card tem um slot visual e um slot de som, e é assim que a biblioteca passou
 * a se mostrar: imagens e GIFs juntos, áudios abaixo, um botão de importar para
 * cada slot. `gif` e `imagem` continuam separados no banco porque a validade, a
 * cota de fixados e o MIME aceito são por tipo.
 */
export type GrupoMidia = 'visual' | 'som';

export const TIPOS_DO_GRUPO: Record<GrupoMidia, readonly TipoMidia[]> = {
  visual: ['gif', 'imagem'],
  som:    ['som'],
};

/** Rótulo do grupo, para botão e mensagem. */
export const NOME_GRUPO: Record<GrupoMidia, string> = {
  visual: 'imagem ou GIF',
  som:    'áudio',
};

export function grupoDoTipo(tipo: TipoMidia): GrupoMidia {
  return tipo === 'som' ? 'som' : 'visual';
}

/** `accept` do input: todos os MIMEs do grupo. */
export function mimesDoGrupo(grupo: GrupoMidia): string {
  return TIPOS_DO_GRUPO[grupo].flatMap((t) => MIME_POR_TIPO[t]).join(',');
}

export type ArquivoValidado =
  | { tipo: TipoMidia; erro: null }
  | { tipo: null;      erro: string };

/**
 * Valida contra um GRUPO e devolve em qual tipo o arquivo cai.
 *
 * Com um botão só para imagem e GIF, quem escolhe não decide mais o tipo — o
 * MIME decide. Por isso a validação e a classificação saem da mesma função: se
 * fossem duas, um dia uma aceitaria o que a outra classificou como null.
 *
 * A mensagem de erro é do grupo. A de `validarArquivo` mandava "use a aba
 * imagem", e as abas deixaram de existir.
 */
export function validarArquivoDoGrupo(arquivo: File, grupo: GrupoMidia): ArquivoValidado {
  const tipo = tipoDoArquivo(arquivo);
  if (!tipo || !TIPOS_DO_GRUPO[grupo].includes(tipo)) {
    return {
      tipo: null,
      erro: grupo === 'visual'
        ? 'Envie um GIF, PNG, JPG ou WEBP.'
        : 'Envie um MP3, WAV ou OGG.',
    };
  }
  if (arquivo.size > LIMITE_BYTES) {
    return { tipo: null, erro: `O arquivo tem ${emMB(arquivo.size)}. O limite é ${emMB(LIMITE_BYTES)}.` };
  }
  return { tipo, erro: null };
}

/**
 * Em qual gaveta o arquivo cai, pelo MIME.
 *
 * Pelo MIME e não pela extensão: `.gif` renomeado para `.png` continua sendo um
 * GIF animado, e é assim que ele tem que aparecer na biblioteca.
 */
export function tipoDoArquivo(arquivo: File): TipoMidia | null {
  if (MIME_GIF.includes(arquivo.type))    return 'gif';
  if (MIME_IMAGEM.includes(arquivo.type)) return 'imagem';
  if (MIME_SOM.includes(arquivo.type))    return 'som';
  return null;
}

/** Dias que faltam até a faxina levar. `null` = fixada, não expira. */
export function diasAteExpirar(
  midia: MidiaComemoracao,
  agora = Date.now(),
): number | null {
  if (midia.fixada || !midia.expira_em) return null;
  const quando = new Date(midia.expira_em).getTime();
  if (!Number.isFinite(quando)) return null;
  return Math.max(0, Math.ceil((quando - agora) / 86_400_000));
}

interface Resultado<T = null> {
  ok:    boolean;
  erro:  string | null;
  dados: T | null;
}

function emMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const ESPERADO: Record<TipoMidia, string> = {
  gif:    'Envie um GIF.',
  imagem: 'Envie um PNG, JPG ou WEBP.',
  som:    'Envie um MP3, WAV ou OGG.',
};

/** Erro legível, ou null se o arquivo serve. */
export function validarArquivo(arquivo: File, tipo: TipoMidia): string | null {
  if (!MIME_POR_TIPO[tipo].includes(arquivo.type)) {
    // Mensagem específica quando o arquivo é válido, só está na aba errada:
    // "envie um GIF" não ajuda quem acabou de escolher um PNG na aba de GIFs.
    const real = tipoDoArquivo(arquivo);
    if (real && real !== tipo) {
      return `Isso é ${real === 'som' ? 'um som' : `${real === 'gif' ? 'um GIF' : 'uma imagem'}`}. Use a aba ${NOME_TIPO[real]}.`;
    }
    return ESPERADO[tipo];
  }
  if (arquivo.size > LIMITE_BYTES) {
    return `O arquivo tem ${emMB(arquivo.size)}. O limite é ${emMB(LIMITE_BYTES)}.`;
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
  /** Segundo em que a música começa (só som). Ausente = do início. */
  inicioS?:  number;
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
      // `trecho_s` fica NULL de propósito: quanto tempo a música toca é a
      // duração da comemoração, decidida na hora de exibir.
      ...(params.inicioS ? { inicio_s: params.inicioS } : {}),
    })
    .select('*')
    .single();

  if (error || !data) {
    // O arquivo já subiu; sem a linha ele viraria lixo invisível no bucket.
    await supabase.storage.from(BUCKET).remove([caminho]);
    logger.warn('[comemoracaoMidias] erro ao registrar:', error?.message);
    return {
      ok: false,
      // O teto de 30 é um RAISE do trigger da 20260801a; a mensagem dele já é
      // escrita para a pessoa ler, então é repassada em vez de mascarada.
      erro: /biblioteca cheia/i.test(error?.message ?? '')
        ? error?.message ?? null
        : 'Não foi possível salvar a mídia.',
      dados: null,
    };
  }

  return { ok: true, erro: null, dados: data as MidiaComemoracao };
}

/**
 * Fixa ou desafixa: mídia fixada não expira em 3 dias.
 *
 * A cota (4 por tipo, por empresa) é validada no BANCO, na própria RPC — não há
 * policy de UPDATE em `comemoracao_midias`, então esta é a única escrita
 * possível, e contar do lado de cá seria contornável e sujeito a corrida entre
 * dois líderes fixando ao mesmo tempo.
 */
export async function fixarMidia(
  id: string,
  fixar: boolean,
): Promise<Resultado<MidiaComemoracao>> {
  const { data, error } = await supabase.rpc('fn_comemoracao_midia_fixar', {
    p_id: id, p_fixar: fixar,
  });

  if (error) {
    logger.warn('[comemoracaoMidias] erro ao fixar:', error.message);
    // As mensagens de cota e de permissão da RPC já são legíveis.
    const conhecida = /fixados|permissão|encontrada/i.test(error.message);
    return {
      ok: false,
      erro: conhecida ? error.message : 'Não foi possível fixar a mídia.',
      dados: null,
    };
  }
  return { ok: true, erro: null, dados: (data ?? null) as MidiaComemoracao | null };
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
