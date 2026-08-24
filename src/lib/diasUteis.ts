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
import { diasNoMes } from '@/lib/mesReferencia';

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
  const total = diasNoMes(`${ano}-${String(mes).padStart(2, '0')}`);
  const dias: string[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = isoDoDia(ano, mes, d);
    if (ehDiaUtil(iso) && !fSet.has(iso) && (!inicioISO || iso >= inicioISO)) dias.push(iso);
  }
  return dias;
}

/**
 * Dias úteis de um INTERVALO qualquer, mesmo atravessando meses.
 *
 * As funções acima são por mês, porque meta e quartil são mensais. O
 * monitoramento de uso pergunta outra coisa — «nos últimos 90 dias, quantos
 * eram dias de trabalho?» — e essa janela cruza três meses.
 *
 * Existe aqui, e não no painel de uso, para que o percentual de assiduidade e o
 * percentual de meta contem dia útil com a MESMA régua: mesmo fim de semana,
 * mesma lista de feriados. Duas definições de «dia de trabalho» no mesmo
 * sistema é o tipo de divergência que ninguém nota até alguém comparar dois
 * relatórios.
 *
 * As datas nunca passam por `new Date(iso)` para andar no calendário:
 * `new Date('2026-08-24')` é meia-noite UTC, que em São Paulo é 21h do dia 23.
 * O passo é aritmética de UTC, e a comparação é textual.
 */
export function listarDiasUteisIntervalo(
  desdeISO: string, ateISO: string, feriados: string[] = [],
): string[] {
  const MS_DIA = 86_400_000;
  const inicio = Date.parse(`${desdeISO.slice(0, 10)}T00:00:00Z`);
  const fim    = Date.parse(`${ateISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return [];

  // Teto de segurança: uma janela absurda vinda de estado corrompido não pode
  // gerar um array de anos e travar a aba.
  const total = Math.round((fim - inicio) / MS_DIA);
  if (total > 800) return [];

  const fSet = new Set(feriados);
  const dias: string[] = [];
  for (let i = 0; i <= total; i++) {
    const iso = new Date(inicio + i * MS_DIA).toISOString().slice(0, 10);
    if (ehDiaUtil(iso) && !fSet.has(iso)) dias.push(iso);
  }
  return dias;
}

/** Quantos dias úteis há entre duas datas, inclusive nas pontas. */
export function diasUteisIntervalo(
  desdeISO: string, ateISO: string, feriados: string[] = [],
): number {
  return listarDiasUteisIntervalo(desdeISO, ateISO, feriados).length;
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

/** Cor de cada quartil. Casa com as faixas de QUARTIS_PADRAO. */
export const COR_QUARTIL: Record<number, string> = {
  1: '#22c55e',  // verde   — 100%+
  2: '#6366f1',  // azul    — 80 a 99,99%
  3: '#f59e0b',  // amarelo — 50 a 79,99%
  4: '#ef4444',  // vermelho— 0 a 49,99%
};

/**
 * Cor de uma projeção (%). Mesma paleta dos quartis, para o painel de equipe/
 * setor falar a mesma língua da tabela de operadores.
 *
 * Faixas fixas de propósito: os quartis são configuráveis (metas_config_mes),
 * mas a leitura visual "vermelho = mal, verde = bateu" não deve mudar junto.
 */
export function corProjecao(pct: number): string {
  if (pct >= 100) return COR_QUARTIL[1];
  if (pct >= 80)  return COR_QUARTIL[2];
  if (pct >= 50)  return COR_QUARTIL[3];
  return COR_QUARTIL[4];
}
