/**
 * lerArquivo.ts — ponte browser: recebe um File (.xlsx), calcula o hash,
 * seleciona a aba operacional pelo nome do arquivo e produz o ResultadoArquivo
 * consolidado por operador. Não move dinheiro.
 */

import ExcelJS from 'exceljs';
import { selecionarAbaOperacional } from './selecionarAba';
import { lerAbaOperacional, sha256Hex, type ResolverOperador } from './parser';
import type { ResultadoArquivo } from './types';

const EXT_VALIDA = /\.xlsx$/i;
const ASSINATURA_ZIP = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — todo .xlsx é um zip

/** Erro amigável quando o arquivo não parece um .xlsx real. */
function validarArquivo(nome: string, bytes: Uint8Array): string | null {
  if (!EXT_VALIDA.test(nome)) return 'Extensão inválida — envie um arquivo .xlsx.';
  const okAssinatura = ASSINATURA_ZIP.every((b, i) => bytes[i] === b);
  if (!okAssinatura) return 'Arquivo não parece um .xlsx válido (assinatura incorreta).';
  return null;
}

/** sha256 hex dos bytes do arquivo (idempotência/auditoria). */
async function hashArquivo(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Lê um File e devolve o resultado classificado + consolidado. */
export async function lerArquivoOperador(
  file: File,
  resolverOperador: ResolverOperador,
): Promise<ResultadoArquivo> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  const base: ResultadoArquivo = {
    nomeArquivo: file.name, principal: file.name.replace(EXT_VALIDA, ''),
    abaUsada: null, hashArquivo: '', ok: false, linhas: [],
    totais: { verdesPagas: 0, pendentes: 0, needsReview: 0, operadoresComPendencia: 0, totalPendenteBruto: '0.00000' },
    consolidado: [],
  };

  const erroArquivo = validarArquivo(file.name, bytes);
  if (erroArquivo) { base.error = erroArquivo; return base; }

  base.hashArquivo = await hashArquivo(buf);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    base.error = 'Não foi possível abrir a planilha (arquivo corrompido?).';
    return base;
  }

  const nomes = wb.worksheets.map(w => w.name);
  const sel = selecionarAbaOperacional(file.name, nomes);
  if (!sel.ok) { base.error = sel.error ?? 'Aba operacional não encontrada.'; return base; }

  const ws = wb.getWorksheet(sel.aba!);
  if (!ws) { base.error = `Aba "${sel.aba}" não pôde ser lida.`; return base; }

  return lerAbaOperacional(ws, {
    principal: sel.principal,
    nomeArquivo: file.name,
    hashArquivo: base.hashArquivo,
    resolverOperador,
  });
}

export { sha256Hex };
