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
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import type { FormaPagementoAnalitico } from '@/lib/supabase';

// ── Tipos de saída ───────────────────────────────────────────────────────────

export interface LinhaRelatorio {
  operador_usuario: string;
  equipe: string;
  codigo: string;
  nome_cliente: string;
  forma_pagamento: FormaPagementoAnalitico;
  tpdoc_original: string;
  valor_recebido: number;
  total_ho: number;
  data_pagamento: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza string para comparação de cabeçalhos: remove acentos, lower, sem espaços */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

/** Extrai código numérico de "1994034 - NOME DO CLIENTE" */
export function extrairCodigo(cli: unknown): string {
  const s = String(cli ?? '').trim();
  const m = s.match(/^\s*(\d+)/);
  if (m) return m[1];
  return (s.split(/\s*-\s*/)[0] ?? '').trim();
}

/** Extrai nome de "1994034 - NOME DO CLIENTE" */
export function extrairNome(cli: unknown): string {
  const s = String(cli ?? '').trim();
  const idx = s.indexOf(' - ');
  if (idx === -1) return s;
  return s.slice(idx + 3).trim();
}

/** Converte valor de célula Excel para Date (serial, dd/mm/yyyy, yyyy-mm-dd) */
export function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number') {
    const utc = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (isNaN(utc.getTime())) return null;
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Retorna o 1º dia do mês de uma data */
export function mesReferencia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** true se TpDoc indica cartão */
export function isCartao(tpdoc: string): boolean {
  return norm(tpdoc).includes('cartao');
}

/** Mapeia TpDoc → FormaPagementoAnalitico */
export function mapearFormaPgto(tpdoc: string): FormaPagementoAnalitico {
  return isCartao(tpdoc) ? 'cartao' : 'boleto_pix';
}

// ── Resolução de colunas ─────────────────────────────────────────────────────

type ColKeys = 'op' | 'eq' | 'cli' | 'tp' | 'dt' | 'rec' | 'ho';

const COL_ALIASES: Record<ColKeys, string[]> = {
  op:  ['cobradora', 'operador', 'cobrador'],
  eq:  ['equipe/subgrupo', 'equipe', 'subgrupo'],
  cli: ['cliente'],
  // NÃO incluir "tipovenda" — só TpDoc / forma de pagamento
  tp:  ['tpdoc', 'formadepagamento', 'formapagamento'],
  dt:  ['dtpgto', 'datapgto', 'datapagamento', 'datadopagamento'],
  rec: ['recebido', 'valorrecebido'],
  ho:  ['totalho', 'ho'],
};

export function resolveCols(headers: unknown[]): Record<ColKeys, number> | null {
  const map: Partial<Record<ColKeys, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(COL_ALIASES) as [ColKeys, string[]][]) {
      if (!(key in map) && aliases.some(a => n === a || n.startsWith(a))) {
        map[key] = i;
      }
    }
  });
  const required: ColKeys[] = ['op', 'cli', 'tp', 'dt', 'rec'];
  if (required.every(k => k in map)) return map as Record<ColKeys, number>;
  return null;
}

// ── Parsing de linhas brutas ─────────────────────────────────────────────────

function parsearValor(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Consolidação de cartão ───────────────────────────────────────────────────

/**
 * Agrupa linhas de cartão por (operador_usuario + codigo), somando recebido e HO.
 * Linhas de boleto/pix passam diretamente sem agrupamento.
 */
function consolidar(linhas: LinhaRelatorio[]): LinhaRelatorio[] {
  const boleto = linhas.filter(l => l.forma_pagamento !== 'cartao');
  const cartao  = linhas.filter(l => l.forma_pagamento === 'cartao');

  const grupos = new Map<string, LinhaRelatorio>();
  for (const l of cartao) {
    const chave = `${l.operador_usuario}::${l.codigo}`;
    const existe = grupos.get(chave);
    if (existe) {
      existe.valor_recebido += l.valor_recebido;
      existe.total_ho       += l.total_ho;
    } else {
      grupos.set(chave, { ...l });
    }
  }

  return [...boleto, ...grupos.values()];
}

// ── Parse principal ──────────────────────────────────────────────────────────

export interface ResultadoParseRelatorio {
  linhas: LinhaRelatorio[];
  erros: string[];
}

/**
 * Lê um arquivo Excel do relatório ERP e retorna as linhas consolidadas.
 * Rejeita o arquivo se as colunas obrigatórias não forem encontradas.
 */
export async function parseRelatorioExcel(arquivo: File): Promise<ResultadoParseRelatorio> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { linhas: [], erros: ['Planilha vazia ou inválida.'] };

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return { linhas: [], erros: ['Planilha sem dados.'] };

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
    };
  }

  const erros: string[] = [];
  const linhasBrutas: LinhaRelatorio[] = [];

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
    });
  }

  const linhas = consolidar(linhasBrutas);
  return { linhas, erros };
}
