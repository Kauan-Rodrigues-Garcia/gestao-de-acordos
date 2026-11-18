/**
 * Formatos do Banco de Horas.
 *
 * Regra do painel (decisão do usuário, 17/11/2026): hora sem sinal + / −. Quem
 * diz o lado é a cor e o nome ao lado («devendo», «guardadas»).
 */

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const n = (x: number) => x.toLocaleString('pt-BR');

/** 754 → «12h34». Sem sinal. */
export function horas(min: number | null | undefined): string {
  const a = Math.abs(Math.round(min || 0));
  return `${n(Math.floor(a / 60))}h${String(a % 60).padStart(2, '0')}`;
}

/** 754 → «13», arredondado, sem sinal: para os números grandes. */
export function horasRedondas(min: number | null | undefined): string {
  return n(Math.round(Math.abs(min || 0) / 60));
}

/** «2026-11-16» → «16/11/2026». */
export function data(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** «2026-11-16» → «16/11». */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** «2026-11» → «nov/26». */
export function mesCurto(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MESES_CURTOS[+m - 1]}/${y.slice(2)}`;
}

/** «2026-11» → «Novembro de 2026». */
export function mesLongo(ym: string): string {
  const [y, m] = ym.split('-');
  const t = MESES_LONGOS[+m - 1];
  return `${t[0].toUpperCase()}${t.slice(1)} de ${y}`;
}

export function plural(qtd: number, um: string, varios: string): string {
  return `${n(qtd)} ${qtd === 1 ? um : varios}`;
}

/** Soma `k` meses a «aaaa-mm». */
export function somaMeses(ym: string, k: number): string {
  let [y, m] = ym.split('-').map(Number);
  m += k;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function somaDias(iso: string, k: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + k);
  return d.toISOString().slice(0, 10);
}

/** Sem acento, minúsculo: para busca e para casar nome. */
export function normalizar(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const SIGLAS = new Set(['TI', 'SAC', 'SAF', 'ADM', 'FAC', 'ERP', 'RH', 'BH', 'CX', 'II', 'III']);
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);

/** «HOME RECEPTIVO» → «Home Receptivo»; siglas ficam em caixa alta. */
export function titulo(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
    const up = w.toUpperCase();
    if (SIGLAS.has(up)) return up;
    if (i > 0 && MINUSCULAS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
}

/** «BOOK PLAY LTDA» → «Book Play». */
export function empresaCurta(nome: string | null | undefined): string {
  const u = String(nome ?? '').toUpperCase();
  if (u.includes('BOOK PLAY')) return 'Book Play';
  if (u.includes('PAGUE PLAY')) return 'Pague Play';
  return titulo(String(nome ?? '').replace(/\b(LTDA|S\/?A|EIRELI|ME)\b\.?/gi, '').trim());
}

/** As iniciais para o avatar sem foto. */
export function iniciais(nome: string): string {
  const w = String(nome).split(/\s+/).filter(x => x.length > 2);
  return ((w[0] || nome || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
