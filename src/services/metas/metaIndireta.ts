/**
 * metaIndireta.ts — meta direta × indireta `[PaguePlay]`.
 *
 * ## O que é o recebimento indireto
 *
 * O operador com a lógica Direto/Extra ativa fecha acordos em nome de outra
 * pessoa: ele entra como **EXTRA**, o titular continua **DIRETO**, e o dinheiro
 * entra pelo titular. Até aqui, esse trabalho não somava em canto nenhum — nem
 * na meta dele, nem na da equipe, nem na do setor.
 *
 * A meta indireta é o único lugar onde ele conta. A fonte é
 * `fn_recebimento_indireto_mes`: acordos `tipo_vinculo = 'extra'` com
 * `status = 'pago'`, do mês de `coalesce(data_pagamento, vencimento)`.
 *
 * ## Individual, e só
 *
 * Meta e recebimento indiretos **não** entram no acumulado da equipe nem no do
 * setor (decisão de 18/08/2026). Somar ali contaria o mesmo dinheiro duas
 * vezes: o extra já entra no recebimento do titular direto, que está na mesma
 * equipe. Pode mudar; hoje não soma.
 *
 * ## O quartil é do TOTAL
 *
 * Quem tem as duas metas é medido pela soma: `(direta + indireta)` contra
 * `(recebido direto + recebido indireto)`. Cobrar o quartil só pela metade
 * direta puniria exatamente quem foi bem no extra — o oposto do que a meta
 * indireta existe para provocar.
 *
 * Este arquivo é puro: entra número, sai número. A busca vive em
 * `recebimentoIndireto.service.ts`, e a projeção continua sendo a de
 * `lib/projecaoMetas.ts` — aqui só se decide **o que** entra nela.
 */

/** Meta e recebimento de um operador nas duas frentes. */
export interface EntradaMetaDupla {
  /** Meta direta (a de sempre). `null` = sem meta configurada. */
  metaDireta: number | null;
  /**
   * Meta indireta. `null` = a opção está desligada para este operador.
   *
   * Zero e `null` significam a mesma coisa aqui de propósito: o banco só aceita
   * `meta_indireta_ativa = true` com valor maior que zero (constraint
   * `metas_indireta_coerente`), então um zero que chegue é lixo de estado
   * intermediário da tela, não uma meta de R$ 0,00.
   */
  metaIndireta: number | null;
  /** Recebido no analítico — a frente direta. */
  recebidoDireto: number;
  /** Recebido em acordos extra pagos — a frente indireta. */
  recebidoIndireto: number;
}

export interface MetaDupla {
  /** As duas frentes valem para este operador? */
  ativa: boolean;
  /** O que a projeção e o quartil devem usar como meta. */
  metaTotal: number | null;
  /** O que a projeção e o quartil devem usar como recebido. */
  recebidoTotal: number;
  metaDireta: number | null;
  metaIndireta: number | null;
  recebidoDireto: number;
  recebidoIndireto: number;
  /** `recebidoDireto ÷ metaDireta × 100`. `null` sem meta direta. */
  pctDireta: number | null;
  /** `recebidoIndireto ÷ metaIndireta × 100`. `null` com a opção desligada. */
  pctIndireta: number | null;
  /** Falta para a meta direta. `null` sem meta. 0 = batida. */
  faltaDireta: number | null;
  /** Falta para a meta indireta. `null` com a opção desligada. 0 = batida. */
  faltaIndireta: number | null;
}

/**
 * As colunas da meta indireta, lidas de uma linha de `metas` que pode não
 * tê-las.
 *
 * A tolerância não é zelo excessivo: o site sobe pela Vercel no `push`, e a
 * migration é aplicada à mão depois. Entre os dois momentos, pedir
 * `meta_indireta_ativa` num `select` derruba a consulta inteira no PostgREST —
 * e a aba Quartis mostraria "sem meta" para o setor todo, sem erro visível.
 *
 * Quem chama faz o `select` com as colunas e passa a linha por aqui; a leitura
 * de uma linha antiga devolve `null`, que é exatamente "não tem meta indireta".
 */
export function lerMetaIndiretaDaLinha(
  linha: { meta_indireta_ativa?: boolean | null; meta_indireta_valor?: number | null } | null,
): number | null {
  if (!linha) return null;
  const valor = Number(linha.meta_indireta_valor) || 0;
  // A flag E o valor: a constraint do banco já garante o par, mas linha gravada
  // antes da migration vem com as duas colunas no default.
  return linha.meta_indireta_ativa === true && valor > 0 ? valor : null;
}

/** Percentual inteiro de `valor` sobre `base`. `null` quando não há base. */
function pct(valor: number, base: number | null): number | null {
  if (!base || base <= 0) return null;
  return Math.round((valor / base) * 100);
}

/**
 * Combina as duas frentes num par (meta, recebido) para a projeção.
 *
 * Com a opção desligada, devolve exatamente a leitura de hoje: `metaTotal` é a
 * meta direta e `recebidoTotal` é o recebimento do analítico. É o que garante
 * que ligar a meta indireta seja a única coisa que muda o número de alguém —
 * quem não usa não sente.
 */
export function combinarMetaDupla(entrada: EntradaMetaDupla): MetaDupla {
  const { recebidoDireto } = entrada;

  const metaDireta = Number(entrada.metaDireta) > 0 ? Number(entrada.metaDireta) : null;
  const metaIndireta = Number(entrada.metaIndireta) > 0 ? Number(entrada.metaIndireta) : null;
  const ativa = metaIndireta !== null;

  // Sem a opção ligada o recebimento indireto é ignorado, mesmo que exista.
  // Ele não some do sistema — some DESTA conta, que é a conta de meta. Somar um
  // extra pago no recebimento de quem não tem meta indireta inflaria a % de
  // quem nunca foi cobrado por ele.
  const recebidoIndireto = ativa ? Math.max(0, Number(entrada.recebidoIndireto) || 0) : 0;

  const metaTotal = ativa && metaDireta !== null
    ? metaDireta + metaIndireta
    // Meta indireta sem meta direta é possível (operador só de extra) e a
    // indireta vira a meta inteira. Sem nenhuma das duas, continua sem meta.
    : ativa ? metaIndireta : metaDireta;

  return {
    ativa,
    metaTotal,
    recebidoTotal: recebidoDireto + recebidoIndireto,
    metaDireta,
    metaIndireta,
    recebidoDireto,
    recebidoIndireto,
    pctDireta:   pct(recebidoDireto, metaDireta),
    pctIndireta: ativa ? pct(recebidoIndireto, metaIndireta) : null,
    faltaDireta:   metaDireta   !== null ? Math.max(0, metaDireta   - recebidoDireto)   : null,
    faltaIndireta: metaIndireta !== null ? Math.max(0, metaIndireta - recebidoIndireto) : null,
  };
}
