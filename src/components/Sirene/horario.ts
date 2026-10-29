/**
 * horario.ts — as cores da sirene e a conta de quando ela toca.
 *
 * Puro de propósito (testado em `sirene.test.ts`): recebe a hora e devolve o
 * próximo toque. Hora e dias são de São Paulo (UTC−3 o ano todo — o Brasil
 * não tem horário de verão desde 2019), como no banco (20261029160000).
 */

export type CorDaSirene = 'policia' | 'azul' | 'vermelho' | 'verde' | 'amarelo' | 'laranja' | 'roxo' | 'branco';

/** O mesmo conjunto do CHECK do banco. `policia` alterna azul e vermelho. */
export const CORES: readonly { slug: CorDaSirene; nome: string; luz: string; luz2: string }[] = [
  { slug: 'policia',  nome: 'Azul e vermelho', luz: '#2f6bff', luz2: '#ff2a2a' },
  { slug: 'azul',     nome: 'Azul',            luz: '#2f6bff', luz2: '#2f6bff' },
  { slug: 'vermelho', nome: 'Vermelho',        luz: '#ff2a2a', luz2: '#ff2a2a' },
  { slug: 'verde',    nome: 'Verde',           luz: '#16d65a', luz2: '#16d65a' },
  { slug: 'amarelo',  nome: 'Amarelo',         luz: '#ffd21f', luz2: '#ffd21f' },
  { slug: 'laranja',  nome: 'Laranja',         luz: '#ff7a14', luz2: '#ff7a14' },
  { slug: 'roxo',     nome: 'Roxo',            luz: '#9b4dff', luz2: '#9b4dff' },
  { slug: 'branco',   nome: 'Branco',          luz: '#f4f7ff', luz2: '#f4f7ff' },
];

export function corDaSirene(slug: string | null | undefined) {
  return CORES.find(c => c.slug === slug) ?? CORES[0];
}

/** 0 = domingo … 6 = sábado, como `Date.getDay()` e como o banco. */
export const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const DURACAO_MIN_S = 3;
export const DURACAO_MAX_S = 60;
export const DURACAO_PADRAO_S = 10;
/** Volume em %, de 0 a 100 (migration 20261029200000). 50 = o volume que valia até aqui. */
export const VOLUME_PADRAO = 50;

/**
 * Depois da hora, quanto tempo ainda vale tocar. Aba em segundo plano tem o
 * timer segurado pelo navegador (até 1 por minuto); passou disso, não toca —
 * sirene atrasada confunde mais do que ajuda.
 */
export const TOLERANCIA_MS = 70_000;

export interface Agendamento {
  id: string;
  /** «HH:MM», hora de São Paulo. */
  hora: string;
  dias: number[];
  cor: CorDaSirene;
  duracao_s: number;
  descricao: string | null;
  /** 0 a 100 (%). */
  volume: number;
}

export interface Toque {
  /** Chave única do toque: cada uma toca uma vez por aba. */
  chave: string;
  quando: number;
  cor: CorDaSirene;
  duracaoMs: number;
  descricao: string | null;
  volume: number;
}

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
/** São Paulo = UTC−3. */
const FUSO_MS = 3 * HORA_MS;

export function duracaoSegura(s: unknown): number {
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return DURACAO_PADRAO_S;
  return Math.min(DURACAO_MAX_S, Math.max(DURACAO_MIN_S, n));
}

export function volumeSeguro(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return VOLUME_PADRAO;
  return Math.min(100, Math.max(0, n));
}

/** «HH:MM» → minutos do dia, ou `null`. */
export function minutosDaHora(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * O próximo toque dos horários, a partir de `agora` (ms), contando como «ainda
 * vale» o que passou há menos de `TOLERANCIA_MS`. `null` se não há nenhum nos
 * próximos 8 dias. `jaTocou`: as chaves que esta aba já tocou (pula para o
 * dia seguinte daquele horário).
 */
export function proximoToque(
  agendamentos: readonly Agendamento[], agora: number, jaTocou: ReadonlySet<string> = new Set(),
): Toque | null {
  // Meia-noite de hoje em São Paulo, em ms UTC.
  const hojeSp = Math.floor((agora - FUSO_MS) / DIA_MS) * DIA_MS + FUSO_MS;
  let melhor: Toque | null = null;
  for (const a of agendamentos) {
    const min = minutosDaHora(a.hora);
    if (min === null) continue;
    for (let d = -1; d <= 7; d++) {
      const meiaNoite = hojeSp + d * DIA_MS;
      const semana = new Date(meiaNoite - FUSO_MS).getUTCDay();
      if (!a.dias.includes(semana)) continue;
      const quando = meiaNoite + min * 60_000;
      if (quando < agora - TOLERANCIA_MS) continue;
      const chave = `${a.id}:${new Date(meiaNoite - FUSO_MS).toISOString().slice(0, 10)}`;
      if (jaTocou.has(chave)) continue;
      if (!melhor || quando < melhor.quando) {
        melhor = { chave, quando, cor: a.cor, duracaoMs: duracaoSegura(a.duracao_s) * 1000, descricao: a.descricao, volume: volumeSeguro(a.volume) };
      }
      break;
    }
  }
  return melhor;
}

/** «Seg a Sex», «Todos os dias», «Seg, Qua, Sex». */
export function resumoDosDias(dias: readonly number[]): string {
  const d = [...new Set(dias)].sort((x, y) => x - y);
  if (d.length === 7) return 'Todos os dias';
  if (d.join() === '1,2,3,4,5') return 'Seg a Sex';
  if (d.join() === '1,2,3,4,5,6') return 'Seg a Sáb';
  return d.map(n => DIAS_DA_SEMANA[n]).join(', ');
}
