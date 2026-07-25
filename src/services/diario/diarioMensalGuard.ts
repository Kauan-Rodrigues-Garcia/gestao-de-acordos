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
 *
 * A regra antiga ("mais de um dia distinto → mensal") furava: o relatório de
 * UM dia costuma trazer baixas atrasadas de 1 ou 2 dias anteriores, então tinha
 * 2 dias distintos e passava como mensal — ainda por cima marcando o dia como
 * liberado. Regra endurecida:
 *  - Começa no dia 1º do mês (menor dia = '...-01') → é o mês inteiro (o mensal
 *    sempre parte do dia 1). Cobre também o caso de importar o mensal já no dia
 *    1º (um único dia).
 *  - 3+ dias distintos → mensal. Um relatório de 1 dia, mesmo com atraso de
 *    baixa, não passa de 2 dias distintos; 3+ caracteriza o mês.
 *  - Caso contrário (1 ou 2 dias sem começar no 1º) → NÃO é mensal: bloqueia.
 */
export function loteEhMensal(linhas: LinhaDiario[]): boolean {
  const dias = diasDoLote(linhas);
  if (dias.length === 0) return false;
  if (dias[0].endsWith('-01')) return true;   // dias ordenado asc → menor dia
  return dias.length >= 3;
}

export const MSG_BLOQUEIO_MENSAL =
  'Relatório de apenas 1 dia bloqueado.\n\n' +
  'O primeiro relatório importado hoje precisa ser o MENSAL (mês inteiro): ' +
  'ele realinha os valores dos dias anteriores e evita que algum valor ' +
  'quebrado passe despercebido.\n\n' +
  'Exporte o relatório com o mês inteiro no ERP e importe-o primeiro. ' +
  'Depois disso, relatórios só do dia ficam liberados até amanhã.';
