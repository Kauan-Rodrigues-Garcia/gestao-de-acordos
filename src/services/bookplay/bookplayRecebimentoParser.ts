/**
 * bookplayRecebimentoParser.ts
 * Parser ÚNICO do relatório de recebimentos da BookPlay.
 *
 * Um mesmo relatório alimenta Analítico, Recebimento diário e Colchão,
 * diferente da PaguePlay que usa dois relatórios distintos.
 *
 * Colunas do relatório BookPlay (por cabeçalho, ordem real):
 *   A Cobradora   → operador (username)
 *   B Equipe/SubGrupo → setor/equipe; Retenção é descartada
 *   C Cliente     → "<código PP> - NOME"; usamos SÓ o nome
 *   E Título / F Colchão? / G Parcela → detalhe do Colchão
 *   G NrDocumento → NR (código usado para tabular na BookPlay)
 *   H Empresa     → instituição (bookplay, mundial editora, faculdade bookplay…)
 *   J TpDoc       → forma de pagamento (ver `labelPagamentoBookplay`)
 *   L DtPgto      → data do pagamento
 *   N Recebido    → valor recebido
 *
 * Consolidação:
 *   - Analítico  → 1 linha por (operador + NR): soma TODAS as parcelas do NR
 *     (boleto/pix/cartão) num único valor. Lista enxuta, sem detalhamento.
 *   - Diário     → 1 linha por (operador + NR + dia): soma o que aquele NR
 *     recebeu naquele dia (mantém o filtro por dia correto).
 *
 * Forma de pagamento (BookPlay exibe o tipo real, não "Boleto/Pix"):
 *   - Boleto Bancário / Boleto Negociação → "Boleto"
 *   - Pix                                 → "Pix"
 *   - Pix Automático                      → "Pix Automático"
 *   - (contém "recorrente")               → "Cartão Recorrente"
 *   - EM BRANCO                           → "Cartão de Crédito"
 *
 * ⚠️  A última linha parece um chute e NÃO é. O ERP deixa o TpDoc vazio quando
 *     o pagamento foi no cartão de crédito. No relatório de julho/2026 isso são
 *     878 linhas somando R$ 889.164,62 — quase um terço do arquivo, o que faz a
 *     regra parecer erro de parser quando se olha o número. Confirmado com a
 *     BookPlay em 02/08/2026: é cartão de crédito mesmo. Não "corrija" isto
 *     para "outros"/"desconhecido" sem falar com eles.
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import {
  colchaoContaNaMeta,
  ehEquipeRetencao,
  ehLinhaColchao,
  extrairNome,
  norm,
  toDate,
  type LinhaColchao,
  type LinhaRelatorio,
} from '@/services/analitico/analiticoComum';
import { dayKeyDiario, type LinhaDiario } from '@/services/diario/diarioComum';
import type { FormaPagementoAnalitico } from '@/lib/supabase';

export interface ResultadoParseBookplay {
  analitico: LinhaRelatorio[];
  diario:    LinhaDiario[];
  colchao:   LinhaColchao[];
  colchaoNaMeta: { linhas: number; valor: number };
  retencaoRemovidas: number;
  erros:     string[];
}

/** TpDoc bruto → rótulo exibido na BookPlay. */
export function labelPagamentoBookplay(tpdoc: string): string {
  const n = norm(tpdoc);
  if (!n) return 'Cartão de Crédito';                                   // em branco
  if (n.includes('pix') && n.includes('automatico')) return 'Pix Automático';
  if (n.includes('recorrente')) return 'Cartão Recorrente';
  if (n.includes('pix'))    return 'Pix';
  if (n.includes('boleto')) return 'Boleto';
  if (n.includes('cartao')) return 'Cartão de Crédito';
  return 'Cartão de Crédito';
}

/** Enum de consolidação/badge a partir do rótulo. */
function formaEnum(label: string): FormaPagementoAnalitico {
  return label.startsWith('Cartão') ? 'cartao' : 'boleto_pix';
}

type ColKeys =
  | 'op' | 'eq' | 'cli' | 'nr' | 'emp' | 'tp' | 'dt' | 'rec' | 'tc'
  | 'colchao' | 'titulo' | 'parcela';

const COL_ALIASES: Record<ColKeys, string[]> = {
  op:  ['cobradora', 'operador', 'cobrador'],
  eq:  ['equipe/subgrupo', 'equipe', 'subgrupo'],
  cli: ['cliente'],
  nr:  ['nrdocumento', 'nrdoc', 'nr', 'documento'],
  emp: ['empresa', 'instituicao'],
  tp:  ['tpdoc', 'formadepagamento', 'formapagamento'],
  dt:  ['dtpgto', 'datapgto', 'datapagamento', 'datadopagamento'],
  rec: ['recebido', 'valorrecebido'],
  // "Tipo comissão" (Extra / Integral) — é o ERP dizendo de quem é o vínculo.
  // Fica FORA de `required`: relatório antigo não tem a coluna, e recusar o
  // arquivo por causa dela quebraria a importação de todo mundo.
  // Sem 'comissao' solto — casaria com coluna de VALOR de comissão.
  tc:  ['tipocomissao', 'tipodecomissao'],
  colchao: ['colchao?', 'colchao'],
  titulo:  ['titulo'],
  parcela: ['parcela'],
};

function resolveCols(headers: unknown[]): Partial<Record<ColKeys, number>> | null {
  const map: Partial<Record<ColKeys, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(COL_ALIASES) as [ColKeys, string[]][]) {
      if (!(key in map) && aliases.some(a => n === a || n.startsWith(a))) {
        map[key] = i;
      }
    }
  });
  const required: ColKeys[] = ['op', 'nr', 'dt', 'rec'];
  if (required.every(k => k in map)) return map;
  return null;
}

function parsearValor(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

interface LinhaBruta {
  operador_usuario: string;
  codigo: string;            // NR
  nome_cliente: string;
  instituicao: string;
  label: string;             // rótulo detalhado (Boleto, Pix, …)
  forma: FormaPagementoAnalitico;
  valor_recebido: number;
  data_pagamento: Date;
  /** Texto cru da coluna "Tipo comissão" (Extra / Integral). */
  tipo_comissao: string;
}

/**
 * Lê o relatório Excel (.xlsx/.xls) da BookPlay e devolve as linhas prontas
 * para as três áreas. Rejeita o arquivo se as colunas obrigatórias faltarem.
 */
export async function parseRelatorioBookplay(arquivo: File): Promise<ResultadoParseBookplay> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return resultadoVazio(['Planilha vazia ou inválida.']);

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

  return parseRelatorioBookplayRows(rows);
}

function resultadoVazio(erros: string[]): ResultadoParseBookplay {
  return {
    analitico: [],
    diario: [],
    colchao: [],
    colchaoNaMeta: { linhas: 0, valor: 0 },
    retencaoRemovidas: 0,
    erros,
  };
}

/** Versão pura do parser, usada pelos testes das regras do relatório 58. */
export function parseRelatorioBookplayRows(rows: unknown[][]): ResultadoParseBookplay {
  if (rows.length < 2) return resultadoVazio(['Planilha sem dados.']);

  const cols = resolveCols(rows[0] as unknown[]);
  if (!cols) {
    const encontrados = (rows[0] as unknown[]).map(h => `"${h}"`).join(', ');
    return resultadoVazio([
        `Colunas obrigatórias (Cobradora, NrDocumento, DtPgto, Recebido) não encontradas. ` +
        `Cabeçalhos lidos: ${encontrados}. Verifique se é o relatório correto da BookPlay.`,
    ]);
  }

  const erros: string[] = [];
  const brutas: LinhaBruta[] = [];
  const colchao: LinhaColchao[] = [];
  const colchaoNaMeta = { linhas: 0, valor: 0 };
  let retencaoRemovidas = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (row.every(c => c == null || c === '')) continue; // linha em branco

    const op  = String(row[cols.op!]  ?? '').trim();
    const nr  = String(row[cols.nr!]  ?? '').trim();
    const tp  = cols.tp  != null ? String(row[cols.tp] ?? '').trim() : '';
    const dt  = toDate(row[cols.dt!]);
    const rec = parsearValor(row[cols.rec!]);
    const emp = cols.emp != null ? String(row[cols.emp] ?? '').trim() : '';
    const cli = cols.cli != null ? row[cols.cli] : '';
    const tc  = cols.tc  != null ? String(row[cols.tc]  ?? '').trim() : '';
    const eq  = cols.eq  != null ? String(row[cols.eq]  ?? '').trim() : '';

    // Retenção não pertence à meta do Receptivo. O descarte ocorre antes de
    // montar qualquer uma das saídas para que a linha não vaze para o Diário.
    if (ehEquipeRetencao(eq)) {
      retencaoRemovidas++;
      continue;
    }

    // BookPlay tem vários setores: linha sem operador não tem como ser
    // atribuída a um setor, então continua descartada (diferente da PP).
    if (!op || !nr || !dt) {
      erros.push(`Linha ${i + 1}: dados incompletos (operador="${op}", NR="${nr}", data="${row[cols.dt!]}") — ignorada.`);
      continue;
    }

    const label = labelPagamentoBookplay(tp);

    if (cols.colchao != null && ehLinhaColchao(row[cols.colchao])) {
      if (colchaoContaNaMeta(dt)) {
        colchaoNaMeta.linhas++;
        colchaoNaMeta.valor += rec;
      } else {
        colchao.push({
          operador_usuario: op,
          equipe:           eq,
          codigo:           nr,
          nome_cliente:     extrairNome(cli),
          nr_documento:     nr,
          titulo:           cols.titulo != null ? String(row[cols.titulo] ?? '').trim() : '',
          parcela:          cols.parcela != null ? String(row[cols.parcela] ?? '').trim() : '',
          forma_pagamento:  formaEnum(label),
          tpdoc_original:   label,
          tipo_comissao:    tc || undefined,
          valor_recebido:   rec,
          total_ho:         0,
          data_pagamento:   dt,
        });
        continue;
      }
    }

    brutas.push({
      operador_usuario: op,
      codigo:           nr,
      nome_cliente:     extrairNome(cli),
      instituicao:      emp,
      label,
      forma:            formaEnum(label),
      valor_recebido:   rec,
      data_pagamento:   dt,
      tipo_comissao:    tc,
    });
  }

  // ── Analítico: 1 linha por (operador + NR), somando tudo ──────────────────
  const mapA = new Map<string, LinhaRelatorio>();
  for (const l of brutas) {
    const chave = `${l.operador_usuario}::${l.codigo}`;
    const existe = mapA.get(chave);
    if (existe) {
      existe.valor_recebido += l.valor_recebido;
      // Linha do mesmo NR/operador com o tipo preenchido enquanto a primeira
      // veio em branco: fica o que informa. Não sobrescreve um valor já lido —
      // o mesmo vínculo não muda no meio do relatório.
      if (!existe.tipo_comissao && l.tipo_comissao) existe.tipo_comissao = l.tipo_comissao;
    } else {
      mapA.set(chave, {
        operador_usuario: l.operador_usuario,
        equipe:           '',
        codigo:           l.codigo,
        nome_cliente:     l.nome_cliente,
        instituicao:      l.instituicao,
        forma_detalhe:    l.label,
        forma_pagamento:  l.forma,
        tpdoc_original:   l.label,
        valor_recebido:   l.valor_recebido,
        total_ho:         0,
        data_pagamento:   l.data_pagamento,
        tipo_comissao:    l.tipo_comissao || undefined,
      });
    }
  }

  // ── Diário: 1 linha por (operador + NR + dia) ─────────────────────────────
  const mapD = new Map<string, LinhaDiario>();
  for (const l of brutas) {
    const dk = dayKeyDiario(l.data_pagamento);
    const chave = `${l.operador_usuario}::${l.codigo}::${dk}`;
    const existe = mapD.get(chave);
    if (existe) {
      existe.valor_recebido += l.valor_recebido;
    } else {
      mapD.set(chave, {
        operador_usuario: l.operador_usuario,
        // BookPlay não tem "Cód.Cliente": a chave da operação é o NR
        // (NrDocumento), que vai em `acordo_codigo` e é o que as telas do diário
        // exibem quando `mostrarNR` é true. O campo existe para a PaguePlay, cujo
        // relatório traz a coluna Cód.Cliente — aqui fica vazio de propósito e o
        // diario.service grava null.
        cliente_codigo:   '',
        nome_cliente:     l.nome_cliente,
        acordo_codigo:    l.codigo,
        instituicao:      l.instituicao,
        forma_pagamento:  l.label,
        valor_recebido:   l.valor_recebido,
        data_pagamento:   l.data_pagamento,
        prox_contato:     null,
        tabulacao:        '',
        id_baixa:         '',
        chave_unica:      `${l.operador_usuario}|${l.codigo}|${dk}`,
      });
    }
  }

  return {
    analitico: [...mapA.values()],
    diario: [...mapD.values()],
    colchao,
    colchaoNaMeta,
    retencaoRemovidas,
    erros,
  };
}
