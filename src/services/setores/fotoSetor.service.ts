/**
 * fotoSetor.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fotos do setor: o avatar do card do placar e o do card "Contribuição
 * Receptivo" (BookPlay). Bucket `perfis`, tabela `setores`.
 *
 * Existe porque a gravação falhava EM SILÊNCIO. A única policy de escrita em
 * `setores` é `setores_admin` (só 'administrador'), mas o card fica numa aba de
 * líder+. Como a RLS filtra linhas em vez de recusar o comando, o UPDATE
 * voltava sem erro e com zero linhas afetadas — a tela dizia "salvo!" e a foto
 * sumia no recarregar.
 *
 * A migration 20260805a criou `fn_set_setor_foto`, que devolve `true` só quando
 * uma linha mudou de verdade e levanta 42501 quando a regra recusa. Este
 * serviço traduz isso num resultado que a tela consegue mostrar sem mentir.
 */
import { supabase } from '@/lib/supabase';

/** Qual das duas fotos do setor. */
export type CampoFotoSetor = 'placar' | 'receptivo';

/**
 * Discriminante em STRING, não `ok: boolean`: o tsconfig do projeto roda com
 * `strict: false`, e sem `strictNullChecks` o TypeScript não estreita união por
 * discriminante booleano — `r.mensagem` vira erro de compilação no `else`.
 * Mesmo formato de `EscopoDiario` em services/diario/escopoDiario.ts.
 */
export type ResultadoFotoSetor =
  | { status: 'ok';    url: string }
  | { status: 'falha'; motivo: 'permissao' | 'migration' | 'upload' | 'erro'; mensagem: string };

const BUCKET = 'perfis';

/** Erro de "função/coluna não existe" — migration pendente, não falha real. */
function ehMigrationAusente(mensagem: string): boolean {
  return /does not exist|schema cache|could not find the function/i.test(mensagem);
}

/** A regra recusou (RAISE ... ERRCODE 42501 na função). */
function ehPermissaoNegada(mensagem: string, code?: string): boolean {
  return code === '42501' || /sem permiss[aã]o/i.test(mensagem);
}

/** `setores/<id>.<ext>` no placar, `setores/<id>-receptivo.<ext>` no Receptivo. */
export function caminhoFotoSetor(setorId: string, campo: CampoFotoSetor, ext: string): string {
  const sufixo = campo === 'receptivo' ? '-receptivo' : '';
  return `setores/${setorId}${sufixo}.${ext}`;
}

/**
 * Envia o arquivo e grava a URL no setor.
 *
 * O `?t=` no fim da URL é obrigatório: o path é fixo por setor (upsert), então
 * sem o parâmetro o navegador continuaria exibindo a imagem antiga do cache
 * depois da troca.
 */
export async function salvarFotoSetor(
  setorId: string,
  campo:   CampoFotoSetor,
  arquivo: File,
): Promise<ResultadoFotoSetor> {
  const ext  = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = caminhoFotoSetor(setorId, campo, ext);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arquivo, { upsert: true });
  if (upErr) {
    return { status: 'falha', motivo: 'upload', mensagem: `Erro no upload: ${upErr.message}` };
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${publicUrl}?t=${Date.now()}`;

  // `fn_set_setor_foto` é da migration 20260805a e ainda não está no
  // database.types.ts gerado — daí o cast do cliente, não dos argumentos.
  const rpc = supabase.rpc as unknown as (
    nome: string, args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null; error: { message: string; code?: string } | null }>;

  const { data, error } = await rpc('fn_set_setor_foto', {
    p_setor_id: setorId,
    p_foto_url: url,
    p_campo:    campo,
  });

  if (error) {
    if (ehPermissaoNegada(error.message, error.code)) {
      return {
        status: 'falha', motivo: 'permissao',
        mensagem: 'Você só pode alterar a foto do seu próprio setor.',
      };
    }
    if (ehMigrationAusente(error.message)) {
      return {
        status: 'falha', motivo: 'migration',
        mensagem: 'Foto não salva — migration 20260805a pendente.',
      };
    }
    return { status: 'falha', motivo: 'erro', mensagem: `Erro ao salvar foto: ${error.message}` };
  }

  // A função devolve false quando nenhuma linha mudou (setor inexistente).
  // Sem esta checagem voltaríamos à falha silenciosa que originou o serviço.
  if (data === false) {
    return { status: 'falha', motivo: 'erro', mensagem: 'Setor não encontrado para salvar a foto.' };
  }

  return { status: 'ok', url };
}
