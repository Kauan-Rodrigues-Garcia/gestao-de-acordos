/**
 * bookplayRecebimentoParser.ts
 * Parser ÚNICO do relatório de recebimentos da BookPlay.
 *
 * Um mesmo relatório alimenta as DUAS abas (Analítico e Recebimento diário),
 * diferente da PaguePlay que usa dois relatórios distintos.
 *
 * Colunas do relatório BookPlay (por cabeçalho, ordem real):
 *   A Cobradora      → operador (username)
 *   B Equipe/SubGrupo→ (ignorada)
 *   C Cliente        → "<código PP> - NOME"; usamos SÓ o nome (código PP não se aplica)
 *   D Email          → (ignorada)
 *   E Título         → (ignorada)
 *   F Parcela        → (ignorada)
 *   G NrDocumento    → NR (código usado para tabular na BookPlay)
 *   H Empresa        → instituição (bookplay, mundial editora, faculdade bookplay…)
 *   I Tipo Venda     → (ignorada)
 *   J TpDoc          → forma de pagamento (PIX, BOLETO…, CARTÃO…)
 *   K DtLig          → (ignorada)
 *   L DtPgto         → data do pagamento
 *   M Dias em atraso → (ignorada)
 *   N Recebido       → valor recebido
 *
 * Regra de consolidação:
 *   - BOLETO/PIX: agrupa por (operador + NR + dia), SOMA o recebido. Assim as
 *     parcelas de boleto do mesmo NR pagas no mesmo dia viram um único valor
 *     (ex.: NR 1234 com 4 parcelas de R$200 → R$800). Guarda os pagamentos
 *     individuais em `pagamentos_detalhados` para exibição.
 *   - CARTÃO: agrupa por (operador + NR), SOMA (parcelas repetidas do ERP).
 */

import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import {
  norm, toDate, extrairNome, mapearFormaPgto,
  type LinhaRelatorio, type PagamentoDetalhe,
} from '@/services/analitico/analiticoParser';
import { dayKeyDiario, type LinhaDiario } from '@/services/diario/diarioParser';

export interface ResultadoParseBookplay {
  analitico: LinhaRelatorio[];
  diario:    LinhaDiario[];
  erros:     string[];
}

type ColKeys = 'op' | 'cli' | 'nr' | 'emp' | 'tp' | 'dt' | 'rec';

const COL_ALIASES: Record<ColKeys, string[]> = {
  op:  ['cobradora', 'operador', 'cobrador'],
  cli: ['cliente'],
  nr:  ['nrdocumento', 'nrdoc', 'nr', 'documento'],
  emp: ['empresa', 'instituicao'],
  tp:  ['tpdoc', 'formadepagamento', 'formapagamento'],
  dt:  ['dtpgto', 'datapgto', 'datapagamento', 'datadopagamento'],
  rec: ['recebido', 'valorrecebido'],
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
  // Obrigatórias: operador, NR, data e valor
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

/** Linha bruta antes da consolidação (mantém o TpDoc original). */
interface LinhaBruta {
  operador_usuario: string;
  codigo: string;            // NR
  nome_cliente: string;
  instituicao: string;
  forma_pagamento: LinhaRelatorio['forma_pagamento']; // 'boleto_pix' | 'cartao'
  tpdoc_original: string;
  valor_recebido: number;
  data_pagamento: Date;
}

function dateKey(d: Date): string {
  return dayKeyDiario(d);
}

/**
 * Consolida as linhas brutas:
 *   - boleto/pix → chave (operador + NR + dia)
 *   - cartão     → chave (operador + NR)
 * Soma o valor e registra os pagamentos individuais em `pagamentos_detalhados`
 * quando 2+ linhas se fundem.
 */
function consolidar(linhas: LinhaBruta[]): LinhaRelatorio[] {
  const grupos = new Map<string, LinhaRelatorio & { _det: PagamentoDetalhe[] }>();

  for (const l of linhas) {
    const chave = l.forma_pagamento === 'cartao'
      ? `${l.operador_usuario}::cc::${l.codigo}`
      : `${l.operador_usuario}::${l.codigo}::${dateKey(l.data_pagamento)}`;

    const existe = grupos.get(chave);
    const detalhe: PagamentoDetalhe = {
      tpdoc:    l.tpdoc_original,
      valor:    l.valor_recebido,
      total_ho: 0,
      data:     l.data_pagamento,
    };

    if (existe) {
      existe.valor_recebido += l.valor_recebido;
      existe._det.push(detalhe);
    } else {
      grupos.set(chave, {
        operador_usuario: l.operador_usuario,
        equipe:           '',
        codigo:           l.codigo,
        nome_cliente:     l.nome_cliente,
        instituicao:      l.instituicao,
        forma_pagamento:  l.forma_pagamento,
        tpdoc_original:   l.tpdoc_original,
        valor_recebido:   l.valor_recebido,
        total_ho:         0,
        data_pagamento:   l.data_pagamento,
        _det:             [detalhe],
      });
    }
  }

  return [...grupos.values()].map(({ _det, ...linha }) => ({
    ...linha,
    pagamentos_detalhados: _det.length > 1 ? _det : undefined,
  }));
}

/** Converte uma linha consolidada do analítico na linha equivalente do diário. */
function paraDiario(l: LinhaRelatorio): LinhaDiario {
  const dk = dayKeyDiario(l.data_pagamento);
  return {
    operador_usuario: l.operador_usuario,
    cpf:              '',
    nome_cliente:     l.nome_cliente,
    acordo_codigo:    l.codigo,
    instituicao:      l.instituicao,
    forma_pagamento:  l.tpdoc_original || (l.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'),
    valor_recebido:   l.valor_recebido,
    data_pagamento:   l.data_pagamento,
    prox_contato:     null,
    tabulacao:        '',
    id_baixa:         '',
    // Único por dia: operador + NR + forma + valor
    chave_unica:      `${l.operador_usuario}|${l.codigo}|${l.forma_pagamento}|${l.valor_recebido}|${dk}`,
  };
}

/**
 * Lê o relatório Excel (.xlsx/.xls) da BookPlay e devolve as linhas prontas
 * para as duas abas. Rejeita o arquivo se as colunas obrigatórias faltarem.
 */
export async function parseRelatorioBookplay(arquivo: File): Promise<ResultadoParseBookplay> {
  const buffer = await arquivo.arrayBuffer();
  const wb = xlsxRead(buffer, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { analitico: [], diario: [], erros: ['Planilha vazia ou inválida.'] };

  const rows: unknown[][] = xlsxUtils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  if (rows.length < 2) return { analitico: [], diario: [], erros: ['Planilha sem dados.'] };

  const cols = resolveCols(rows[0] as unknown[]);
  if (!cols) {
    const encontrados = (rows[0] as unknown[]).map(h => `"${h}"`).join(', ');
    return {
      analitico: [], diario: [],
      erros: [
        `Colunas obrigatórias (Cobradora, NrDocumento, DtPgto, Recebido) não encontradas. ` +
        `Cabeçalhos lidos: ${encontrados}. Verifique se é o relatório correto da BookPlay.`,
      ],
    };
  }

  const erros: string[] = [];
  const brutas: LinhaBruta[] = [];

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

    if (!op || !nr || !dt) {
      erros.push(`Linha ${i + 1}: dados incompletos (operador="${op}", NR="${nr}", data="${row[cols.dt!]}") — ignorada.`);
      continue;
    }

    brutas.push({
      operador_usuario: op,
      codigo:           nr,
      nome_cliente:     extrairNome(cli),
      instituicao:      emp,
      forma_pagamento:  mapearFormaPgto(tp),
      tpdoc_original:   tp,
      valor_recebido:   rec,
      data_pagamento:   dt,
    });
  }

  const analitico = consolidar(brutas);
  const diario    = analitico.map(paraDiario);
  return { analitico, diario, erros };
}
