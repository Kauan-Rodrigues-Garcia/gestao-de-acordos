/**
 * detalheOperador.ts — as contas da linha expandida da aba Quartis.
 *
 * ## Por que é um arquivo à parte
 *
 * Mesma razão de `desempenhoEquipe.ts`: aqui entra dado e sai NÚMERO — onde o
 * operador fecha o mês no ritmo atual, quanto falta para cada faixa, quanto
 * precisa por dia útil restante. Esse é exatamente o tipo de lógica que o
 * projeto já aprendeu a tirar de dentro de `useMemo` (ver o cabeçalho de
 * `agregacaoLider.ts`, cujos três incidentes de clone nasceram lá dentro).
 *
 * Sem React, sem fetch.
 *
 * ## O que NÃO se calcula aqui
 *
 * O ritmo (`ritmoDoPeriodo`) e a projeção (`calcularProjecao`) vêm de
 * `lib/projecaoMetas`, os mesmos que o card de Desempenho Equipes usa. É o que
 * garante que o operador aberto na aba Quartis e o mesmo operador dentro do card
 * da equipe dele mostrem o mesmo número — as duas abas já divergiram uma vez,
 * por dias úteis, e a correção foi passar a contagem por parâmetro em vez de
 * recalculá-la de cada lado.
 *
 * Os dias úteis continuam chegando prontos: quem chama decide se o mês é cheio
 * ou reduzido por equipe em treinamento.
 */

import {
  calcularProjecao, degrausComAmanha, ritmoDoPeriodo, type DegrauComAmanha,
} from '@/lib/projecaoMetas';

import type { QuartilConfig } from '@/lib/supabase';

export interface EntradaDetalheOperador {
  /** Recebido no analítico dentro do mês. */
  recebido: number;
  /** Meta individual. `null` = sem meta configurada. */
  meta: number | null;
  /** Dias úteis do mês — reduzidos quando a equipe é de treinamento. */
  totalUteis: number;
  /** Dias úteis já trabalhados, na mesma base de `totalUteis`. */
  decorridos: number;
  quartis: QuartilConfig[];
  /**
   * Quantos pagamentos compõem o recebido (`total_pagamentos` do analítico).
   *
   * `0` significa "nenhum pagamento", e não "sem informação": o ticket médio
   * devolve `null` nos dois casos porque dividir por zero não responde nada.
   */
  pagamentos?: number;
  /** H.O. do recebido. Só a PaguePlay exibe. */
  ho?: number;
  /**
   * Recebimento de cada pessoa do grupo em exibição, incluindo o próprio.
   *
   * Serve para posição e participação. Vazio ou ausente = a tela está mostrando
   * o operador sozinho, e os dois campos vêm `null` em vez de "1º de 1", que
   * seria um elogio sem base.
   */
  recebidosDoGrupo?: readonly number[];
}

export interface DetalheOperador {
  // ── Ritmo ────────────────────────────────────────────────────────────────
  /** Dias úteis já trabalhados no recorte deste operador. */
  diasTrabalhados: number;
  /** Dias úteis que ainda faltam. */
  diasRestantes: number;
  /** Recebido ÷ dias trabalhados. */
  mediaDiaria: number;
  /** Onde o mês fecha mantendo a média atual — a estimativa de fechamento. */
  projecaoFechamento: number;
  /** Quanto falta para a meta do mês. `null` sem meta, `0` = batida. */
  faltaMeta: number | null;
  /** `projecaoFechamento − meta`. Positivo = fecha acima. `null` sem meta. */
  sobraProjetada: number | null;
  /** Quanto precisa por dia útil restante para bater a meta. */
  ritmoNecessario: number | null;
  /**
   * A projeção de fechamento bate a meta?
   *
   * `null` sem meta. Separado de `sobraProjetada >= 0` para a tela não repetir a
   * comparação e errar o sinal num dos dois lugares.
   */
  fechaBatendo: boolean | null;

  // ── Quartis ──────────────────────────────────────────────────────────────
  /** % de projeção (recebido ÷ esperado até hoje). `null` sem meta. */
  projecaoPct: number | null;
  /** Faixa atual. `null` sem meta ou sem quartis configurados. */
  faixaAtual: QuartilConfig | null;
  /** Faixa imediatamente acima. `null` quando já está na melhor. */
  proximaFaixa: QuartilConfig | null;
  /**
   * Quanto falta para CADA faixa, da melhor para a pior. Vazio sem meta.
   *
   * Cada degrau traz DOIS números: o de hoje (entrar na faixa) e o de amanhã
   * (continuar nela depois que a régua subir mais um dia útil). Entrar não é
   * ficar, e a linha expandida só respondia a primeira metade.
   */
  degraus: DegrauComAmanha[];
  /**
   * Meta ÷ dias úteis do mês — o quanto a régua sobe por dia.
   *
   * `null` sem meta. Não confundir com `mediaDiaria`, que é o que a pessoa
   * produz: esta é o que a meta exige.
   */
  metaDiaria: number | null;
  /** Quanto já deveria ter recebido até hoje. `null` sem meta. */
  esperadoHoje: number | null;

  // ── Números do operador ──────────────────────────────────────────────────
  /** Recebido ÷ meta × 100, arredondado. `null` sem meta. Não é a projeção. */
  pctMeta: number | null;
  /** Pagamentos que compõem o recebido. `null` quando não informado. */
  pagamentos: number | null;
  /** Recebido ÷ pagamentos. `null` sem pagamento. */
  ticketMedio: number | null;
  /** H.O. do recebido. `null` quando não informado. */
  ho: number | null;
  /** Posição por recebimento dentro do grupo exibido. `null` sem grupo. */
  posicao: number | null;
  /** Quantas pessoas no grupo exibido. `0` sem grupo. */
  tamanhoGrupo: number;
  /** Fatia do recebimento do grupo que é deste operador. `null` sem grupo. */
  participacaoPct: number | null;
}

/**
 * As contas da linha expandida.
 *
 * Nunca devolve `null`: a linha sempre abre. O que não dá para calcular vem
 * `null` campo a campo, para a tela mostrar "—" no lugar certo em vez de um zero
 * que parece dado real — a mesma regra de `detalharEquipe`.
 */
export function detalharOperador(entrada: EntradaDetalheOperador): DetalheOperador {
  const {
    recebido, meta, totalUteis, decorridos, quartis,
    pagamentos, ho, recebidosDoGrupo,
  } = entrada;

  const ritmo = ritmoDoPeriodo({ acumulado: recebido, meta, totalUteis, decorridos });

  const proj = calcularProjecao({ meta, recebido, totalUteis, decorridos, quartis });

  const degraus = proj
    ? degrausComAmanha({
        recebido,
        esperado:      proj.esperado,
        metaDiaria:    proj.metaDiaria,
        diasRestantes: ritmo.diasRestantes,
        quartis,
      })
    : [];

  const metaNum = Number(meta) || 0;
  const pctMeta = metaNum > 0 ? Math.round((recebido / metaNum) * 100) : null;

  const qtd = pagamentos ?? null;
  const ticketMedio = qtd !== null && qtd > 0 ? recebido / qtd : null;

  // ── Posição e participação ──────────────────────────────────────────────
  // Posição é "quantos receberam MAIS que eu, mais um". Empate divide o mesmo
  // lugar, que é como um ranking é lido em voz alta: dois operadores com o mesmo
  // valor não são 2º e 3º.
  const grupo = recebidosDoGrupo ?? [];
  const posicao = grupo.length
    ? grupo.filter(v => v > recebido).length + 1
    : null;
  const totalGrupo = grupo.reduce((s, v) => s + v, 0);
  const participacaoPct = grupo.length && totalGrupo > 0
    ? Math.round((recebido / totalGrupo) * 1000) / 10
    : null;

  return {
    diasTrabalhados: Math.max(decorridos, 0),
    diasRestantes:   ritmo.diasRestantes,
    mediaDiaria:     ritmo.mediaDiaria,
    projecaoFechamento: ritmo.projecaoFechamento,
    faltaMeta:       ritmo.faltaMeta,
    sobraProjetada:  ritmo.sobraProjetada,
    ritmoNecessario: ritmo.ritmoNecessario,
    fechaBatendo:    ritmo.sobraProjetada === null ? null : ritmo.sobraProjetada >= 0,

    projecaoPct:  proj?.projecaoPct ?? null,
    faixaAtual:   proj?.quartil ?? null,
    proximaFaixa: proj?.proximo ?? null,
    degraus,
    metaDiaria:   proj?.metaDiaria ?? null,
    esperadoHoje: proj?.esperado ?? null,

    pctMeta,
    pagamentos: qtd,
    ticketMedio,
    ho: ho ?? null,
    posicao,
    tamanhoGrupo: grupo.length,
    participacaoPct,
  };
}
