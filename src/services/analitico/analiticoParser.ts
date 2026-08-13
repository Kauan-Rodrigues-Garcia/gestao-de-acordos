/**
 * analiticoParser.ts
 * Parse de relatório Excel do ERP (PaguePlay) para a aba Analítico.
 *
 * Colunas do relatório (ordem real):
 *   Cobradora | Equipe/SubGrupo | Cliente | Email | Título | Parcela |
 *   NrDocumento | Empresa | Tipo Venda | TpDoc | DtLig | DtPgto |
 *   Dias em atraso | Recebido | Dias entre ligação e baixa | Total HO
 *
 * Regra de consolidação (cartão):
 *   - CARTÃO: agrupar por código do cliente + operador, SOMAR recebido e HO
 *   - PIX/BOLETO: 1 linha por pagamento (sem agrupamento)
 *
 * ⚠️  Este arquivo importa `@e965/xlsx` (~484 KB no bundle). Importe daqui
 *     APENAS no fluxo de importação de arquivo. Tipos e helpers puros vivem em
 *     `analiticoComum.ts` — no caminho de leitura (services, hooks, telas),
 *     importe de lá. Os reexports abaixo existem por compatibilidade, mas usá-los
 *     no caminho de leitura devolve os 484 KB ao bundle.
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import {
  consolidar,
  ehEquipeRetencao,
  extrairCodigo,
  extrairNome,
  mapearFormaPgto,
  parsearValor,
  resolveCols,
  toDate,
  type LinhaRelatorio,
} from './analiticoComum';

// Compatibilidade: quem já importava tipos/helpers deste módulo continua funcionando.
export * from './analiticoComum';

// ── Parse principal ──────────────────────────────────────────────────────────

export interface ResultadoParseRelatorio {
  linhas: LinhaRelatorio[];
  erros: string[];
  /** Linhas da equipe de Retenção descartadas — ver `ehEquipeRetencao`. */
  retencaoRemovidas: number;
}

/**
 * Lê um arquivo Excel do relatório ERP e retorna as linhas consolidadas.
 * Rejeita o arquivo se as colunas obrigatórias não forem encontradas.
 */
export async function parseRelatorioExcel(arquivo: File): Promise<ResultadoParseRelatorio> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { linhas: [], erros: ['Planilha vazia ou inválida.'], retencaoRemovidas: 0 };

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return { linhas: [], erros: ['Planilha sem dados.'], retencaoRemovidas: 0 };

  const headerRow = rows[0] as unknown[];
  const cols = resolveCols(headerRow);
  if (!cols) {
    const encontrados = headerRow.map(h => `"${h}"`).join(', ');
    return {
      linhas: [],
      erros: [
        `Colunas obrigatórias não encontradas. Cabeçalhos lidos: ${encontrados}. ` +
        'Verifique se o arquivo é o relatório correto do ERP.',
      ],
      retencaoRemovidas: 0,
    };
  }

  const erros: string[] = [];
  const linhasBrutas: LinhaRelatorio[] = [];
  let retencaoRemovidas = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (row.every(c => c == null || c === '')) continue; // linha em branco

    const op  = String(row[cols.op]  ?? '').trim();
    const cli = row[cols.cli];
    const tp  = String(row[cols.tp]  ?? '').trim();
    const dt  = toDate(row[cols.dt]);
    const rec = parsearValor(row[cols.rec]);
    const ho  = cols.ho != null ? parsearValor(row[cols.ho]) : 0;
    const eq  = cols.eq != null ? String(row[cols.eq] ?? '').trim() : '';

    // Retenção não é Receptivo: a linha sai antes de virar recebimento.
    if (ehEquipeRetencao(eq)) { retencaoRemovidas++; continue; }

    if (!op || !cli || !tp || !dt) {
      erros.push(`Linha ${i + 1}: dados incompletos (operador="${op}", cliente="${cli}", tipo="${tp}", data="${row[cols.dt]}") — ignorada.`);
      continue;
    }

    const codigo = extrairCodigo(cli);
    if (!codigo) {
      erros.push(`Linha ${i + 1}: código de cliente não identificado em "${cli}" — ignorada.`);
      continue;
    }

    linhasBrutas.push({
      operador_usuario: op,
      equipe:           eq,
      codigo,
      nome_cliente:     extrairNome(cli),
      forma_pagamento:  mapearFormaPgto(tp),
      tpdoc_original:   tp,
      valor_recebido:   rec,
      total_ho:         ho,
      data_pagamento:   dt,
      // "Tipo comissão" (Extra / Integral) — opcional, ver COL_ALIASES.
      tipo_comissao:    cols.tc != null
        ? (String(row[cols.tc] ?? '').trim() || undefined)
        : undefined,
    });
  }

  const linhas = consolidar(linhasBrutas);
  return { linhas, erros, retencaoRemovidas };
}
