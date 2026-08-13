/**
 * projecaoMetas.ts — a conta de "estou no ritmo?", num lugar só.
 *
 * ## Por que este arquivo existe
 *
 * A mesma matemática estava escrita duas vezes, em telas que precisam concordar:
 * o antigo `MetaProgressoHeader` (o progresso do próprio usuário, no cabeçalho
 * do Dashboard) e `QuartisOperadores` (a mesma leitura, por operador, na aba
 * Analítico).
 *
 * As duas repetiam `meta ÷ dias úteis`, `diária × decorridos`, `recebido −
 * esperado` e `recebido ÷ esperado × 100`, com diferenças pequenas o bastante
 * para passar despercebidas e grandes o bastante para um operador perguntar por
 * que a % da tela dele não bate com a da tela do líder.
 *
 * Hoje os consumidores são `usePainelMetas` e `QuartisOperadores`.
 *
 * `lib/diasUteis.ts` continua sendo o dono do CALENDÁRIO (quais dias contam,
 * qual quartil uma % alcança). Este arquivo é o dono da CONTA que usa esse
 * calendário. A separação importa: quem mexe em feriado não mexe em projeção.
 */

import { quartilAtual, proximoQuartil } from '@/lib/diasUteis';

import type { QuartilConfig } from '@/lib/supabase';

export interface EntradaProjecao {
  /** Meta do período. `null`/0 significa "sem meta" — a função devolve null. */
  meta: number | null | undefined;
  /** Realizado até agora, na mesma base da meta. */
  recebido: number;
  /** Dias úteis do mês inteiro (`diasUteisDoMes`). */
  totalUteis: number;
  /** Dias úteis já trabalhados (`diasUteisDecorridos`). Piso de 1 aplicado aqui. */
  decorridos: number;
  /** Faixas configuradas em `metas_config_mes.quartis`. */
  quartis: QuartilConfig[];
  /**
   * Teto da % de projeção exibida.
   *
   * Existe porque os dois consumidores originais discordavam: o header pessoal
   * limitava em 999% (`Math.min`), a tabela de quartis não limitava. Manter o
   * parâmetro preserva os dois comportamentos exatos em vez de escolher um e
   * mudar um número em produção de lado. Unificar é uma decisão de produto,
   * não uma consequência de refatoração.
   */
  limitePct?: number;
}

export interface ResultadoProjecao {
  /** Quanto precisa entrar por dia útil para bater a meta. */
  metaDiaria: number;
  /** Quanto já deveria ter entrado até hoje. */
  esperado: number;
  /** `recebido − esperado`. Positivo = acima do ritmo. */
  diferenca: number;
  /** `recebido ÷ esperado × 100`, arredondado. */
  projecaoPct: number;
  /** Faixa que a projeção alcança. `null` quando não há quartis configurados. */
  quartil: QuartilConfig | null;
  /** Faixa imediatamente acima. `null` quando já está na melhor. */
  proximo: QuartilConfig | null;
  /** Quanto falta receber para alcançar `proximo`. `null` sem próxima faixa. */
  paraSubir: number | null;
}

/**
 * A conta completa da projeção.
 *
 * Devolve `null` — e não um objeto zerado — quando não há meta ou não há dias
 * úteis. É a diferença entre "este operador está a 0% da meta" e "este operador
 * não tem meta", e a tela precisa dizer coisas diferentes nos dois casos.
 */
export function calcularProjecao(entrada: EntradaProjecao): ResultadoProjecao | null {
  const { recebido, totalUteis, quartis, limitePct } = entrada;
  const meta = Number(entrada.meta) || 0;

  if (meta <= 0 || totalUteis <= 0) return null;

  // Piso de 1: no primeiro dia do mês `decorridos` é 0, e dividir por ele
  // devolveria Infinity. Cobrar o esperado de um dia é a leitura certa.
  const decorridos = Math.max(entrada.decorridos, 1);

  const metaDiaria = meta / totalUteis;
  const esperado   = metaDiaria * decorridos;
  const diferenca  = recebido - esperado;

  const bruta = esperado > 0 ? Math.round((recebido / esperado) * 100) : 0;
  const projecaoPct = limitePct === undefined ? bruta : Math.min(bruta, limitePct);

  const quartil = quartilAtual(projecaoPct, quartis);
  const proximo = proximoQuartil(quartil, quartis);
  const paraSubir = proximo
    ? Math.max(0, (esperado * proximo.min_pct) / 100 - recebido)
    : null;

  return { metaDiaria, esperado, diferenca, projecaoPct, quartil, proximo, paraSubir };
}

/**
 * % de um valor sobre uma base, arredondada e limitada.
 *
 * O mesmo helper que vivia solto dentro de `MetaProgressoHeader`. Base zero ou
 * negativa devolve 0 em vez de `Infinity`/`NaN`.
 */
export function pctLimitado(valor: number, base: number, limite = 999): number {
  if (!base || base <= 0) return 0;
  return Math.min(Math.round((valor / base) * 100), limite);
}

export interface DiaComRecebimento {
  /** Dia do mês (1..31). */
  dia: number;
  bruto: number;
  qtd: number;
}

/**
 * O último dia ANTES de `hojeDia` que teve recebimento.
 *
 * Deliberadamente "último dia com recebimento", e não "último dia útil": os dois
 * divergem sempre que houve feriado, ponte ou simplesmente um dia sem baixa, e
 * quem olha o card quer saber quando entrou dinheiro pela última vez — um card
 * marcando ontem com R$ 0,00 não responde nada.
 *
 * Num mês FECHADO não existe "hoje": passe `diasNoMes + 1` para que todos os
 * dias do mês fiquem elegíveis.
 */
export function ultimoDiaComRecebimento(
  porDia: Record<number, { bruto: number; qtd?: number }>,
  hojeDia: number,
): DiaComRecebimento | null {
  for (let dia = hojeDia - 1; dia >= 1; dia--) {
    const d = porDia[dia];
    if (d && d.bruto > 0) return { dia, bruto: d.bruto, qtd: d.qtd ?? 0 };
  }
  return null;
}
