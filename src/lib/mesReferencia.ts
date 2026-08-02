/**
 * mesReferencia.ts — o mês que o dashboard está olhando.
 *
 * Antes, "o mês" era `new Date()` recalculado dentro de cada hook. Isso trazia
 * dois problemas:
 *
 *   1. não dava para olhar mês fechado — no dia 02 o dashboard inteiro aparece
 *      zerado, porque tudo é medido contra o mês corrente;
 *   2. `new Date().getMonth()` usa o fuso da MÁQUINA. Numa máquina em UTC (ou
 *      com a hora errada), das 21h à meia-noite do dia 31 o mês já virava — e o
 *      dashboard trocava de mês antes da empresa. Aqui o mês corrente sai de
 *      `getTodayISO()`, que é sempre São Paulo.
 *
 * Puro e sem React de propósito: são contas de calendário, a parte que mais
 * erra por conta de mês base-0 e de virada de ano.
 */
import { getTodayISO } from '@/lib/index';

/** Mês de referência no formato `yyyy-MM`. */
export type MesRef = string;

const FORMATO = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Quantos meses para trás o seletor permite voltar. */
export const MESES_HISTORICO = 12;

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export function mesValido(mes: unknown): mes is MesRef {
  return typeof mes === 'string' && FORMATO.test(mes);
}

/** O mês corrente no fuso de São Paulo — nunca o da máquina. */
export function mesAtual(): MesRef {
  return getTodayISO().slice(0, 7);
}

/** Aceita o que vier do estado/URL e devolve sempre um mês utilizável. */
export function normalizarMes(mes: string | null | undefined): MesRef {
  return mesValido(mes) ? mes : mesAtual();
}

/** `{ ano, mes }` com o mês em base 1 (janeiro = 1), como o banco guarda. */
export function partesDoMes(mes: string | null | undefined): { ano: number; mes: number } {
  const ref = normalizarMes(mes);
  return { ano: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) };
}

/**
 * Anda `delta` meses (negativo volta). A virada de ano fica por conta do
 * `Date`, que normaliza mês 12 para janeiro do ano seguinte e mês -1 para
 * dezembro do anterior.
 */
export function deslocarMes(mes: string | null | undefined, delta: number): MesRef {
  const { ano, mes: m } = partesDoMes(mes);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function primeiroDiaDoMes(mes: string | null | undefined): string {
  return `${normalizarMes(mes)}-01`;
}

/** Quantos dias o mês tem — 28, 29, 30 ou 31. */
export function diasNoMes(mes: string | null | undefined): number {
  const { ano, mes: m } = partesDoMes(mes);
  // Dia 0 do mês seguinte = último dia deste.
  return new Date(ano, m, 0).getDate();
}

export function ultimoDiaDoMes(mes: string | null | undefined): string {
  return `${normalizarMes(mes)}-${String(diasNoMes(mes)).padStart(2, '0')}`;
}

export function ehMesAtual(mes: string | null | undefined): boolean {
  return normalizarMes(mes) === mesAtual();
}

/** "Agosto 2026" — o rótulo que aparece no seletor. */
export function rotuloDoMes(mes: string | null | undefined): string {
  const { ano, mes: m } = partesDoMes(mes);
  return `${NOMES_MES[m - 1]} ${ano}`;
}

/** Dá para avançar? Só até o mês corrente — o futuro não tem dado nenhum. */
export function podeAvancar(mes: string | null | undefined): boolean {
  return normalizarMes(mes) < mesAtual();
}

/** Dá para voltar? Limitado a `MESES_HISTORICO` meses atrás. */
export function podeVoltar(mes: string | null | undefined): boolean {
  return normalizarMes(mes) > deslocarMes(mesAtual(), -MESES_HISTORICO);
}

/**
 * Quantos dias do mês já passaram — a base da projeção.
 *
 * Mês fechado devolve o mês inteiro, então a projeção de um mês passado é o
 * próprio realizado, e não um número inventado. Sem isso, olhar julho no dia 02
 * de agosto projetaria `total / 2 * 31`: uma projeção 15× maior que a realidade.
 */
export function diasDecorridos(mes: string | null | undefined, hojeIso: string = getTodayISO()): number {
  const ref  = normalizarMes(mes);
  const hoje = hojeIso.slice(0, 7);
  if (ref < hoje) return diasNoMes(ref);
  if (ref > hoje) return 0;
  return Number(hojeIso.slice(8, 10));
}
