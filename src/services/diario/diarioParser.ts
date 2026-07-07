/**
 * diarioParser.ts
 * Parse do relatório Excel de recebimento diário do ERP (PaguePlay).
 *
 * Colunas relevantes do relatório (entre outras):
 *   Data | Id.Baixa | CPF | Profissional | Cód.Acordo | Parcela |
 *   Forma Pgto | Valor Recebido | Operador | Próx. Contato | Tabulação
 *
 * Regras (mesmas do protótipo HTML):
 *   - Linhas sem Operador são descartadas (contadas para aviso)
 *   - Chave de dedupe entre importações do dia: Id.Baixa, ou composta
 *     cpf|acordo|forma|valor|data quando não houver Id.Baixa
 *   - Cartão consolida por Cód.Acordo apenas na EXIBIÇÃO (parcelas somadas);
 *     no banco cada pagamento é uma linha
 *   - Próx.Contato ≤ hoje → acordo "ignorado" (fora dos totais e listas)
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import { toDate } from '@/services/analitico/analiticoParser';

// ── Tipos de saída ───────────────────────────────────────────────────────────

export interface LinhaDiario {
  operador_usuario: string;
  cpf: string;                    // somente dígitos ('' quando ausente)
  nome_cliente: string;           // coluna Profissional
  acordo_codigo: string;
  /** Coluna "Empresa" (BookPlay). Opcional — não usado na PaguePlay. */
  instituicao?: string;
  forma_pagamento: string;        // texto bruto (Pix, Boleto, Cartão Padrão…)
  valor_recebido: number;
  data_pagamento: Date | null;
  prox_contato: Date | null;
  tabulacao: string;
  id_baixa: string;
  chave_unica: string;
}

export interface ResultadoParseDiario {
  linhas: LinhaDiario[];
  erros: string[];
  /** Linhas do arquivo sem a coluna Operador preenchida (descartadas) */
  descartadasSemOperador: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza cabeçalho/valor para comparação: sem acento, minúsculo, só [a-z0-9] */
export function normDiario(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type FormaKindDiario = 'pix' | 'boleto' | 'cartao' | 'outro';

/** Classifica a forma de pagamento bruta em pix/boleto/cartão/outro */
export function formaKindDiario(forma: string): FormaKindDiario {
  const n = normDiario(forma);
  if (n.includes('pix')) return 'pix';
  if (n.includes('cartao')) return 'cartao';
  if (n.includes('boleto')) return 'boleto';
  return 'outro';
}

export function isCartaoDiario(forma: string): boolean {
  return formaKindDiario(forma) === 'cartao';
}

/** Formata CPF com máscara; aceita valores numéricos que perderam zero à esquerda */
export function fmtCPF(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 10) return ('0' + d).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return String(v ?? '').trim();
}

export function dayKeyDiario(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parsearValor(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Resolução de colunas ─────────────────────────────────────────────────────

type ColKeysDiario = 'op' | 'cpf' | 'prof' | 'acordo' | 'forma' | 'valor' | 'idb' | 'prox' | 'dt' | 'tab';

const COL_EXATAS: Partial<Record<ColKeysDiario, string[]>> = {
  op:     ['operador', 'cobradora', 'cobrador'],
  cpf:    ['cpf'],
  prof:   ['profissional', 'nome', 'cliente'],
  acordo: ['codacordo', 'acordo'],
  forma:  ['formapgto', 'formapagamento', 'formadepagamento', 'tpdoc'],
  valor:  ['valorrecebido', 'recebido'],
  idb:    ['idbaixa'],
  prox:   ['proxcontato', 'proximocontato'],
  dt:     ['data', 'dtpagamento', 'datapagamento', 'dtbaixa'],
};

const COL_PARCIAIS: Partial<Record<ColKeysDiario, string[]>> = {
  acordo: ['acordo'],
  forma:  ['forma'],
  valor:  ['valorrecebido'],
  idb:    ['idbaixa'],
  prox:   ['proxcontato', 'proximocontato'],
  dt:     ['datapagamento'],
  tab:    ['tabulacao'],
};

export function resolveColsDiario(headers: unknown[]): Partial<Record<ColKeysDiario, number>> | null {
  const norms = headers.map(h => normDiario(h));
  const map: Partial<Record<ColKeysDiario, number>> = {};

  for (const [key, aliases] of Object.entries(COL_EXATAS) as [ColKeysDiario, string[]][]) {
    const i = norms.findIndex(n => aliases.includes(n));
    if (i !== -1) map[key] = i;
  }
  for (const [key, termos] of Object.entries(COL_PARCIAIS) as [ColKeysDiario, string[]][]) {
    if (key in map) continue;
    const i = norms.findIndex(n => termos.some(t => n.includes(t)));
    if (i !== -1) map[key] = i;
  }

  // Obrigatórias: operador e valor recebido (mesma exigência do protótipo)
  if (map.op == null || map.valor == null) return null;
  return map;
}

// ── Dia de referência ────────────────────────────────────────────────────────

/** Dia mais frequente entre as datas de pagamento (moda); null se nenhum */
export function diaReferencia(linhas: LinhaDiario[]): string | null {
  const contagem: Record<string, number> = {};
  let melhor: string | null = null;
  let melhorN = 0;
  for (const l of linhas) {
    if (!l.data_pagamento) continue;
    const k = dayKeyDiario(l.data_pagamento);
    contagem[k] = (contagem[k] ?? 0) + 1;
    if (contagem[k] > melhorN) { melhorN = contagem[k]; melhor = k; }
  }
  return melhor;
}

// ── Parse principal ──────────────────────────────────────────────────────────

/**
 * Lê o arquivo Excel do relatório de recebimento diário e retorna as linhas.
 * Rejeita o arquivo se as colunas Operador / Valor Recebido não existirem.
 */
export async function parseRelatorioDiario(arquivo: File): Promise<ResultadoParseDiario> {
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
    if (!op) { descartadasSemOperador++; continue; }

    const d        = cols.dt   != null ? toDate(row[cols.dt])   : null;
    const prox     = cols.prox != null ? toDate(row[cols.prox]) : null;
    const idBaixa  = cols.idb  != null ? String(row[cols.idb] ?? '').trim() : '';
    const cpf      = String((cols.cpf != null ? row[cols.cpf] : '') ?? '').replace(/\.0$/, '').replace(/\D/g, '').trim();
    const acordo   = cols.acordo != null ? String(row[cols.acordo] ?? '').trim() : '';
    const forma    = String((cols.forma != null ? row[cols.forma] : '—') ?? '—').trim() || '—';
    const valor    = parsearValor(row[cols.valor!]);
    const tab      = cols.tab != null ? String(row[cols.tab] ?? '').trim() : '';
    const prof     = cols.prof != null ? String(row[cols.prof] ?? '').trim() : '';
    const dk       = d ? dayKeyDiario(d) : '';

    const chave = idBaixa || `${cpf}|${acordo}|${forma}|${valor}|${dk}`;

    linhas.push({
      operador_usuario: op,
      cpf,
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
