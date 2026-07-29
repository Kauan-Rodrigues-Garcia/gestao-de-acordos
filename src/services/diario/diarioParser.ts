/**
 * diarioParser.ts
 * Parse do relatório Excel de recebimento diário do ERP (PaguePlay).
 *
 * Colunas relevantes do relatório (entre outras):
 *   Data | Id.Baixa | Cód.Cliente | Profissional | Cód.Acordo | Parcela |
 *   Forma Pgto | Valor Recebido | Operador | Próx. Contato | Tabulação
 *
 * O relatório ainda traz uma coluna CPF, mas ela é IGNORADA de propósito
 * (2026-07-28, pedido da diretoria): nenhum CPF entra no projeto. A
 * identificação do cliente passou a ser o Cód.Cliente, que é o mesmo código
 * usado na tabulação — o que abre caminho para cruzar este relatório com os
 * acordos dos operadores.
 *
 * Regras (mesmas do protótipo HTML):
 *   - Linhas sem Operador são descartadas (contadas para aviso)
 *   - Chave de dedupe entre importações do dia: Id.Baixa, ou composta
 *     codigo|acordo|forma|valor|data quando não houver Id.Baixa
 *   - Cartão consolida por Cód.Acordo apenas na EXIBIÇÃO (parcelas somadas);
 *     no banco cada pagamento é uma linha
 *   - Próx.Contato ≤ data do pagamento → acordo "ignorado" (fora dos totais e listas)
 *
 * ⚠️  Este arquivo importa `@e965/xlsx` (~484 KB no bundle). Importe daqui
 *     APENAS no fluxo de importação de arquivo. Tipos e helpers puros vivem em
 *     `diarioComum.ts` — nas telas e services do diário, importe de lá. Os
 *     reexports abaixo existem por compatibilidade, mas usá-los no caminho de
 *     leitura devolve os 484 KB ao bundle.
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import { toDate } from '@/services/analitico/analiticoComum';
import {
  dayKeyDiario,
  parsearValor,
  resolveColsDiario,
  soDigitos,
  type LinhaDiario,
  type ResultadoParseDiario,
} from './diarioComum';

// Compatibilidade: quem já importava tipos/helpers deste módulo continua funcionando.
export * from './diarioComum';

// ── Parse principal ──────────────────────────────────────────────────────────

/**
 * Lê o arquivo Excel do relatório de recebimento diário e retorna as linhas.
 * Rejeita o arquivo se as colunas Operador / Valor Recebido não existirem.
 */
export async function parseRelatorioDiario(
  arquivo: File,
  opts?: {
    /** PaguePlay: linhas sem operador entram com operador vazio (sem vínculo)
     *  em vez de serem descartadas — somam no consolidado do setor. */
    permitirSemOperador?: boolean;
  },
): Promise<ResultadoParseDiario> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { linhas: [], erros: ['Planilha vazia ou inválida.'], descartadasSemOperador: 0 };

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return { linhas: [], erros: ['Planilha sem dados.'], descartadasSemOperador: 0 };

  const headerRow = rows[0] as unknown[];
  const cols = resolveColsDiario(headerRow);
  if (!cols) {
    const encontrados = headerRow.map(h => `"${h}"`).join(', ');
    return {
      linhas: [],
      erros: [
        `Colunas "Operador" / "Valor Recebido" não encontradas. Cabeçalhos lidos: ${encontrados}. ` +
        'Verifique se o arquivo é o relatório diário correto do ERP.',
      ],
      descartadasSemOperador: 0,
    };
  }

  const erros: string[] = [];
  const linhas: LinhaDiario[] = [];
  let descartadasSemOperador = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (row.every(c => c == null || c === '')) continue; // linha em branco

    const op = String(row[cols.op!] ?? '').trim();
    if (!op) {
      // Rodapé de totais do relatório: sem operador E sem nenhuma identificação
      // (cliente/código/acordo/forma/data) — só os somatórios preenchidos. Nunca
      // importa, senão o total geral do arquivo viraria uma linha "(sem vínculo)".
      const temIdentificacao =
        (cols.prof   != null && String(row[cols.prof]   ?? '').trim() !== '') ||
        (cols.cli    != null && String(row[cols.cli]    ?? '').trim() !== '') ||
        (cols.acordo != null && String(row[cols.acordo] ?? '').trim() !== '') ||
        (cols.idb    != null && String(row[cols.idb]    ?? '').trim() !== '') ||
        (cols.forma  != null && String(row[cols.forma]  ?? '').trim() !== '') ||
        (cols.dt     != null && toDate(row[cols.dt]) != null);
      if (!temIdentificacao) continue;
      descartadasSemOperador++;
      if (!opts?.permitirSemOperador) continue;
    }

    const d        = cols.dt   != null ? toDate(row[cols.dt])   : null;
    const prox     = cols.prox != null ? toDate(row[cols.prox]) : null;
    const idBaixa  = cols.idb  != null ? String(row[cols.idb] ?? '').trim() : '';
    const codigo   = soDigitos(cols.cli != null ? row[cols.cli] : '');
    const acordo   = cols.acordo != null ? String(row[cols.acordo] ?? '').trim() : '';
    const forma    = String((cols.forma != null ? row[cols.forma] : '—') ?? '—').trim() || '—';
    const valor    = parsearValor(row[cols.valor!]);
    const tab      = cols.tab != null ? String(row[cols.tab] ?? '').trim() : '';
    const prof     = cols.prof != null ? String(row[cols.prof] ?? '').trim() : '';
    const dk       = d ? dayKeyDiario(d) : '';

    const chave = idBaixa || `${codigo}|${acordo}|${forma}|${valor}|${dk}`;

    linhas.push({
      operador_usuario: op,
      cliente_codigo:   codigo,
      nome_cliente:     prof,
      acordo_codigo:    acordo,
      forma_pagamento:  forma,
      valor_recebido:   valor,
      data_pagamento:   d,
      prox_contato:     prox,
      tabulacao:        tab,
      id_baixa:         idBaixa,
      chave_unica:      chave,
    });
  }

  return { linhas, erros, descartadasSemOperador };
}
