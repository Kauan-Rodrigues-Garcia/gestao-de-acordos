/**
 * O ritmo de um conjunto (equipe ou setor) contra a meta, para os resumos do
 * app — a MESMA conta do Painel Líder e do Painel de Metas: `calcularProjecao`
 * (meta ÷ dias úteis × decorridos) sobre os dias úteis do mês com os feriados
 * e o «conta o dia de hoje» da aba Metas. Sem React e sem banco.
 */
import { diasUteisDecorridos, diasUteisDoMes } from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';

export interface RitmoDoConjunto {
  meta: number;
  /** Quanto devia ter entrado até hoje. */
  esperado: number;
  /** `recebido − esperado`: positivo é sobra. */
  diferenca: number;
  /** % do esperado. */
  pctRitmo: number;
  /** % da meta do mês já alcançada. */
  pctMeta: number;
  /** Onde fecha, mantendo o ritmo dos dias úteis. */
  fecha: number;
  /** Quanto falta para a meta (zero se já passou). */
  falta: number;
}

export function ritmoDoConjunto(e: {
  recebido: number;
  meta: number | null | undefined;
  /** 'yyyy-MM' */
  mes: string;
  /** 'yyyy-MM-dd' — o «hoje» das contas. */
  hojeISO: string;
  feriados: readonly string[];
  contarHoje: boolean;
}): RitmoDoConjunto | null {
  const meta = Number(e.meta) || 0;
  if (meta <= 0) return null;
  const [ano, mes] = e.mes.split('-').map(Number);
  const fer = [...e.feriados];
  const totalUteis = diasUteisDoMes(ano, mes, fer);
  const mesAtual = e.hojeISO.slice(0, 7);
  const decorridos = e.mes < mesAtual
    ? totalUteis
    : Math.max(1, diasUteisDecorridos(ano, mes, fer, e.hojeISO, undefined, e.contarHoje));
  const p = calcularProjecao({ meta, recebido: e.recebido, totalUteis, decorridos, quartis: [] });
  if (!p) return null;
  return {
    meta,
    esperado: p.esperado,
    diferenca: p.diferenca,
    pctRitmo: p.esperado > 0 ? (e.recebido / p.esperado) * 100 : 0,
    pctMeta: (e.recebido / meta) * 100,
    fecha: decorridos > 0 ? (e.recebido / decorridos) * totalUteis : e.recebido,
    falta: Math.max(0, meta - e.recebido),
  };
}
