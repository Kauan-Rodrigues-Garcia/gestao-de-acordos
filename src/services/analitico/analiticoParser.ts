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
import { calcHO } from '@/lib/index';
import {
  consolidar,
  colchaoContaNaMeta,
  ehEquipeRetencao,
  ehLinhaColchao,
  extrairCodigo,
  extrairNome,
  mapearFormaPgto,
  parsearValor,
  resolveCols,
  toDate,
  type LinhaColchao,
  type LinhaRelatorio,
} from './analiticoComum';

// Compatibilidade: quem já importava tipos/helpers deste módulo continua funcionando.
export * from './analiticoComum';

/** Centavos, como o banco grava (`numeric(12,2)`). */
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Parse principal ──────────────────────────────────────────────────────────

export interface ResultadoParseRelatorio {
  linhas: LinhaRelatorio[];
  /** Colchão posterior ao corte: não entra na meta e mantém o detalhe por NR. */
  linhasColchao: LinhaColchao[];
  /** Quantidade/valor do Colchão excepcionalmente aceito na meta até 12/08/2026. */
  colchaoNaMeta: { linhas: number; valor: number };
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
  if (!ws) return resultadoVazio(['Planilha vazia ou inválida.']);

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

  return parseRelatorioRows(rows);
}

function resultadoVazio(erros: string[]): ResultadoParseRelatorio {
  return {
    linhas: [],
    linhasColchao: [],
    colchaoNaMeta: { linhas: 0, valor: 0 },
    erros,
    retencaoRemovidas: 0,
  };
}

/**
 * Transforma as linhas já lidas do Excel. Exportado para testar a regra de
 * corte sem criar arquivos binários com dados pessoais do relatório real.
 */
export function parseRelatorioRows(rows: unknown[][]): ResultadoParseRelatorio {
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

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
      linhasColchao: [],
      colchaoNaMeta: { linhas: 0, valor: 0 },
      retencaoRemovidas: 0,
    };
  }

  const erros: string[] = [];
  const linhasBrutas: LinhaRelatorio[] = [];
  const linhasColchao: LinhaColchao[] = [];
  const colchaoNaMeta = { linhas: 0, valor: 0 };
  let retencaoRemovidas = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (row.every(c => c == null || c === '')) continue; // linha em branco

    const op  = String(row[cols.op]  ?? '').trim();
    const cli = row[cols.cli];
    // O relatório 58 traz acordos válidos com TpDoc vazio. Essas linhas eram
    // descartadas e faziam o Detalhado perder centenas de recebimentos. Sem um
    // rótulo de cartão, a classificação conservadora é a forma não-cartão.
    const tpInformado = String(row[cols.tp] ?? '').trim();
    const tp = tpInformado || 'NÃO INFORMADO';
    const dt  = toDate(row[cols.dt]);
    const rec = parsearValor(row[cols.rec]);
    // O H.O. é CALCULADO, não lido. O relatório traz uma coluna "Total HO", mas
    // o número dela é 25,00% do recebido — o ERP divide por 4, e a PaguePlay
    // retém 24,96%. Ver a migration `20260818280000_ho_calculado_2496.sql`.
    //
    // A coluna continua sendo procurada porque a PRESENÇA dela é o que separa o
    // relatório da PaguePlay (tem H.O.) do da BookPlay (não tem). O que se
    // descarta é o valor, não a coluna.
    const ho  = cols.ho != null ? round2(calcHO(rec)) : 0;
    const eq  = cols.eq != null ? String(row[cols.eq] ?? '').trim() : '';

    // Retenção não é Receptivo: a linha sai antes de virar recebimento.
    if (ehEquipeRetencao(eq)) { retencaoRemovidas++; continue; }

    if (!op || !cli || !dt) {
      erros.push(`Linha ${i + 1}: dados incompletos (operador="${op}", cliente="${cli}", tipo="${tp}", data="${row[cols.dt]}") — ignorada.`);
      continue;
    }

    const codigo = extrairCodigo(cli);
    if (!codigo) {
      erros.push(`Linha ${i + 1}: código de cliente não identificado em "${cli}" — ignorada.`);
      continue;
    }

    const tipoComissao = cols.tc != null
      ? (String(row[cols.tc] ?? '').trim() || undefined)
      : undefined;

    const linhaBase: LinhaRelatorio = {
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
      tipo_comissao:    tipoComissao,
    };

    if (cols.colchao != null && ehLinhaColchao(row[cols.colchao])) {
      if (colchaoContaNaMeta(dt)) {
        colchaoNaMeta.linhas++;
        colchaoNaMeta.valor += rec;
        linhasBrutas.push(linhaBase);
      } else {
        const nrDocumento = cols.nr != null ? String(row[cols.nr] ?? '').trim() : '';
        if (!nrDocumento) {
          erros.push(`Linha ${i + 1}: Colchão sem NrDocumento — mantida para conferência, mas sem NR para copiar.`);
        }
        linhasColchao.push({
          operador_usuario: op,
          equipe: eq,
          codigo,
          nome_cliente: extrairNome(cli),
          nr_documento: nrDocumento,
          titulo: cols.titulo != null ? String(row[cols.titulo] ?? '').trim() : '',
          parcela: cols.parcela != null ? String(row[cols.parcela] ?? '').trim() : '',
          forma_pagamento: mapearFormaPgto(tp),
          tpdoc_original: tp,
          tipo_comissao: tipoComissao,
          valor_recebido: rec,
          total_ho: ho,
          data_pagamento: dt,
        });
      }
      continue;
    }

    linhasBrutas.push(linhaBase);
  }

  const linhas = consolidar(linhasBrutas);
  return { linhas, linhasColchao, colchaoNaMeta, erros, retencaoRemovidas };
}
