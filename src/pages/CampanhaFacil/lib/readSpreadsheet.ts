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

  let collectionsSheet: { sheetName: string; rows: unknown[][] } | null = null;
  let report247Sheet: { sheetName: string; rows: unknown[][] } | null = null;

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
    if (CampaignCore.isCollectionsReportRows(rows)) {
      collectionsSheet = { sheetName: candidateSheetName, rows };
      break;
    }
    if (!report247Sheet && CampaignCore.isReport247Rows(rows)) {
      report247Sheet = { sheetName: candidateSheetName, rows };
    }
  }

  // O relatório 245 compartilha alguns cabeçalhos com o 247. Todas as abas são
  // verificadas antes de usar o candidato 247 encontrado primeiro.
  let parsed: ParsedResult | null = null;
  let sheetName = '';
  if (collectionsSheet) {
    progress(68, 'Aplicando os filtros', 'Removendo setores, pagamentos e linhas fora da campanha.');
    parsed = CampaignCore.parseCollectionsReport(collectionsSheet.rows);
    sheetName = collectionsSheet.sheetName;
    progress(90, 'Preparando a campanha', 'Organizando contatos e telefones válidos.');
  } else if (report247Sheet) {
    progress(68, 'Validando o relatório 247', 'Conferindo Cliente, Nr.Documento e Empresa sem exigir valores financeiros.');
    parsed = CampaignCore.parseReport247(report247Sheet.rows);
    sheetName = report247Sheet.sheetName;
    progress(90, 'Preparando a campanha sem valores', 'Organizando clientes, documentos e empresas.');
  }

  if (!parsed) {
    throw new Error(
      'Nenhuma aba compatível foi encontrada. Use o relatório 245 ou o relatório 247 com Cliente, Nr.Documento e Empresa.',
    );
  }

  parsed.sheetName = sheetName;
  return parsed;
}
