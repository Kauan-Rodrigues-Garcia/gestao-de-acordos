/**
 * diasUteis.ts — a conta de «há quantos dias úteis está aberta» da Ouvidoria.
 *
 * Dia útil = segunda a sexta, menos os feriados NACIONAIS:
 *   fixos   01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11 (desde 2024), 25/12
 *   móvel   Sexta-feira Santa (dois dias antes da Páscoa)
 *
 * Carnaval e Corpus Christi ficam de fora de propósito: são ponto facultativo,
 * não feriado. Feriado municipal e estadual também não entram (a Ouvidoria
 * atende o Brasil inteiro). Se a empresa quiser contar algum deles, é uma linha
 * em `feriadosDoAno`.
 */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
function pascoa(ano: number): Date {
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
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const cache = new Map<number, Set<string>>();

/** Os feriados nacionais do ano, em ISO. */
export function feriadosDoAno(ano: number): Set<string> {
  const pronto = cache.get(ano);
  if (pronto) return pronto;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (ano >= 2024) fixos.push('11-20'); // Consciência Negra, nacional pela Lei 14.759/2023
  const r = new Set(fixos.map(md => `${ano}-${md}`));
  const sextaSanta = pascoa(ano);
  sextaSanta.setUTCDate(sextaSanta.getUTCDate() - 2);
  r.add(iso(sextaSanta));
  cache.set(ano, r);
  return r;
}

export function ehDiaUtil(dataIso: string): boolean {
  const d = new Date(`${dataIso.slice(0, 10)}T12:00:00Z`);
  const semana = d.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !feriadosDoAno(d.getUTCFullYear()).has(dataIso.slice(0, 10));
}

/**
 * Dias úteis DEPOIS de `de` até `ate` (inclusive). Aberta hoje = 0; aberta na
 * sexta e hoje é segunda = 1. `ate` antes de `de` = 0.
 */
export function diasUteisEntre(deIso: string, ateIso: string): number {
  const de = new Date(`${deIso.slice(0, 10)}T12:00:00Z`);
  const ate = new Date(`${ateIso.slice(0, 10)}T12:00:00Z`);
  let n = 0;
  const d = new Date(de);
  // Até ~10 anos de laço no pior caso: barato, e a lista tem dezenas de linhas.
  for (let guarda = 0; guarda < 4000; guarda += 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d > ate) break;
    if (ehDiaUtil(iso(d))) n += 1;
  }
  return n;
}
