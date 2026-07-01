/**
 * helpers.ts — agregações e consolidação da aba Recebimento diário.
 *
 * Regras herdadas do protótipo HTML:
 *  - Cartão consolida por Cód.Acordo (parcelas somadas → 1 acordo, badge "Nx")
 *  - Pix/Boleto: 1 item por pagamento (Id.Baixa)
 *  - Próx.Contato ≤ hoje → acordo ignorado (fora dos totais e listas)
 */

import type { DiarioRecebimento } from '@/lib/supabase';
import { formaKindDiario, isCartaoDiario, type FormaKindDiario } from '@/services/diario/diarioParser';

// ── Ignorados (próximo contato ≤ hoje) ───────────────────────────────────────

export function isIgnorado(row: DiarioRecebimento, hojeISO: string): boolean {
  return row.prox_contato != null && row.prox_contato <= hojeISO;
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
  nome_cliente: string;
  forma_pagamento: string;
  kind: FormaKindDiario;
  valor: number;
  /** Nº de pagamentos consolidados (parcelas de cartão) */
  n: number;
  minData: string | null;   // 'yyyy-MM-dd'
  maxData: string | null;
  tabulacao: string;
  /** true quando o item ainda não foi visto pelo operador nesta sessão */
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
 * Um item consolidado é "novo" apenas se TODOS os pagamentos são novos —
 * se alguma parcela já era conhecida, o acordo permanece em "anteriores".
 */
export function consolidarItens(
  rows: DiarioRecebimento[],
  novosIds: Set<string>,
): ItemDiario[] {
  const grupos = new Map<string, ItemDiario>();
  const itens: ItemDiario[] = [];

  for (const r of rows) {
    const key  = acordoKey(r);
    const novo = novosIds.has(r.id) || !r.visto;

    const existente = grupos.get(key);
    if (existente) {
      existente.valor += r.valor_recebido;
      existente.n     += 1;
      existente.novo   = existente.novo && novo;
      if (!existente.cpf && r.cpf) existente.cpf = r.cpf;
      if (!existente.nome_cliente && r.nome_cliente) existente.nome_cliente = r.nome_cliente;
      if (r.data_pagamento) {
        if (!existente.minData || r.data_pagamento < existente.minData) existente.minData = r.data_pagamento;
        if (!existente.maxData || r.data_pagamento > existente.maxData) existente.maxData = r.data_pagamento;
      }
      continue;
    }

    const item: ItemDiario = {
      key,
      cpf:             r.cpf ?? '',
      nome_cliente:    r.nome_cliente ?? '',
      forma_pagamento: r.forma_pagamento,
      kind:            formaKindDiario(r.forma_pagamento),
      valor:           r.valor_recebido,
      n:               1,
      minData:         r.data_pagamento,
      maxData:         r.data_pagamento,
      tabulacao:       r.tabulacao ?? '',
      novo,
    };
    grupos.set(key, item);
    itens.push(item);
  }

  itens.sort((a, b) =>
    (a.minData ?? '').localeCompare(b.minData ?? '') || a.cpf.localeCompare(b.cpf));
  return itens;
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
