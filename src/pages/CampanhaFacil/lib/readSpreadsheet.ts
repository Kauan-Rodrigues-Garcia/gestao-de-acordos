/**
 * Leitura de relatórios em Excel (xls/xlsx) para o Campanha Fácil.
 *
 * Substitui o Web Worker do app original (report-worker.js): aqui usamos o
 * `@e965/xlsx` que já é dependência do projeto, em vez de vendorizar o SheetJS.
 * A detecção 245 vs 247 e o parse continuam vindo da lógica pura em
 * campaign-core.js — só a leitura das linhas mudou de fonte.
 *
 * A varredura roda na thread principal. Para os tamanhos usuais de relatório é
 * instantânea; o limite de 100 mil linhas do original é mantido como guarda.
 */
import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import { CampaignCore, type ParsedResult } from './campaign-core';

export type ProgressCb = (value: number, label: string, detail: string) => void;

export function parseSpreadsheetReport(buffer: ArrayBuffer, onProgress?: ProgressCb): ParsedResult {
  const progress = onProgress ?? (() => {});

  progress(18, 'Lendo a planilha', 'Identificando abas e estrutura do relatório.');
  const workbook = xlsxRead(buffer, { type: 'array', cellDates: false });
  progress(46, 'Localizando os dados', 'Conferindo as colunas necessárias.');

  // Em Excel só entra o 245 — o 247 é .csv e vai por `parseMailing`. A aba do
  // arquivo real se chama "Informações", mas o nome não é usado: o que vale é
  // achar a linha de cabeçalho com as colunas esperadas.
  let report245Sheet: { sheetName: string; rows: unknown[][] } | null = null;

  for (const candidateSheetName of workbook.SheetNames) {
    const rows = xlsxUtils.sheet_to_json<unknown[]>(workbook.Sheets[candidateSheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown[][];
    if (rows.length > 100001) {
      throw new Error('O relatório ultrapassa o limite de 100 mil linhas. Divida o arquivo antes de continuar.');
    }
    if (CampaignCore.isReport245Rows(rows)) {
      report245Sheet = { sheetName: candidateSheetName, rows };
      break;
    }
  }

  if (!report245Sheet) {
    throw new Error(
      'Nenhuma aba compatível foi encontrada. Em Excel, use o relatório 245 (com Grupo, Usuário, Dt.Pagamento, Cliente, Nr.Documento, Empresa e DDD 1/Telefone 1). O relatório 247 é importado em CSV.',
    );
  }

  progress(68, 'Aplicando os filtros', 'Removendo setores, pagamentos e linhas fora da campanha.');
  const parsed: ParsedResult = CampaignCore.parseReport245(report245Sheet.rows);
  progress(90, 'Preparando o preventivo', 'Organizando clientes, contratos e telefones.');
  const sheetName = report245Sheet.sheetName;

  parsed.sheetName = sheetName;
  return parsed;
}
