/**
 * selecionarAba.ts — escolha determinística da aba operacional pelo nome do
 * arquivo (nunca por posição/arbitrariedade).
 *
 * Regra:
 *  1. Tira o caminho e a extensão .xlsx → nome principal/responsável.
 *  2. Acha a aba cujo nome == nome do arquivo (ignorando caixa e espaços das
 *     extremidades).
 *  3. Se não existir, erro claro (não escolhe outra aba).
 */

/** Abas de resumo/pivô que nunca devem ser importadas. */
const ABAS_IGNORADAS = new Set<string>([
  'planilha1', 'planilha2', 'planilha3', 'planilha4', 'planilha5', 'planilha6', 'planilha7',
  'pago', 'pagamento', 'pagamentos', 'detalhes1', 'detalhes', 'resumo', 'resumos', 'pivot', 'pivo',
]);

/** "C:\\...\\Luciana.xlsx" ou "Luciana.xlsx" → "Luciana" (sem caminho, sem extensão). */
export function nomePrincipalDoArquivo(nomeArquivo: string): string {
  const base = nomeArquivo.split(/[\\/]/).pop() ?? nomeArquivo;   // remove caminho
  return base.replace(/\.xlsx$/i, '').trim();                     // remove extensão
}

/** Comparação de nome de aba: minúsculas + trim (extremidades). */
function chaveAba(nome: string): string {
  return nome.trim().toLowerCase();
}

export interface ResultadoSelecaoAba {
  ok: boolean;
  /** Nome principal derivado do arquivo. */
  principal: string;
  /** Nome REAL da aba encontrada (como está no workbook). */
  aba?: string;
  error?: string;
}

/**
 * Seleciona a aba operacional. `sheetNames` = nomes das abas do workbook.
 * Não importa das abas de resumo; exige match exato (case/trim-insensitive)
 * com o nome do arquivo.
 */
export function selecionarAbaOperacional(
  nomeArquivo: string,
  sheetNames: string[],
): ResultadoSelecaoAba {
  const principal = nomePrincipalDoArquivo(nomeArquivo);
  if (!principal) {
    return { ok: false, principal, error: 'Nome de arquivo inválido (sem nome antes de .xlsx).' };
  }
  const alvo = chaveAba(principal);

  if (ABAS_IGNORADAS.has(alvo)) {
    return { ok: false, principal, error: `O nome do arquivo ("${principal}") é uma aba de resumo, não uma aba operacional.` };
  }

  const encontrada = sheetNames.find(s => chaveAba(s) === alvo);
  if (!encontrada) {
    return {
      ok: false,
      principal,
      error: `Aba "${principal}" não encontrada no arquivo. Abas disponíveis: ${sheetNames.join(', ')}.`,
    };
  }
  return { ok: true, principal, aba: encontrada };
}

/** true se a aba é de resumo/pivô (para pular em varreduras). */
export function ehAbaIgnorada(nome: string): boolean {
  return ABAS_IGNORADAS.has(chaveAba(nome));
}
