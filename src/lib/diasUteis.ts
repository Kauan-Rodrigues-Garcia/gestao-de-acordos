/**
 * diasUteis.ts — cálculo de dias úteis do mês e quartis de projeção.
 *
 * Dias úteis = segundas a sextas do mês, menos os feriados cadastrados
 * (metas_config_mes.feriados). Feriados em fim de semana não subtraem.
 *
 * Projeção: com a meta mensal e os dias úteis, a meta diária é
 * meta / diasUteis. O esperado até hoje é metaDiaria × diasUteisDecorridos
 * (inclui o dia atual, pois o analítico do dia chega ao longo do dia).
 * O quartil é a faixa configurada cuja % mínima a projeção alcança.
 */

import type { QuartilConfig } from '@/lib/supabase';

/** true se a data ISO ('yyyy-MM-dd') cai de segunda a sexta. */
export function ehDiaUtil(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 5;
}

function isoDoDia(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Todos os dias úteis do mês (seg–sex − feriados), em ISO.
 *
 * `inicioISO` (equipes de treinamento): conta só os dias a partir dessa data.
 * Feriados anteriores ao início ficam de fora naturalmente (são dias < início);
 * feriados após o início continuam subtraindo.
 */
export function listarDiasUteis(
  ano: number, mes: number, feriados: string[] = [], inicioISO?: string,
): string[] {
  const fSet = new Set(feriados);
  const total = new Date(ano, mes, 0).getDate();
  const dias: string[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = isoDoDia(ano, mes, d);
    if (ehDiaUtil(iso) && !fSet.has(iso) && (!inicioISO || iso >= inicioISO)) dias.push(iso);
  }
  return dias;
}

/** Quantidade de dias úteis do mês (seg–sex − feriados). */
export function diasUteisDoMes(
  ano: number, mes: number, feriados: string[] = [], inicioISO?: string,
): number {
  return listarDiasUteis(ano, mes, feriados, inicioISO).length;
}

/**
 * Dias úteis já trabalhados até `hojeISO`.
 * Se hoje não for dia útil (ou for feriado), conta só os anteriores.
 * `inicioISO` (treinamento): ignora os dias antes do início das atividades.
 * `contarHoje` (metas_config_mes.contar_dia_atual): inclui o dia atual. O dia
 * de hoje ainda está acontecendo — o analítico dele só fecha no fim do
 * expediente —, então contá-lo infla o esperado e derruba a projeção durante
 * o dia. Default true só por compatibilidade da assinatura; quem chama passa
 * o valor da config, cujo padrão no banco é FALSE.
 */
export function diasUteisDecorridos(
  ano: number, mes: number, feriados: string[] = [], hojeISO: string,
  inicioISO?: string, contarHoje = true,
): number {
  return listarDiasUteis(ano, mes, feriados, inicioISO)
    .filter(d => (contarHoje ? d <= hojeISO : d < hojeISO)).length;
}

/** Quartis ordenados do melhor (maior min_pct) para o pior. */
export function ordenarQuartis(quartis: QuartilConfig[]): QuartilConfig[] {
  return [...quartis].sort((a, b) => b.min_pct - a.min_pct);
}

/**
 * Quartil atual dado a % de projeção (realizado ÷ esperado até hoje × 100).
 * Retorna a faixa de maior min_pct que a projeção alcança; se nenhuma,
 * a pior faixa configurada.
 */
export function quartilAtual(projecaoPct: number, quartis: QuartilConfig[]): QuartilConfig | null {
  if (!quartis.length) return null;
  const ordenados = ordenarQuartis(quartis);
  return ordenados.find(q => projecaoPct >= q.min_pct) ?? ordenados[ordenados.length - 1];
}

/** Próxima faixa acima do quartil atual (null se já está na melhor). */
export function proximoQuartil(atual: QuartilConfig | null, quartis: QuartilConfig[]): QuartilConfig | null {
  if (!atual || !quartis.length) return null;
  const ordenados = ordenarQuartis(quartis);           // melhor → pior
  const idx = ordenados.findIndex(q => q.quartil === atual.quartil);
  return idx > 0 ? ordenados[idx - 1] : null;
}

export const QUARTIS_PADRAO: QuartilConfig[] = [
  { quartil: 1, min_pct: 100 },
  { quartil: 2, min_pct: 80 },
  { quartil: 3, min_pct: 50 },
  { quartil: 4, min_pct: 0 },
];
