/**
 * A regra INDIVIDUAL do Desafio Cobrança (16/11/2026), em dois níveis: o
 * operador que fizer 4,5 médias diárias DELE nos dias do desafio sai 1 hora
 * mais cedo; com 5 médias, sai às 14:00 (banco de horas). Não entra na meta
 * geral — é a conta de cada um. Cada nível é uma chamada com o seu `fator`.
 *
 * ## A média diária é a da META (usuário, 16/11/2026)
 *
 * Média diária = meta do mês do operador ÷ dias úteis DELE no mês. Os dias
 * úteis são a régua da pessoa (`diasUteisDoSetor` com o perfil): fim de
 * semana, feriados do setor e, para quem tem meta proporcional na aba Metas,
 * os dias em que ela não trabalha.
 *
 * Antes era o recebido do mês até a véspera ÷ dias trabalhados. Corrigido a
 * pedido do usuário: «deve ser a meta dividido pela quantidade de dias úteis
 * daquele usuário».
 *
 * A meta é a do mês inteiro, então a média não anda durante o desafio: a meta
 * individual é a mesma do primeiro ao último minuto. Sem meta cadastrada no
 * mês, a regra não vale para a pessoa.
 */
import { diasUteisDoMes } from '@/lib/diasUteis';

/** Quantas médias diárias o operador precisa fazer para sair 1 hora mais cedo. */
export const MEDIAS_PARA_SAIR_MAIS_CEDO = 4.5;
/** Quantas médias para sair às 14:00 (16/11/2026: o 2º nível da regra individual). */
export const MEDIAS_PARA_SAIR_AS_14 = 5;

/**
 * Dias úteis da pessoa no mês do 1º dia do desafio — a base da média. Ex.:
 * novembro/2026 com Finados (02/11) e a Consciência Negra (20/11) de feriado:
 * 21 dias úteis − 2 = 19.
 */
export function diasUteisDoMesDoDesafio(inicioISO: string, feriados: string[] = []): number {
  const [ano, mes] = inicioISO.split('-').map(Number);
  return diasUteisDoMes(ano, mes, feriados);
}

export interface MetaDoOperador {
  /** Meta do mês ÷ dias úteis da pessoa no mês. */
  mediaDiaria: number;
  /** `fator` × a média. `null` sem média (sem meta no mês ou sem dia útil). */
  meta: number | null;
  /** O que ele fez nos dias do desafio até agora. */
  feito: number;
  /** Quantas médias o feito já é — cortado em uma casa: 4,49 não vira 4,5. */
  medias: number;
  /** Quanto falta para as `fator` médias. `null` sem média; 0 = bateu. */
  falta: number | null;
  bateu: boolean;
  /** Dias do desafio que ainda contam, HOJE incluído. */
  diasRestantes: number;
  /** Quanto precisa por dia, de hoje até o fim. `null` sem média, já batido ou sem dia. */
  porDia: number | null;
}

export function metaDoOperadorNoDesafio(entrada: {
  /** A meta do mês do operador (aba Metas). */
  metaMensal: number;
  /** `diasUteisDoMesDoDesafio`, com a régua da pessoa. */
  diasUteisMes: number;
  /** O recebido dele em cada dia do desafio (dia que não chegou = 0). */
  recebidoNoDesafio: readonly number[];
  /** Índice do dia de hoje no desafio (0 = primeiro). */
  hoje: number;
  /** Quantas médias pede (4,5). */
  fator?: number;
}): MetaDoOperador {
  const fator = entrada.fator ?? MEDIAS_PARA_SAIR_MAIS_CEDO;
  const metaMensal = Math.max(0, Number(entrada.metaMensal) || 0);
  const mediaDiaria = entrada.diasUteisMes > 0 ? metaMensal / entrada.diasUteisMes : 0;
  const feito = entrada.recebidoNoDesafio.reduce((s, v) => s + Math.max(0, v), 0);
  const temMedia = mediaDiaria > 0;
  const meta = temMedia ? mediaDiaria * fator : null;
  // Centavo: 19 dias não dividem a meta exata, e a sobra de 0,0000001 não pode
  // deixar «falta R$ 0,00» sem bater.
  const falta = meta === null ? null : Math.max(0, Math.round((meta - feito) * 100) / 100);
  const diasRestantes = Math.max(0, entrada.recebidoNoDesafio.length - entrada.hoje);
  const bateu = falta === 0;
  const cortadas = temMedia ? Math.floor((feito / mediaDiaria) * 10 + 1e-9) / 10 : 0;
  return {
    mediaDiaria,
    meta,
    feito,
    // Bateu ao centavo: mostra as médias do nível, não 4,4 por causa da dízima.
    medias: bateu ? Math.max(cortadas, fator) : cortadas,
    falta,
    bateu,
    diasRestantes,
    porDia: falta !== null && falta > 0 && diasRestantes > 0 ? falta / diasRestantes : null,
  };
}

/** A meta individual pronta para a gaveta: os dois níveis e de onde veio a média. */
export interface MinhaMetaNoDesafio extends MetaDoOperador {
  /** A meta do mês dele (0 = sem meta cadastrada). */
  metaMensal: number;
  /** Dias úteis dele no mês. */
  diasUteisMes: number;
  /** O recebido dele em cada dia do desafio (dia que não chegou = 0). */
  recebidoPorDia: number[];
  /** O 2º nível (5 médias = sai às 14:00): a mesma média, outro fator. */
  maior: MetaDoOperador;
}

/**
 * A meta individual a partir da meta do mês do operador e do recebido DELE no
 * 59, dia a dia — o 59 já atribuído a ele pela sincronização (o Analítico).
 *
 * De propósito, isto NÃO recebe o placar inteiro: só os dias e as regras. A
 * fonte do placar geral (59 ou lançamento manual do super_admin), o total e os
 * lançamentos não chegam aqui — o feito do operador vem SEMPRE do 59
 * (decisão do usuário, 16/11/2026: «só o valor total que não»).
 */
export function minhaMetaNoDesafio(
  regras: { dias: readonly string[]; regra_medias: number; regra_medias_maior: number },
  metaMensal: number,
  recebidoPorDiaDoMes: Readonly<Record<string, number>>,
  feriados: string[],
  hoje: number,
): MinhaMetaNoDesafio {
  const recebidoPorDia = regras.dias.map(d => recebidoPorDiaDoMes[d] ?? 0);
  const diasUteisMes = diasUteisDoMesDoDesafio(regras.dias[0], feriados);
  const base = { metaMensal, diasUteisMes, recebidoNoDesafio: recebidoPorDia, hoje };
  const meta = metaDoOperadorNoDesafio({ ...base, fator: regras.regra_medias });
  const maior = metaDoOperadorNoDesafio({ ...base, fator: regras.regra_medias_maior });
  return { ...meta, metaMensal: Math.max(0, Number(metaMensal) || 0), diasUteisMes, recebidoPorDia, maior };
}
