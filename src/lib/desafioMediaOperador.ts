/**
 * A regra INDIVIDUAL do Desafio Cobrança (16/11/2026), em dois níveis: o
 * operador que fizer 4,5 médias diárias DELE nos dias do desafio sai 1 hora
 * mais cedo; com 5 médias, sai às 14:00 (banco de horas). Não entra na meta
 * geral — é a conta de cada um. Cada nível é uma chamada com o seu `fator`.
 *
 * ## A média diária é a do sistema
 *
 * A mesma de `ritmoDoPeriodo` (Analítico, Quartis): recebido no mês ÷ dias
 * úteis trabalhados. Os dias úteis saem de `diasUteisDecorridos`, que já
 * desconta fim de semana e os feriados passados (os do setor, se houver).
 *
 * ## Congelada na véspera do desafio
 *
 * A média é a de ANTES do primeiro dia do desafio. Se ela contasse os dias do
 * desafio, cada real a mais que o operador fizesse subiria a própria média — e
 * a meta andaria junto, fugindo dele. Congelada, a meta é a mesma do primeiro
 * ao último minuto.
 *
 * Por enquanto só o modelo de teste usa (`lab-desafio-cobranca.tsx`).
 */
import { ritmoDoPeriodo } from '@/lib/projecaoMetas';
import { diasUteisDecorridos } from '@/lib/diasUteis';

/** Quantas médias diárias o operador precisa fazer para sair 1 hora mais cedo. */
export const MEDIAS_PARA_SAIR_MAIS_CEDO = 4.5;
/** Quantas médias para sair às 14:00 (16/11/2026: o 2º nível da regra individual). */
export const MEDIAS_PARA_SAIR_AS_14 = 5;

/**
 * Dias úteis do mês ANTES do desafio — a base da média. Ex.: desafio em
 * 16/11/2026, com Finados (02/11) de feriado: 03 a 13/11 = 9 dias.
 */
export function diasUteisAntesDoDesafio(inicioISO: string, feriados: string[] = []): number {
  const [ano, mes] = inicioISO.split('-').map(Number);
  return diasUteisDecorridos(ano, mes, feriados, inicioISO, undefined, false);
}

export interface MetaDoOperador {
  /** Recebido no mês ÷ dias úteis trabalhados, antes do desafio. */
  mediaDiaria: number;
  /** 4,5 × a média. `null` sem média (operador sem dia trabalhado ou sem recebimento). */
  meta: number | null;
  /** O que ele fez nos dias do desafio até agora. */
  feito: number;
  /** Quantas médias o feito já é — cortado em uma casa: 4,49 não vira 4,5. */
  medias: number;
  /** Quanto falta para as 4,5 médias. `null` sem média; 0 = bateu. */
  falta: number | null;
  bateu: boolean;
  /** Dias do desafio que ainda contam, HOJE incluído. */
  diasRestantes: number;
  /** Quanto precisa por dia, de hoje até o fim. `null` sem média, já batido ou sem dia. */
  porDia: number | null;
}

export function metaDoOperadorNoDesafio(entrada: {
  /** O recebido dele no mês, até a véspera do desafio. */
  recebidoAntes: number;
  /** `diasUteisAntesDoDesafio`. */
  diasUteisAntes: number;
  /** O recebido dele em cada dia do desafio (dia que não chegou = 0). */
  recebidoNoDesafio: readonly number[];
  /** Índice do dia de hoje no desafio (0 = primeiro). */
  hoje: number;
  /** Quantas médias pede (4,5). */
  fator?: number;
}): MetaDoOperador {
  const fator = entrada.fator ?? MEDIAS_PARA_SAIR_MAIS_CEDO;
  const { mediaDiaria } = ritmoDoPeriodo({
    acumulado: Math.max(0, entrada.recebidoAntes),
    meta: null,
    totalUteis: entrada.diasUteisAntes,
    decorridos: entrada.diasUteisAntes,
  });
  const feito = entrada.recebidoNoDesafio.reduce((s, v) => s + Math.max(0, v), 0);
  const temMedia = mediaDiaria > 0;
  const meta = temMedia ? mediaDiaria * fator : null;
  const falta = meta === null ? null : Math.max(0, meta - feito);
  const diasRestantes = Math.max(0, entrada.recebidoNoDesafio.length - entrada.hoje);
  return {
    mediaDiaria,
    meta,
    feito,
    medias: temMedia ? Math.floor((feito / mediaDiaria) * 10) / 10 : 0,
    falta,
    bateu: falta === 0,
    diasRestantes,
    porDia: falta !== null && falta > 0 && diasRestantes > 0 ? falta / diasRestantes : null,
  };
}

/** A meta individual pronta para a gaveta: os dois níveis e de onde veio a média. */
export interface MinhaMetaNoDesafio extends MetaDoOperador {
  recebidoAntes: number;
  diasUteisAntes: number;
  /** O recebido dele em cada dia do desafio (dia que não chegou = 0). */
  recebidoPorDia: number[];
  /** O 2º nível (5 médias = sai às 14:00): a mesma média, outro fator. */
  maior: MetaDoOperador;
}

/**
 * A meta individual a partir do recebido DO OPERADOR no 59, dia a dia — o 59
 * já atribuído a ele pela sincronização (o Analítico, sem colchão).
 *
 * De propósito, isto NÃO recebe o placar inteiro: só os dias e as regras. A
 * fonte do placar geral (59 ou lançamento manual do super_admin), o total e os
 * lançamentos não chegam aqui — a média do operador vem SEMPRE do 59
 * (decisão do usuário, 16/11/2026: «só o valor total que não»).
 */
export function minhaMetaPeloRecebido(
  regras: { dias: readonly string[]; regra_medias: number; regra_medias_maior: number },
  recebidoPorDiaDoMes: Readonly<Record<string, number>>,
  feriados: string[],
  hoje: number,
): MinhaMetaNoDesafio {
  const inicio = regras.dias[0];
  const recebidoAntes = Object.entries(recebidoPorDiaDoMes)
    .filter(([d]) => d < inicio && d.slice(0, 7) === inicio.slice(0, 7))
    .reduce((s, [, v]) => s + v, 0);
  const recebidoPorDia = regras.dias.map(d => recebidoPorDiaDoMes[d] ?? 0);
  const diasUteisAntes = diasUteisAntesDoDesafio(inicio, feriados);
  const base = { recebidoAntes, diasUteisAntes, recebidoNoDesafio: recebidoPorDia, hoje };
  const meta = metaDoOperadorNoDesafio({ ...base, fator: regras.regra_medias });
  const maior = metaDoOperadorNoDesafio({ ...base, fator: regras.regra_medias_maior });
  return { ...meta, recebidoAntes, diasUteisAntes, recebidoPorDia, maior };
}
