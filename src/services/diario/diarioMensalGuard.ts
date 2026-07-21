/**
 * diarioMensalGuard.ts
 * Regra "o primeiro relatório do dia deve ser o MENSAL" (PaguePlay).
 *
 * O ERP exporta o recebimento diário com o mês inteiro ou só com o dia,
 * conforme a escolha do líder na exportação. Para nenhum valor quebrado passar
 * despercebido, o primeiro relatório importado a cada dia precisa ser o mensal
 * (multi-dia): a reconciliação da importação realinha os dias anteriores.
 * Depois do mensal do dia, relatórios de 1 dia ficam liberados até o dia
 * seguinte.
 *
 * "Limpar dia" e "Limpar tudo" derrubam a marca: a próxima importação volta a
 * exigir o mensal, realinhando o que foi apagado.
 *
 * A marca fica no localStorage (por empresa + dia) — mesma abordagem de outros
 * estados leves do painel (ex.: Contribuição Receptivo). Outro navegador ou
 * usuário não herda a marca e também exigirá o mensal: bloqueio a mais, nunca
 * a menos.
 */

import { dayKeyDiario, type LinhaDiario } from './diarioParser';

function chaveMensalOk(empresaId: string, dia: string): string {
  return `diario-mensal-ok::${empresaId}::${dia}`;
}

function hojeKey(): string {
  return dayKeyDiario(new Date());
}

/** O relatório mensal já foi importado hoje (neste navegador)? */
export function mensalJaImportadoHoje(empresaId: string, hoje: string = hojeKey()): boolean {
  try { return localStorage.getItem(chaveMensalOk(empresaId, hoje)) === '1'; }
  catch { return false; }
}

/** Marca que o mensal de hoje foi importado — libera relatórios de 1 dia. */
export function marcarMensalImportadoHoje(empresaId: string, hoje: string = hojeKey()): void {
  try { localStorage.setItem(chaveMensalOk(empresaId, hoje), '1'); }
  catch { /* noop */ }
}

/** Derruba a marca de hoje (após "Limpar dia" / "Limpar tudo"): a próxima
 *  importação volta a exigir o relatório mensal. */
export function limparMarcaMensal(empresaId: string, hoje: string = hojeKey()): void {
  try { localStorage.removeItem(chaveMensalOk(empresaId, hoje)); }
  catch { /* noop */ }
}

/** Dias distintos (yyyy-MM-dd) com data de pagamento no lote, ordenados. */
export function diasDoLote(linhas: LinhaDiario[]): string[] {
  return [...new Set(
    linhas
      .filter(l => l.data_pagamento)
      .map(l => dayKeyDiario(l.data_pagamento as Date)),
  )].sort();
}

/**
 * O lote conta como relatório MENSAL?
 *  - Mais de um dia distinto → mensal.
 *  - Um único dia que é o dia 1º do mês → mensal (no primeiro dia do mês o
 *    relatório mensal só tem um dia mesmo — sem essa exceção o dia 1º ficaria
 *    travado sem saída).
 */
export function loteEhMensal(linhas: LinhaDiario[]): boolean {
  const dias = diasDoLote(linhas);
  if (dias.length > 1) return true;
  return dias.length === 1 && dias[0].endsWith('-01');
}

export const MSG_BLOQUEIO_MENSAL =
  'Relatório de apenas 1 dia bloqueado.\n\n' +
  'O primeiro relatório importado hoje precisa ser o MENSAL (mês inteiro): ' +
  'ele realinha os valores dos dias anteriores e evita que algum valor ' +
  'quebrado passe despercebido.\n\n' +
  'Exporte o relatório com o mês inteiro no ERP e importe-o primeiro. ' +
  'Depois disso, relatórios só do dia ficam liberados até amanhã.';
