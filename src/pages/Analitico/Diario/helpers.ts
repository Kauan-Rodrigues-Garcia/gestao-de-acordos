/**
 * helpers.ts — agregações e consolidação da aba Recebimento diário.
 *
 * Regras herdadas do protótipo HTML:
 *  - Cartão consolida por Cód.Acordo (parcelas somadas → 1 acordo, badge "Nx")
 *  - Pix/Boleto: 1 item por pagamento (Id.Baixa)
 *  - Próx.Contato ≤ data do pagamento → acordo ignorado (fora dos totais e listas)
 */

import type { DiarioRecebimento } from '@/lib/supabase';
import { formaKindDiario, isCartaoDiario, fmtCPF, normDiario, type FormaKindDiario } from '@/services/diario/diarioParser';
import { formatBRL } from '@/lib/money';

// ── Ignorados (próximo contato ≤ data do pagamento) ──────────────────────────
// A referência é o dia do PAGAMENTO (dia_referencia), não o dia em que se olha
// o relatório: um pagamento feito dia 01 com próx. contato dia 15 estava
// dentro do vínculo quando aconteceu, e importar o mensal dias depois não pode
// reclassificá-lo. `hojeISO` é só fallback para linha sem dia_referencia.

export function isIgnorado(row: DiarioRecebimento, hojeISO: string): boolean {
  const ref = row.dia_referencia || hojeISO;
  return row.prox_contato != null && row.prox_contato <= ref;
}

export function linhasVivas(rows: DiarioRecebimento[], hojeISO: string): DiarioRecebimento[] {
  return rows.filter(r => !isIgnorado(r, hojeISO));
}

// ── Chave de acordo (consolidação) ───────────────────────────────────────────

/** Cartão consolida por Cód.Acordo; pix/boleto = 1 pagamento */
export function acordoKey(row: DiarioRecebimento): string {
  if (isCartaoDiario(row.forma_pagamento) && row.acordo_codigo) {
    return `cc:${row.acordo_codigo}`;
  }
  return `pay:${row.id_baixa || row.id}`;
}

// ── Itens consolidados (lista do operador) ───────────────────────────────────

export interface ItemDiario {
  key: string;
  cpf: string;
  /** Cód.Acordo (BookPlay: NR); usado no lugar do CPF na BookPlay */
  acordo_codigo: string;
  nome_cliente: string;
  /** Coluna "Empresa" (BookPlay); '' na PaguePlay */
  instituicao: string;
  forma_pagamento: string;
  kind: FormaKindDiario;
  valor: number;
  /** Nº de pagamentos consolidados (parcelas de cartão) */
  n: number;
  minData: string | null;   // 'yyyy-MM-dd'
  maxData: string | null;
  tabulacao: string;
  /** true quando o acordo apareceu pela primeira vez na última importação do dia */
  novo: boolean;
}

export function fmtDataISO(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function dataLabel(item: Pick<ItemDiario, 'minData' | 'maxData'>): string {
  if (!item.minData) return '—';
  if (item.maxData && item.maxData !== item.minData) {
    return `${fmtDataISO(item.minData)} a ${fmtDataISO(item.maxData)}`;
  }
  return fmtDataISO(item.minData);
}

/**
 * Consolida linhas em itens de exibição.
 *
 * "Novo" segue a ordem das importações do dia (igual ao protótipo HTML):
 *  - 1º relatório (maxImportIndex < 2): nenhum item é "novo" — lista normal.
 *  - A partir do 2º: um acordo é "novo" se sua PRIMEIRA aparição foi na última
 *    importação (menor import_index do acordo === maxImportIndex). Se alguma
 *    parcela já existia em importação anterior, o acordo fica em "anteriores".
 *    Assim, ao importar o próximo relatório, os "novos" do relatório atual
 *    passam a "anteriores" e só os do novo relatório ficam marcados.
 */
export function consolidarItens(
  rows: DiarioRecebimento[],
  maxImportIndex: number,
): ItemDiario[] {
  const grupos  = new Map<string, ItemDiario>();
  const minIdx  = new Map<string, number>();   // menor import_index por acordo
  const itens: ItemDiario[] = [];

  for (const r of rows) {
    const key = acordoKey(r);
    minIdx.set(key, Math.min(minIdx.get(key) ?? r.import_index, r.import_index));

    const existente = grupos.get(key);
    if (existente) {
      existente.valor += r.valor_recebido;
      existente.n     += 1;
      if (!existente.cpf && r.cpf) existente.cpf = r.cpf;
      if (!existente.nome_cliente && r.nome_cliente) existente.nome_cliente = r.nome_cliente;
      if (!existente.instituicao && r.instituicao) existente.instituicao = r.instituicao;
      if (r.data_pagamento) {
        if (!existente.minData || r.data_pagamento < existente.minData) existente.minData = r.data_pagamento;
        if (!existente.maxData || r.data_pagamento > existente.maxData) existente.maxData = r.data_pagamento;
      }
      continue;
    }

    const item: ItemDiario = {
      key,
      cpf:             r.cpf ?? '',
      acordo_codigo:   r.acordo_codigo ?? '',
      nome_cliente:    r.nome_cliente ?? '',
      instituicao:     r.instituicao ?? '',
      forma_pagamento: r.forma_pagamento,
      kind:            formaKindDiario(r.forma_pagamento),
      valor:           r.valor_recebido,
      n:               1,
      minData:         r.data_pagamento,
      maxData:         r.data_pagamento,
      tabulacao:       r.tabulacao ?? '',
      novo:            false,
    };
    grupos.set(key, item);
    itens.push(item);
  }

  for (const it of itens) {
    it.novo = maxImportIndex >= 2 && minIdx.get(it.key) === maxImportIndex;
  }

  itens.sort((a, b) =>
    (a.minData ?? '').localeCompare(b.minData ?? '') || a.cpf.localeCompare(b.cpf));
  return itens;
}

/**
 * Monta o texto de "Copiar lista" do recebimento diário de um operador,
 * no mesmo formato do protótipo HTML. A partir do 2º relatório do dia,
 * separa em blocos "Anteriores" e "Novos pagamentos".
 */
export function montarTextoListaDiario(
  nome: string,
  diaISO: string | null,
  itens: ItemDiario[],
  maxImportIndex: number,
): string {
  const totRec  = itens.reduce((s, i) => s + i.valor, 0);
  const aviso   = (it: ItemDiario) =>
    normDiario(it.tabulacao) === 'acordofechado' ? '' : ' (Tabular Acordo Fechado)';
  const fmtLine = (it: ItemDiario) =>
    `${fmtCPF(it.cpf) || it.acordo_codigo || '—'} - ${it.forma_pagamento} - ${formatBRL(it.valor)}${aviso(it)}`;

  const head = `*${nome}* — recebimentos${diaISO ? ` (${fmtDataISO(diaISO)})` : ''}`;
  const blocks: string[] = [];

  if (maxImportIndex >= 2) {
    const ant = itens.filter(i => !i.novo);
    const nw  = itens.filter(i => i.novo);
    if (ant.length) blocks.push('— Anteriores —', ...ant.map(fmtLine));
    if (nw.length)  blocks.push('', '— Novos pagamentos —', ...nw.map(fmtLine));
  } else {
    blocks.push(...itens.map(fmtLine));
  }

  return [head, '', ...blocks, '', `Total: ${formatBRL(totRec)}`].join('\n');
}

// ── Agregação por operador (visão líder) ─────────────────────────────────────

export interface ResumoOperadorDiario {
  operadorId: string;
  usuario: string;
  nome: string | null;
  total: number;
  pix: number;
  boleto: number;
  cartao: number;
  /** Nº de acordos (cartão consolidado) */
  nAcordos: number;
  /** Nº de pagamentos (linhas) */
  nPagamentos: number;
  /** Acordos adicionados na última importação do dia */
  novos: number;
}

/**
 * Agrega linhas vivas por operador vinculado (órfãos ficam de fora).
 * `maxImportIndex ≥ 2` habilita a contagem de "novos" — acordos cuja
 * primeira aparição foi na última importação do dia.
 */
export function agregarPorOperador(
  rows: DiarioRecebimento[],
  maxImportIndex: number,
): ResumoOperadorDiario[] {
  // menor import_index por acordo → acordo é "novo" se só apareceu na última importação
  const minIdxPorAcordo = new Map<string, { opId: string; minIdx: number }>();
  for (const r of rows) {
    if (!r.operador_id) continue;
    const k = `${r.operador_id}::${acordoKey(r)}`;
    const atual = minIdxPorAcordo.get(k);
    if (!atual) minIdxPorAcordo.set(k, { opId: r.operador_id, minIdx: r.import_index });
    else atual.minIdx = Math.min(atual.minIdx, r.import_index);
  }

  const map = new Map<string, ResumoOperadorDiario>();
  for (const r of rows) {
    if (!r.operador_id) continue;
    let m = map.get(r.operador_id);
    if (!m) {
      m = {
        operadorId:  r.operador_id,
        usuario:     r.perfis?.usuario ?? r.operador_usuario,
        nome:        r.perfis?.nome ?? null,
        total: 0, pix: 0, boleto: 0, cartao: 0,
        nAcordos: 0, nPagamentos: 0, novos: 0,
      };
      map.set(r.operador_id, m);
    }
    m.total       += r.valor_recebido;
    m.nPagamentos += 1;
    const kind = formaKindDiario(r.forma_pagamento);
    if (kind === 'pix')    m.pix    += r.valor_recebido;
    if (kind === 'boleto') m.boleto += r.valor_recebido;
    if (kind === 'cartao') m.cartao += r.valor_recebido;
  }

  const acordosPorOp = new Map<string, { total: number; novos: number }>();
  for (const v of minIdxPorAcordo.values()) {
    const atual = acordosPorOp.get(v.opId) ?? { total: 0, novos: 0 };
    atual.total += 1;
    if (maxImportIndex >= 2 && v.minIdx === maxImportIndex) atual.novos += 1;
    acordosPorOp.set(v.opId, atual);
  }
  for (const [opId, m] of map) {
    const a = acordosPorOp.get(opId);
    m.nAcordos = a?.total ?? 0;
    m.novos    = a?.novos ?? 0;
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

// ── Ignorados consolidados (card do líder) ───────────────────────────────────

export interface ItemIgnorado {
  operador: string;
  cpf: string;
  acordo_codigo: string;
  nome_cliente: string;
  forma_pagamento: string;
  kind: FormaKindDiario;
  valor: number;
  n: number;
  proxContato: string | null;
}

export function consolidarIgnorados(
  rows: DiarioRecebimento[],
  hojeISO: string,
): ItemIgnorado[] {
  const grupos = new Map<string, ItemIgnorado>();
  const itens: ItemIgnorado[] = [];

  for (const r of rows) {
    if (!isIgnorado(r, hojeISO)) continue;
    const key = `${r.operador_usuario}::${acordoKey(r)}`;
    const existente = grupos.get(key);
    if (existente) {
      existente.valor += r.valor_recebido;
      existente.n     += 1;
      if (!existente.cpf && r.cpf) existente.cpf = r.cpf;
      if (r.prox_contato && (!existente.proxContato || r.prox_contato < existente.proxContato)) {
        existente.proxContato = r.prox_contato;
      }
      continue;
    }
    const item: ItemIgnorado = {
      operador:        r.perfis?.nome ?? r.operador_usuario,
      cpf:             r.cpf ?? '',
      acordo_codigo:   r.acordo_codigo ?? '',
      nome_cliente:    r.nome_cliente ?? '',
      forma_pagamento: r.forma_pagamento,
      kind:            formaKindDiario(r.forma_pagamento),
      valor:           r.valor_recebido,
      n:               1,
      proxContato:     r.prox_contato,
    };
    grupos.set(key, item);
    itens.push(item);
  }

  itens.sort((a, b) =>
    (a.proxContato ?? '').localeCompare(b.proxContato ?? '') || a.operador.localeCompare(b.operador, 'pt-BR'));
  return itens;
}
