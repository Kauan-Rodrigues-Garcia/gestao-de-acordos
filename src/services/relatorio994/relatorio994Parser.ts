/**
 * relatorio994Parser.ts
 * Parser do relatório 994 — o recebimento da equipe de Retenção do Jornada.
 *
 * ## Por que um relatório só para três pessoas
 *
 * O Jornada tem dois relatórios do ERP. O 58 traz os operadores do setor e
 * DESCARTA a Retenção (`ehEquipeRetencao`); o 994 traz a Retenção. Em
 * outubro/2026 ela é monica_souza, vitoria_nascimento e jessica_s_souza — as
 * únicas pessoas com Sub Grupo «RETENÇÃO» no arquivo.
 *
 * O 994 vem com o Jornada INTEIRO (563 linhas, 17 operadores em out/2026), não
 * só com a Retenção. O resto já entra pelo 58; importar o arquivo todo contaria
 * esse dinheiro duas vezes. Por isso a linha que não é da Retenção sai aqui.
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
 * ## O que fica de fora, e por quê (dito na prévia, nunca calado)
 *
 *   • **Pagamento com data futura.** 80 linhas de «PADRÃO»/«* PADRÃO» em
 *     out/2026 (R$ 157 mil) vêm com Data Pagamento de nov/2026 a jun/2028, no
 *     mesmo dia do mês do acordo — com cara de cartão parcelado com a data da
 *     última parcela. O que ainda não foi pago não é recebimento: a linha sai.
 *     Gravá-la levaria o valor para um mês de 2027.
 *   • **Colchão.** O 994 não tem a coluna «Colchão?» do 58. O Colchão é a 2ª
 *     parcela em diante de Pix Automático ou Cartão Recorrente, e não conta
 *     para o setor (`colchaoContaNaMeta`). Aqui ele é DEDUZIDO: Pix Automático
 *     ou Recorrente pago `DIAS_PARA_SER_COLCHAO` dias ou mais depois do acordo.
 *     Acordo de 07/07 pago em 08/10 é parcela de mês seguinte; acordo de 13/10
 *     pago em 15/10 é a primeira.
 *
 * Consolidação: 1 linha por (operador + NR + dia), como o 58 da BookPlay.
 *
 * ⚠️  Este arquivo importa `@e965/xlsx`. Importe daqui só no fluxo de
 *     importação de arquivo, e dinamicamente.
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import {
  colchaoContaNaMeta,
  ehEquipeRetencao,
  extrairNome,
  norm,
  toDate,
  type LinhaColchao,
  type LinhaRelatorio,
} from '@/services/analitico/analiticoComum';
import { dayKeyDiario } from '@/services/diario/diarioComum';
import { labelPagamentoBookplay } from '@/services/bookplay/bookplayRecebimentoParser';
import { identificarRelatorio, MSG_OUTRO_NO_LUGAR_DO_994 } from '@/services/relatorio945/identificar';
import type { FormaPagementoAnalitico } from '@/lib/supabase';

/**
 * A partir de quantos dias entre o acordo e o pagamento um Pix Automático ou
 * Recorrente é parcela de mês seguinte (Colchão). A cobrança mensal cai entre
 * 28 e 31 dias depois; a primeira, em poucos dias. 25 separa os dois sem
 * depender de o acordo ter sido no fim do mês.
 */
export const DIAS_PARA_SER_COLCHAO = 25;

export interface Soma { linhas: number; valor: number }

export interface ResultadoParse994 {
  /** Cabeçalho como veio, para a armadilha de colunas comparar. */
  cabecalho: string[];
  /** Retenção, consolidada por operador + NR + dia: o que entra no Analítico. */
  linhas: LinhaRelatorio[];
  /** Colchão deduzido (ver o topo): lido e fora da meta. */
  colchao: LinhaColchao[];
  /** O que ficou fora, para a prévia dizer. */
  fora: {
    /** Linhas de outros subgrupos — vêm pelo 58. */
    outraEquipe: Soma;
    /** Data de pagamento depois de hoje. */
    pagamentoFuturo: Soma;
  };
  erros: string[];
}

type ColKeys = 'op' | 'nr' | 'cli' | 'tp' | 'dtAcordo' | 'dt' | 'rec' | 'eq';

/** Nomes normalizados por `norm` (sem acento, minúsculo, sem espaço). */
const COL_ALIASES: Record<ColKeys, string[]> = {
  op:       ['operador', 'cobradora'],
  nr:       ['nr.doc.', 'nr.doc', 'nrdoc', 'nrdocumento'],
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

function ehRecorrencia(label: string): boolean {
  return label === 'Pix Automático' || label === 'Cartão Recorrente';
}

const DIA_MS = 86_400_000;
const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function resultadoVazio(erros: string[], cabecalho: string[] = []): ResultadoParse994 {
  return {
    cabecalho,
    linhas: [],
    colchao: [],
    fora: { outraEquipe: { linhas: 0, valor: 0 }, pagamentoFuturo: { linhas: 0, valor: 0 } },
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
  const erros: string[] = [];
  const fora = { outraEquipe: { linhas: 0, valor: 0 }, pagamentoFuturo: { linhas: 0, valor: 0 } };
  const colchao: LinhaColchao[] = [];
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
      fora.outraEquipe.linhas++;
      fora.outraEquipe.valor += rec;
      continue;
    }

    // A data futura vem antes do «dados incompletos»: a linha que ainda não foi
    // paga sai por isso, falte ou não o NR (em out/2026, uma «Outras» sem Nr.
    // Doc. tinha pagamento em 2027).
    const dt = toDate(row[cols.dt!]);
    if (dt && dt.getTime() > limite) {
      fora.pagamentoFuturo.linhas++;
      fora.pagamentoFuturo.valor += rec;
      continue;
    }

    if (!op || !nr || !dt) {
      erros.push(`Linha ${i + 1}: dados incompletos (operador="${op}", Nr. Doc.="${nr}", data="${row[cols.dt!] ?? ''}") — ignorada.`);
      continue;
    }

    const tp    = cols.tp != null ? String(row[cols.tp] ?? '').trim() : '';
    const label = labelPagamentoBookplay(tp);
    const cli   = cols.cli != null ? row[cols.cli] : '';
    const acordo = cols.dtAcordo != null ? toDate(row[cols.dtAcordo]) : null;

    const parcelaSeguinte = ehRecorrencia(label) && acordo != null
      && (dt.getTime() - acordo.getTime()) / DIA_MS >= DIAS_PARA_SER_COLCHAO;
    if (parcelaSeguinte && !colchaoContaNaMeta(dt)) {
      colchao.push({
        operador_usuario: op,
        equipe:           eq,
        codigo:           nr,
        nome_cliente:     extrairNome(cli),
        nr_documento:     nr,
        titulo:           '',
        parcela:          '',
        forma_pagamento:  formaEnum(label),
        tpdoc_original:   label,
        valor_recebido:   rec,
        total_ho:         0,
        data_pagamento:   dt,
      });
      continue;
    }

    const chave = `${op}::${nr}::${dayKeyDiario(dt)}`;
    const existe = porChave.get(chave);
    if (existe) {
      existe.valor_recebido += rec;
    } else {
      porChave.set(chave, {
        operador_usuario: op,
        equipe:           '',
        codigo:           nr,
        nome_cliente:     extrairNome(cli),
        forma_detalhe:    label,
        forma_pagamento:  formaEnum(label),
        tpdoc_original:   label,
        valor_recebido:   rec,
        total_ho:         0,
        data_pagamento:   dt,
      });
    }
  }

  return { cabecalho, linhas: [...porChave.values()], colchao, fora, erros };
}
