/**
 * analiticoComum.ts
 * Tipos e helpers do relatório analítico que **não dependem de xlsx**.
 *
 * ## Por que este arquivo existe
 *
 * `analiticoParser.ts` importa `@e965/xlsx` (~484 KB no bundle). Enquanto os
 * helpers puros moravam lá, qualquer módulo que precisasse de UM deles arrastava
 * a biblioteca inteira: `analitico.service.ts` importava só `mesReferencia` — uma
 * função de data de duas linhas — e com isso a aba Analítico baixava 484 KB de
 * parser de planilha para simplesmente EXIBIR dados.
 *
 * Regra, portanto:
 *   • **caminho de leitura** (services, hooks, telas) → importe DAQUI;
 *   • **caminho de importação** (ler o arquivo do ERP) → importe do parser.
 *
 * `analiticoParser.ts` reexporta tudo o que está aqui, então nada quebra ao
 * continuar importando de lá — mas fazer isso no caminho de leitura devolve os
 * 484 KB ao bundle. O teste `xlsx-fora-do-caminho-de-leitura.test.ts` guarda
 * essa fronteira.
 */

import type { FormaPagementoAnalitico } from '@/lib/supabase';

// ── Tipos de saída ───────────────────────────────────────────────────────────

export interface PagamentoDetalhe {
  tpdoc: string;
  valor: number;
  total_ho: number;
  data: Date;
}

export interface LinhaRelatorio {
  operador_usuario: string;
  equipe: string;
  codigo: string;
  nome_cliente: string;
  /** Coluna "Empresa" (BookPlay). Opcional — não usado na PaguePlay. */
  instituicao?: string;
  /** Rótulo detalhado da forma (BookPlay): Boleto, Pix, Pix Automático, etc. */
  forma_detalhe?: string;
  forma_pagamento: FormaPagementoAnalitico;
  tpdoc_original: string;
  valor_recebido: number;
  total_ho: number;
  data_pagamento: Date;
  /** Preenchido apenas quando 2+ pagamentos foram consolidados numa única linha (ex: BOLETO + PIX no mesmo dia) */
  pagamentos_detalhados?: PagamentoDetalhe[];
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

export type ColKeys = 'op' | 'eq' | 'cli' | 'tp' | 'dt' | 'rec' | 'ho';

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

export function parsearValor(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Consolidação ─────────────────────────────────────────────────────────────

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Agrupa linhas pelo resultado de `chave`, somando valor_recebido e total_ho.
 * Quando `trackDetalhes=true`, preenche `pagamentos_detalhados` ao mesclar
 * 2+ linhas — permite exibir os pagamentos individuais na UI.
 */
function agrupar(
  items: LinhaRelatorio[],
  chave: (l: LinhaRelatorio) => string,
  trackDetalhes = false,
): LinhaRelatorio[] {
  const grupos = new Map<string, LinhaRelatorio>();
  for (const l of items) {
    const k = chave(l);
    const existe = grupos.get(k);
    if (existe) {
      if (trackDetalhes) {
        if (!existe.pagamentos_detalhados) {
          // Primeira mesclagem: registra o lançamento original como primeiro detalhe
          existe.pagamentos_detalhados = [
            { tpdoc: existe.tpdoc_original, valor: existe.valor_recebido, total_ho: existe.total_ho, data: existe.data_pagamento },
          ];
        }
        existe.pagamentos_detalhados.push({
          tpdoc:    l.tpdoc_original,
          valor:    l.valor_recebido,
          total_ho: l.total_ho,
          data:     l.data_pagamento,
        });
      }
      existe.valor_recebido += l.valor_recebido;
      existe.total_ho       += l.total_ho;
    } else {
      grupos.set(k, { ...l });
    }
  }
  return [...grupos.values()];
}

/**
 * Consolida linhas do relatório:
 *   - Boleto/PIX: mesmo cliente pode ter pagado via BOLETO e via PIX no mesmo dia
 *     para o mesmo operador. Agrupa por (operator + codigo + data), soma os valores
 *     e registra cada pagamento individual em `pagamentos_detalhados` para exibição na UI.
 *   - Cartão: ERP repete a mesma venda N vezes (uma por parcela). Agrupa por
 *     (operator + codigo) e soma — detalhes não são rastreados pois são parcelas iguais.
 */
export function consolidar(linhas: LinhaRelatorio[]): LinhaRelatorio[] {
  const boleto = linhas.filter(l => l.forma_pagamento !== 'cartao');
  const cartao = linhas.filter(l => l.forma_pagamento === 'cartao');

  return [
    ...agrupar(boleto, l => `${l.operador_usuario}::${l.codigo}::${dateKey(l.data_pagamento)}`, true),
    ...agrupar(cartao, l => `${l.operador_usuario}::${l.codigo}`),
  ];
}
