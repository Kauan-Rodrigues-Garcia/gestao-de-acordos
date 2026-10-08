/**
 * feriadosNacionais.ts — os feriados nacionais do ano, só para dar NOME ao dia.
 *
 * Quem decide se a operação trabalha num feriado é a aba Metas (os feriados de
 * `metas_config_mes`, ou o calendário de Vendas no Comercial) — tem feriado em
 * que a operação trabalha. Esta lista não tira dia útil de ninguém: o
 * calendário do setor a usa para escrever «Nossa Senhora Aparecida» na casa,
 * e para avisar «expediente normal» quando as Metas contam o dia.
 *
 * Os fixos da lei (Leis 662/1949, 6.802/1980 e 14.759/2023) e os móveis que
 * dependem da Páscoa. Carnaval e Corpus Christi são ponto facultativo
 * nacional, mas é como a operação os conhece.
 */

export interface FeriadoNacional {
  /** 'yyyy-MM-dd'. */
  dia: string;
  nome: string;
}

const FIXOS: readonly [number, number, string][] = [
  [1, 1, 'Confraternização Universal'],
  [4, 21, 'Tiradentes'],
  [5, 1, 'Dia do Trabalho'],
  [9, 7, 'Independência do Brasil'],
  [10, 12, 'Nossa Senhora Aparecida'],
  [11, 2, 'Finados'],
  [11, 15, 'Proclamação da República'],
  [11, 20, 'Consciência Negra'],
  [12, 25, 'Natal'],
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), à meia-noite local. */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/** Os feriados nacionais do ano, em ordem de data. */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const p = pascoa(ano);
  const daPascoa = (dias: number) => new Date(p.getFullYear(), p.getMonth(), p.getDate() + dias);
  return [
    ...FIXOS.map(([m, d, nome]) => ({ dia: iso(new Date(ano, m - 1, d)), nome })),
    { dia: iso(daPascoa(-48)), nome: 'Carnaval' },
    { dia: iso(daPascoa(-47)), nome: 'Carnaval' },
    { dia: iso(daPascoa(-2)), nome: 'Sexta-feira Santa' },
    { dia: iso(daPascoa(60)), nome: 'Corpus Christi' },
  ].sort((a, b) => a.dia.localeCompare(b.dia));
}
