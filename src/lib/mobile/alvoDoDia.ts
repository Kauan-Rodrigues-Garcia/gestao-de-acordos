/**
 * Onde a pessoa (ou a equipe, ou o setor) tem que estar HOJE e no PRÓXIMO dia
 * útil para seguir no ritmo da meta — pedido de 13/10/2026 para o app: «a
 * projeção de quanto ele tem que estar hoje e quanto tem que estar amanhã».
 *
 * Sem conta nova: `esperado` e `metaDiaria` vêm de `calcularProjecao` (a mesma
 * do Painel), e o amanhã é `esperado + metaDiaria` — a régua sobe uma meta
 * diária por dia útil, como em `degrausComAmanha` (o «Amanhã» do cartão de
 * Quartil). O «hoje» segue o «conta o dia de hoje» da aba Metas, como todo o
 * resto: é o `esperado` que já chega pronto.
 *
 * O amanhã é o próximo dia ÚTIL do mês (sexta → segunda, véspera de feriado →
 * o dia depois). No último dia útil não há amanhã. Sem React e sem banco.
 */
import { listarDiasUteis } from '@/lib/diasUteis';

export interface AlvoDoDia {
  /** Quanto devia ter até hoje. */
  hoje: number;
  /** `recebido − hoje`: positivo é sobra. */
  diferencaHoje: number;
  /** O próximo dia útil do mês. `null` no último dia útil. */
  amanha: {
    alvo: number;
    /** Quanto falta para chegar lá (zero se já chegou). */
    falta: number;
    /** `yyyy-MM-dd`. */
    data: string;
    /** «amanhã», ou o dia da semana quando o próximo dia útil não é amanhã. */
    rotulo: string;
  } | null;
}

const DIA_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** `yyyy-MM-dd` + 1 dia, sem passar pelo fuso da máquina. */
function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** «amanhã» ou «segunda, 19/10». */
export function rotuloDoProximoDia(data: string, hojeISO: string): string {
  if (data === diaSeguinte(hojeISO)) return 'amanhã';
  const [a, m, d] = data.split('-').map(Number);
  const semana = DIA_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export function alvoDoDia(e: {
  recebido: number;
  esperado: number;
  metaDiaria: number;
  /** 'yyyy-MM-dd' — o «hoje» das contas. */
  hojeISO: string;
  feriados: readonly string[];
}): AlvoDoDia | null {
  if (!(e.metaDiaria > 0) || !Number.isFinite(e.esperado)) return null;
  const [ano, mes] = e.hojeISO.split('-').map(Number);
  const proximo = listarDiasUteis(ano, mes, [...e.feriados]).find(d => d > e.hojeISO) ?? null;
  const alvoAmanha = e.esperado + e.metaDiaria;
  return {
    hoje: e.esperado,
    diferencaHoje: e.recebido - e.esperado,
    amanha: proximo
      ? {
          alvo: alvoAmanha,
          falta: Math.max(0, alvoAmanha - e.recebido),
          data: proximo,
          rotulo: rotuloDoProximoDia(proximo, e.hojeISO),
        }
      : null,
  };
}
