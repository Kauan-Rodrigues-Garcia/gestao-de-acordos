/**
 * tetoDeUpload.ts — o teto de tamanho de anexo, por cargo.
 *
 * Pedido de 05/10/2026: o super admin não tem teto de tamanho para fotos e
 * vídeos nos anexos do chat e dos tickets. Os demais cargos seguem com o teto
 * de cada tela.
 *
 * ## Isto é só o navegador
 *
 * Os buckets `chat` e `tickets` têm `file_size_limit` próprio (10 MB) e ele
 * vale para TODO MUNDO — o Storage não tem teto por cargo. Enquanto o bucket
 * não subir, o servidor recusa acima disso mesmo para o super admin; o que
 * este arquivo tira é a recusa ANTES de tentar. Acima de tudo isso ainda há o
 * teto global de upload do projeto (Dashboard → Storage → Settings).
 */

/** O cargo sem teto no navegador. */
const CARGO_SEM_TETO = 'super_admin';

/** `Infinity`: qualquer `arquivo.size > teto` dá falso, sem caso especial. */
export const SEM_TETO = Number.POSITIVE_INFINITY;

/** O teto que vale para quem está logado: o da tela, ou nenhum. */
export function tetoDeUpload(teto: number, cargo: string | null | undefined): number {
  return cargo === CARGO_SEM_TETO ? SEM_TETO : teto;
}

/**
 * O servidor recusou pelo tamanho? (bucket ou teto global do projeto)
 *
 * O Storage responde 413 com «The object exceeded the maximum allowed size».
 * Serve para a tela dizer o motivo em vez de um «não foi possível enviar» que
 * não explica nada — o caso de quem passou do teto do navegador mas não do
 * bucket.
 */
export function recusadoPeloTamanho(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const { message, statusCode, status } = erro as {
    message?: unknown; statusCode?: unknown; status?: unknown;
  };
  if (String(statusCode ?? status ?? '') === '413') return true;
  return /maximum allowed size|payload too large|entity too large/i.test(String(message ?? ''));
}
