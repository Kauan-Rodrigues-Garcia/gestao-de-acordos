/**
 * relatorio1017Parser.ts
 * Parser do relatório 1017 — a recorrência que a Manutenção cuida.
 *
 * ## O que é
 *
 * As parcelas da 2ª em diante de Pix automático e cartão recorrente pagas no
 * mês — o que o 59 chama de colchão. Soma só no recebimento GERAL do setor que
 * usa o relatório (cadastro `setor_relatorios`), nunca em operador, equipe ou
 * empresa. Ver `src/lib/relatoriosDoSetor.ts` e a migration 20261112150000.
 *
 * Colunas (por cabeçalho, ordem real de nov/2026):
 *   Cód. franquia | Franquia | Vendedor | Usuário | Nr. Documento | Cód. Cliente |
 *   Dt. Venda | Dt. Aprovação | Dt. Cancel. Recorrência | Cód. Receber |
 *   Cód. Acordo | Dt. Acordo | Inclusão Acordo | Inclusão Grupo |
 *   Dt. Cancel Acordo | Cancelamento Acordo | Cancelamento Grupo |
 *   Dt. Vencimento | Dt. Pagamento | Tipo Recorrência | Status |
 *   Parcela Recorrência | Valor
 *
 * Usa: Nr. Documento, Cód. Cliente, Franquia, Dt. Vencimento, Dt. Pagamento,
 * Tipo Recorrência, Status, Parcela Recorrência, Valor. Vendedor e Usuário
 * ficam de fora de propósito: o 1017 não é de pessoa nenhuma.
 *
 * ## Regras
 *
 *   • A última linha do arquivo é o TOTAL (só «Valor»). Sai calada.
 *   • Sem Dt. Pagamento não foi pago: fica fora, e a prévia diz.
 *   • Parcela 1 é a venda/acordo, que entra pelo 58/59: fica fora, e a prévia
 *     diz. (Em nov/2026 o arquivo não trouxe nenhuma.)
 *   • Um mês por arquivo. Pagamento de dois meses = erro, para ninguém trocar
 *     o mês errado pelo arquivo.
 *   • Mesmo NR + mesmo dia + mesma parcela duas vezes = erro (a chave do banco).
 *
 * ⚠️  Este arquivo importa `@e965/xlsx`. Importe daqui só no fluxo de
 *     importação de arquivo, e dinamicamente.
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import { norm, toDate } from '@/services/analitico/analiticoComum';
import { valorDaCelula } from '@/services/relatorio994/relatorio994Parser';
import { identificarRelatorio, MSG_OUTRO_NO_LUGAR_DO_1017 } from '@/services/relatorio945/identificar';

export interface Soma { linhas: number; valor: number }

/** Uma linha como a RPC `fn_relatorio_setor_importar` recebe. */
export interface Linha1017 {
  nr: string;
  cod_cliente: string | null;
  franquia: string | null;
  tipo: string | null;
  status: string | null;
  parcela: number | null;
  /** 'yyyy-MM-dd' */
  vencimento: string | null;
  /** 'yyyy-MM-dd' */
  pagamento: string;
  valor: number;
}

export interface ResultadoParse1017 {
  cabecalho: string[];
  linhas: Linha1017[];
  /** 'yyyy-MM' do arquivo; `null` quando não há linha válida ou há mais de um mês. */
  mes: string | null;
  total: Soma;
  /** Pix / Cartão de Crédito — o que a prévia mostra. */
  porTipo: Record<string, Soma>;
  fora: {
    semPagamento: Soma;
    parcelaUm: Soma;
    semNr: Soma;
  };
  erros: string[];
}

type ColKeys = 'nr' | 'cli' | 'franquia' | 'venc' | 'dt' | 'tipo' | 'status' | 'parcela' | 'valor';

/** Nomes normalizados por `norm` (sem acento, minúsculo, sem espaço). */
const COL_ALIASES: Record<ColKeys, string[]> = {
  nr:       ['nr.documento', 'nrdocumento'],
  cli:      ['cod.cliente', 'codcliente'],
  franquia: ['franquia'],
  venc:     ['dt.vencimento', 'dtvencimento'],
  dt:       ['dt.pagamento', 'dtpagamento'],
  tipo:     ['tiporecorrencia'],
  status:   ['status'],
  parcela:  ['parcelarecorrencia'],
  valor:    ['valor'],
};

function resolveCols(headers: unknown[]): Partial<Record<ColKeys, number>> | null {
  const map: Partial<Record<ColKeys, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(COL_ALIASES) as [ColKeys, string[]][]) {
      // Igualdade, não prefixo: «Cód. franquia» e «Franquia» são colunas diferentes.
      if (!(key in map) && aliases.includes(n)) map[key] = i;
    }
  });
  const required: ColKeys[] = ['nr', 'dt', 'parcela', 'valor'];
  return required.every(k => k in map) ? map : null;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** NR como texto: o Excel às vezes entrega número («12943442» vira 12943442). */
function textoDoNr(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.trunc(v)) : '';
  return String(v ?? '').trim();
}

function textoOuNulo(v: unknown): string | null {
  if (v == null) return null;
  const s = (typeof v === 'number' ? String(Math.trunc(v)) : String(v)).trim();
  return s || null;
}

function parcelaDaCelula(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const somar = (s: Soma, valor: number) => { s.linhas++; s.valor += valor; };
const centavos = (s: Soma): Soma => ({ linhas: s.linhas, valor: Math.round(s.valor * 100) / 100 });

function resultadoVazio(erros: string[], cabecalho: string[] = []): ResultadoParse1017 {
  return {
    cabecalho,
    linhas: [],
    mes: null,
    total: { linhas: 0, valor: 0 },
    porTipo: {},
    fora: {
      semPagamento: { linhas: 0, valor: 0 },
      parcelaUm:    { linhas: 0, valor: 0 },
      semNr:        { linhas: 0, valor: 0 },
    },
    erros,
  };
}

export async function parseRelatorio1017(arquivo: File): Promise<ResultadoParse1017> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return resultadoVazio(['Planilha vazia ou inválida.']);
  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  return parseRelatorio1017Rows(rows);
}

/** Versão pura do parser — o teste passa as linhas sem arquivo. */
export function parseRelatorio1017Rows(rows: unknown[][]): ResultadoParse1017 {
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

  const headerRow = rows[0] as unknown[];
  const cabecalho = headerRow.map(h => String(h ?? '').trim());
  const tipoArquivo = identificarRelatorio(headerRow);
  if (tipoArquivo !== '1017') return resultadoVazio([MSG_OUTRO_NO_LUGAR_DO_1017(tipoArquivo)], cabecalho);

  const cols = resolveCols(headerRow);
  if (!cols) {
    return resultadoVazio([
      'Colunas obrigatórias do 1017 (Nr. Documento, Dt. Pagamento, Parcela Recorrência, Valor) não encontradas. '
      + `Cabeçalhos lidos: ${headerRow.map(h => `"${h}"`).join(', ')}.`,
    ], cabecalho);
  }

  const r = resultadoVazio([], cabecalho);
  const meses = new Set<string>();
  const vistas = new Map<string, number>();
  const repetidas: string[] = [];
  const cel = (row: unknown[], k: ColKeys) => (cols[k] == null ? null : row[cols[k]!]);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every(c => c == null || c === '')) continue;   // linha em branco

    const nr = textoDoNr(cel(row, 'nr'));
    const valor = valorDaCelula(cel(row, 'valor'));
    const pagamento = toDate(cel(row, 'dt'));
    // O TOTAL: sem NR e sem pagamento, só o valor.
    if (!nr && !pagamento) continue;
    if (!nr) { somar(r.fora.semNr, valor); continue; }
    if (!pagamento) { somar(r.fora.semPagamento, valor); continue; }

    const parcela = parcelaDaCelula(cel(row, 'parcela'));
    if (parcela === 1) { somar(r.fora.parcelaUm, valor); continue; }
    if (!valor) continue;

    const pagamentoIso = iso(pagamento);
    const chave = `${nr}|${pagamentoIso}|${parcela ?? 0}`;
    if (vistas.has(chave)) { repetidas.push(`linha ${i + 1} (NR ${nr})`); continue; }
    vistas.set(chave, i + 1);

    const vencimento = toDate(cel(row, 'venc'));
    const tipo = textoOuNulo(cel(row, 'tipo'));
    r.linhas.push({
      nr,
      cod_cliente: textoOuNulo(cel(row, 'cli')),
      franquia:    textoOuNulo(cel(row, 'franquia')),
      tipo,
      status:      textoOuNulo(cel(row, 'status')),
      parcela,
      vencimento:  vencimento ? iso(vencimento) : null,
      pagamento:   pagamentoIso,
      valor:       Math.round(valor * 100) / 100,
    });
    meses.add(pagamentoIso.slice(0, 7));
    somar(r.total, valor);
    const t = tipo ?? 'Sem tipo';
    somar(r.porTipo[t] ?? (r.porTipo[t] = { linhas: 0, valor: 0 }), valor);
  }

  if (repetidas.length) {
    r.erros.push(
      `O mesmo Nr. Documento aparece duas vezes no mesmo dia e parcela: ${repetidas.slice(0, 5).join(', ')}`
      + (repetidas.length > 5 ? ` e mais ${repetidas.length - 5}.` : '.'));
  }
  if (meses.size > 1) {
    r.erros.push(`O arquivo tem pagamentos de ${meses.size} meses (${[...meses].sort().join(', ')}). `
      + 'Exporte o 1017 de um mês só.');
  } else if (meses.size === 1) {
    r.mes = [...meses][0];
  }
  if (!r.linhas.length && !r.erros.length) r.erros.push('Nenhuma linha paga no arquivo.');

  r.total = centavos(r.total);
  for (const k of Object.keys(r.porTipo)) r.porTipo[k] = centavos(r.porTipo[k]);
  r.fora = {
    semPagamento: centavos(r.fora.semPagamento),
    parcelaUm:    centavos(r.fora.parcelaUm),
    semNr:        centavos(r.fora.semNr),
  };
  return r;
}
