/**
 * relatorio994Parser.ts
 * Parser do relatório 994 — a produção da equipe de Retenção do Jornada.
 *
 * ## Por que um relatório só para três pessoas
 *
 * O Jornada tem dois relatórios do ERP. O 58 traz os operadores do setor e
 * DESCARTA a Retenção (`ehEquipeRetencao`); o 994 traz a Retenção. Em
 * outubro/2026 ela é monica_souza, vitoria_nascimento e jessica_s_souza — as
 * únicas pessoas com Sub Grupo «RETENÇÃO» no arquivo.
 *
 * O 994 pode vir com o Jornada INTEIRO (563 linhas, 17 operadores em
 * out/2026), não só com a Retenção. O resto entra pelo 58/59; importar o
 * arquivo todo contaria esse dinheiro duas vezes. Por isso a linha que não é
 * da Retenção sai aqui.
 *
 * Quem é Retenção quem diz é a coluna Sub Grupo, não uma lista de nomes: gente
 * que entrar ou sair da equipe muda no ERP e o importador acompanha sozinho.
 *
 * Colunas (por cabeçalho, ordem real de out/2026):
 *   Cód. Venda | Nr. Doc. | Cód. Acordo | Cód. Cliente | Cliente | Franquia |
 *   Operador | Tp. Documento | Data Acordo | Data Pagamento |
 *   Pago no mesmo dia? | Valor Pagto | CodItens | Item | TipoVenda |
 *   Setor Original | Sub Grupo
 *
 * A última linha do arquivo é o TOTAL (só «Valor Pagto» preenchido). Sai calada.
 *
 * ## Tudo o que é da Retenção entra (decisão do usuário, 28/10/2026)
 *
 * O 994 é a PRODUÇÃO da Retenção: todo acordo fechado, pelo valor cheio. O
 * número da pessoa no gestão tem de ser o do ERP, ao centavo — em out/2026 a
 * Jessica era R$ 30.423,30 no ERP e R$ 16.078,56 aqui, porque este parser
 * deixava de fora:
 *
 *   • **Pagamento com data futura.** «PADRÃO»/«* PADRÃO» vêm com Data
 *     Pagamento de meses à frente (até 2028), no mesmo dia do mês do acordo —
 *     a data da última parcela. A linha entra na DATA DO ACORDO, como o 59 já
 *     faz com o cartão parcelado.
 *   • **Pix Automático de acordo antigo** (o Colchão do 58). Entra no dia em
 *     que foi pago, como qualquer pagamento.
 *   • **Linha sem Nr. Doc.** (out/2026: um PADRÃO de R$ 1.200). Entra com o
 *     Cód. Acordo no lugar do NR, para não sumir do total.
 *
 * Quem grava é `fn_analitico_994_substituir` (migration 20261028150000), que
 * troca o mês da pessoa pelo arquivo inteiro.
 *
 * Consolidação: 1 linha por (operador + NR + dia + forma) — a chave do índice
 * único do analítico.
 *
 * ⚠️  Este arquivo importa `@e965/xlsx`. Importe daqui só no fluxo de
 *     importação de arquivo, e dinamicamente.
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import {
  ehEquipeRetencao,
  extrairNome,
  norm,
  toDate,
  type LinhaRelatorio,
} from '@/services/analitico/analiticoComum';
import { dayKeyDiario } from '@/services/diario/diarioComum';
import { labelPagamentoBookplay } from '@/services/bookplay/bookplayRecebimentoParser';
import { identificarRelatorio, MSG_OUTRO_NO_LUGAR_DO_994 } from '@/services/relatorio945/identificar';
import type { FormaPagementoAnalitico } from '@/lib/supabase';

export interface Soma { linhas: number; valor: number }

export interface ResultadoParse994 {
  /** Cabeçalho como veio, para a armadilha de colunas comparar. */
  cabecalho: string[];
  /** Retenção, consolidada por operador + NR + dia + forma: o que entra no Analítico. */
  linhas: LinhaRelatorio[];
  /** Total do arquivo por pessoa da Retenção — o número que o ERP mostra. */
  totalPorOperador: Record<string, Soma>;
  /** Pagamento com data futura, lançado na data do acordo. Entra; a prévia diz. */
  naDataDoAcordo: Soma;
  /** Linhas sem Nr. Doc. que entraram pelo Cód. Acordo. */
  peloCodigoDoAcordo: Soma;
  /** O que ficou fora, para a prévia dizer. */
  fora: {
    /** Linhas de outros subgrupos — vêm pelo 58/59. */
    outraEquipe: Soma;
  };
  erros: string[];
}

type ColKeys = 'op' | 'nr' | 'acordo' | 'cli' | 'tp' | 'dtAcordo' | 'dt' | 'rec' | 'eq';

/** Nomes normalizados por `norm` (sem acento, minúsculo, sem espaço). */
const COL_ALIASES: Record<ColKeys, string[]> = {
  op:       ['operador', 'cobradora'],
  nr:       ['nr.doc.', 'nr.doc', 'nrdoc', 'nrdocumento'],
  acordo:   ['cod.acordo', 'codacordo'],
  cli:      ['cliente'],
  tp:       ['tp.documento', 'tpdocumento', 'tpdoc'],
  dtAcordo: ['dataacordo'],
  dt:       ['datapagamento', 'dtpgto'],
  rec:      ['valorpagto', 'valorpagamento', 'recebido'],
  eq:       ['subgrupo', 'equipe/subgrupo'],
};

function resolveCols(headers: unknown[]): Partial<Record<ColKeys, number>> | null {
  const map: Partial<Record<ColKeys, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(COL_ALIASES) as [ColKeys, string[]][]) {
      // Igualdade, não prefixo: «Cód. Cliente» e «Cliente» começam diferente,
      // mas «nr» casaria com qualquer coisa.
      if (!(key in map) && aliases.includes(n)) map[key] = i;
    }
  });
  const required: ColKeys[] = ['op', 'nr', 'dt', 'rec', 'eq'];
  return required.every(k => k in map) ? map : null;
}

/**
 * Valor da célula. Número vem como número; texto pode vir em formato brasileiro
 * («1.432,80») ou do ERP exportado em inglês («1,432.80») — o separador que vem
 * por último é o decimal.
 */
export function valorDaCelula(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const decimalVirgula = s.lastIndexOf(',') > s.lastIndexOf('.');
  const limpo = decimalVirgula ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function formaEnum(label: string): FormaPagementoAnalitico {
  return label.startsWith('Cartão') ? 'cartao' : 'boleto_pix';
}

const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const somar = (s: Soma, valor: number) => { s.linhas++; s.valor += valor; };

function resultadoVazio(erros: string[], cabecalho: string[] = []): ResultadoParse994 {
  return {
    cabecalho,
    linhas: [],
    totalPorOperador: {},
    naDataDoAcordo: { linhas: 0, valor: 0 },
    peloCodigoDoAcordo: { linhas: 0, valor: 0 },
    fora: { outraEquipe: { linhas: 0, valor: 0 } },
    erros,
  };
}

export async function parseRelatorio994(arquivo: File): Promise<ResultadoParse994> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return resultadoVazio(['Planilha vazia ou inválida.']);

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

  return parseRelatorio994Rows(rows);
}

/**
 * Versão pura do parser. `hoje` entra de fora para o teste fixar o dia que
 * separa o pago do que ainda vai ser pago.
 */
export function parseRelatorio994Rows(rows: unknown[][], hoje: Date = new Date()): ResultadoParse994 {
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

  const headerRow = rows[0] as unknown[];
  const cabecalho = headerRow.map(h => String(h ?? '').trim());
  const tipo = identificarRelatorio(headerRow);
  if (tipo !== '994') return resultadoVazio([MSG_OUTRO_NO_LUGAR_DO_994(tipo)], cabecalho);

  const cols = resolveCols(headerRow);
  if (!cols) {
    return resultadoVazio([
      'Colunas obrigatórias do 994 (Operador, Nr. Doc., Data Pagamento, Valor Pagto, Sub Grupo) não encontradas. '
      + `Cabeçalhos lidos: ${headerRow.map(h => `"${h}"`).join(', ')}.`,
    ], cabecalho);
  }

  const limite = soData(hoje).getTime();
  const r = resultadoVazio([], cabecalho);
  const porChave = new Map<string, LinhaRelatorio>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (row.every(c => c == null || c === '')) continue; // linha em branco

    const op  = String(row[cols.op!] ?? '').trim();
    const nr  = String(row[cols.nr!] ?? '').trim();
    const rec = valorDaCelula(row[cols.rec!]);
    // A linha de TOTAL: sem operador e sem NR, só o valor.
    if (!op && !nr) continue;

    const eq = String(row[cols.eq!] ?? '').trim();
    if (!ehEquipeRetencao(eq)) {
      somar(r.fora.outraEquipe, rec);
      continue;
    }

    const acordo   = cols.dtAcordo != null ? toDate(row[cols.dtAcordo]) : null;
    const pagou    = toDate(row[cols.dt!]);
    const futuro   = pagou != null && pagou.getTime() > limite;
    // Pago: o dia do pagamento. Ainda vai ser pago: o dia do acordo.
    const dt       = futuro ? (acordo ? soData(acordo) : null) : pagou;
    const codAcordo = cols.acordo != null ? String(row[cols.acordo] ?? '').trim() : '';
    const codigo   = nr || codAcordo;

    if (!op || !codigo || !dt) {
      r.erros.push(
        `Linha ${i + 1}: dados incompletos (operador="${op}", Nr. Doc.="${nr}", `
        + `Cód. Acordo="${codAcordo}", data="${row[cols.dt!] ?? ''}") — ignorada.`);
      continue;
    }

    if (futuro) somar(r.naDataDoAcordo, rec);
    if (!nr) somar(r.peloCodigoDoAcordo, rec);
    somar(r.totalPorOperador[op] ??= { linhas: 0, valor: 0 }, rec);

    const tp    = cols.tp != null ? String(row[cols.tp] ?? '').trim() : '';
    const label = labelPagamentoBookplay(tp);
    const forma = formaEnum(label);
    const cli   = cols.cli != null ? row[cols.cli] : '';

    const chave = `${op}::${codigo}::${dayKeyDiario(dt)}::${forma}`;
    const existe = porChave.get(chave);
    if (existe) {
      existe.valor_recebido += rec;
    } else {
      porChave.set(chave, {
        operador_usuario: op,
        equipe:           '',
        codigo,
        nome_cliente:     extrairNome(cli),
        forma_detalhe:    label,
        forma_pagamento:  forma,
        tpdoc_original:   label,
        valor_recebido:   rec,
        total_ho:         0,
        data_pagamento:   dt,
      });
    }
  }

  // A soma em ponto flutuante não pode virar um centavo a mais no banco.
  const centavos = (v: number) => Math.round(v * 100) / 100;
  r.linhas = [...porChave.values()].map(l => ({ ...l, valor_recebido: centavos(l.valor_recebido) }));
  for (const s of [r.naDataDoAcordo, r.peloCodigoDoAcordo, r.fora.outraEquipe, ...Object.values(r.totalPorOperador)]) {
    s.valor = centavos(s.valor);
  }
  return r;
}
