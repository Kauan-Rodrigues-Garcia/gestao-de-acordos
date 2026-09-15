/**
 * calculoFechamento.ts — as contas da planilha de fechamento, sem inventar conta.
 *
 * ## De onde vem cada número
 *
 * A aba Fechamento substitui a planilha `Fechamento.xlsx` da gerência. Cada
 * coluna ou vem de uma regra que o Gestão JÁ tem, ou reproduz a fórmula da
 * planilha — nunca uma terceira coisa:
 *
 *   FECHAMENTO ............ `total_recebido` do resumo por operador do Analítico
 *                           (chega pronto; aqui só é somado)
 *   META .................. `metas.meta_valor` (chega pronta)
 *   META ATINGIDA ......... os degraus que o Gestão já tem: a 1ª Meta é
 *                           `meta_valor`, da 2ª em diante `metas_extras` — a
 *                           mesma leitura da Comissão por meta e do relatório de
 *                           fechamento (`metasBatidas`)
 *   ALCANCE META .......... `Informações!H`: FECHAMENTO ÷ META
 *   QUARTIL ............... `calcularProjecao`, a mesma conta da aba Quartis do
 *                           Analítico, com as faixas de `metas_config_mes`
 *   MÉDIA FATURAMENTO D.U.  `Informações!J`: FECHAMENTO ÷ D.U. TRABALHADO
 *
 *   FATURAMENTO TOTAL ..... `Outros!D25` — ver `FORA_DO_FATURAMENTO_TOTAL`
 *   MÉDIA POR DIA ÚTIL .... `Outros!K5`:  =J5/(AVERAGE(Tabela1[D.U TRABALHADO]))
 *                           com J5 = SUM(Tabela1[FECHAMENTO])
 *   MÉDIA POR FUNCIONÁRIO . `Outros!D27`: =D25/D26
 *
 * ## Vazio não é zero
 *
 * As fórmulas da planilha devolvem `""` quando falta base (fechamento zero,
 * meta vazia, D.U. vazio, divisão por zero). Aqui isso é `null`, e a tela
 * mostra «—». Um 0,00% no lugar de «sem meta» diria outra coisa.
 *
 * Sem React, sem fetch. Os casos estão em `calculoFechamento.test.ts`.
 */
import type { QuartilConfig } from '@/lib/supabase';
import { calcularProjecao } from '@/lib/projecaoMetas';
import {
  SITUACOES_FECHAMENTO, FORA_DO_FATURAMENTO_TOTAL, type SituacaoFechamento,
} from './situacoes';

/** Centavos inteiros: comparar dinheiro em ponto flutuante erra na borda. */
function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Qual degrau de meta o fechamento alcançou: 1 = 1ª Meta, 2 = 2ª Meta…
 *
 * `0` = tem meta e não alcançou nem a 1ª. `null` = sem meta.
 *
 * Os degraus são `meta_valor` seguido das `metas_extras`, e contam em ordem
 * crescente — a mesma leitura de `calcularComissao` (`[primeira, ...extras]`
 * ordenado) e de `metasBatidas` no relatório de fechamento. Contar quantos
 * degraus o fechamento cobre é o mesmo que achar o maior alcançado.
 */
export function metaAtingida(
  fechamento: number,
  meta: number | null,
  metasExtras: readonly number[],
): number | null {
  const principal = Number(meta) || 0;
  if (principal <= 0) return null;
  const recebido = emCentavos(Number(fechamento) || 0);
  const degraus = [principal, ...metasExtras.map(v => Number(v) || 0).filter(v => v > 0)];
  return degraus.filter(v => recebido >= emCentavos(v)).length;
}

/**
 * ALCANCE META, como fração (1.5461… = 154,62%).
 *
 * `Informações!H6`:
 *   =IFERROR(IF(OR(FECHAMENTO="",FECHAMENTO=0,META="",META=0),"",FECHAMENTO/META),"")
 */
export function alcanceDaMeta(fechamento: number, meta: number | null): number | null {
  const f = Number(fechamento) || 0;
  const m = Number(meta) || 0;
  if (f === 0 || m === 0) return null;
  return f / m;
}

/**
 * MÉDIA FATURAMENTO D.U.
 *
 * `Informações!J6`:
 *   =IFERROR(IF(OR(C6="",C6=0,D.U="",D.U=0),"",C6/D.U),"")
 */
export function mediaPorDu(fechamento: number, duTrabalhado: number | null): number | null {
  const f = Number(fechamento) || 0;
  const du = Number(duTrabalhado) || 0;
  if (f === 0 || du === 0) return null;
  return f / du;
}

export interface EntradaLinhaFechamento {
  operadorId: string;
  nome: string;
  equipeNome: string | null;
  /** O recebimento do operador no Analítico, no mês. */
  fechamento: number;
  /** `metas.meta_valor`. `null` = sem meta no mês. */
  meta: number | null;
  /** `metas.metas_extras`, já lidas. */
  metasExtras: readonly number[];
  /** Manual — `fechamento_operadores.du_trabalhado`. */
  duTrabalhado: number | null;
  /** Manual — `fechamento_operadores.situacao`. NÃO é `perfis.situacao`. */
  situacao: SituacaoFechamento | null;
  /**
   * Dias úteis do operador no mês, os MESMOS da aba Quartis: reduzidos quando
   * a equipe é de treinamento, e `decorridos` = mês inteiro num mês fechado.
   */
  totalUteis: number;
  decorridos: number;
}

export interface LinhaFechamento extends Omit<EntradaLinhaFechamento, 'totalUteis' | 'decorridos'> {
  metaAtingida: number | null;
  alcance: number | null;
  /** 1..4, ou `null` sem meta. */
  quartil: number | null;
  /**
   * `projecaoPct` de `calcularProjecao` — a régua de onde o quartil sai, e a
   * ordem da tabela (ver `ordenarLinhasFechamento`). `null` sem meta.
   */
  projecao: number | null;
  mediaPorDu: number | null;
}

/**
 * Uma linha da tabela.
 *
 * O quartil sai de `calcularProjecao` exatamente como na aba Quartis: sem
 * `limitePct`, com os dias úteis da pessoa. Num mês fechado a projeção é o
 * próprio fechamento ÷ meta; no mês corrente é o ritmo até hoje — e bate com o
 * que o Analítico mostra no mesmo dia (decisão de 14/09/2026).
 */
export function montarLinhaFechamento(
  entrada: EntradaLinhaFechamento,
  quartis: readonly QuartilConfig[],
): LinhaFechamento {
  const { totalUteis, decorridos, ...resto } = entrada;
  const projecao = calcularProjecao({
    meta: entrada.meta,
    recebido: entrada.fechamento,
    totalUteis,
    decorridos,
    quartis: [...quartis],
  });
  return {
    ...resto,
    metaAtingida: metaAtingida(entrada.fechamento, entrada.meta, entrada.metasExtras),
    alcance: alcanceDaMeta(entrada.fechamento, entrada.meta),
    quartil: projecao?.quartil?.quartil ?? null,
    projecao: projecao?.projecaoPct ?? null,
    mediaPorDu: mediaPorDu(entrada.fechamento, entrada.duTrabalhado),
  };
}

/**
 * A ordem da tabela: por quartil, como a aba Quartis do Painel Líder.
 *
 * Pedido de 14/09/2026 — «primeiros 1º quartil, 2º quartil e assim por
 * diante». Dentro do quartil, a maior projeção primeiro, que é a régua de
 * `QuartisOperadores`; sem meta (sem quartil) no fim, por nome, também como lá.
 * Empate pelo nome, para a ordem não mudar entre uma releitura e outra.
 *
 * A ordem alfabética de antes saiu da tabela, mas não do arquivo baixado: ele
 * usa esta mesma função, para a planilha e a tela contarem na mesma ordem.
 */
export function ordenarLinhasFechamento(linhas: readonly LinhaFechamento[]): LinhaFechamento[] {
  return [...linhas].sort((a, b) => {
    if (a.quartil !== b.quartil) {
      if (a.quartil === null) return 1;
      if (b.quartil === null) return -1;
      return a.quartil - b.quartil;
    }
    const pa = a.projecao ?? -Infinity;
    const pb = b.projecao ?? -Infinity;
    if (pa !== pb) return pb - pa;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

export interface FatiaSituacao {
  codigo: SituacaoFechamento;
  /** `Outros!D16:P16` — COUNTIF por situação. */
  qtd: number;
  /** `Outros!D20:P20` — qtd ÷ D26, 0 quando ninguém tem situação. */
  pct: number;
  /** `Outros!D23:P23` — SUMIFS do fechamento por situação. */
  fechamento: number;
}

export interface FatiaQuartilFechamento {
  quartil: number;
  qtd: number;
  /** qtd ÷ total com quartil. 0 quando ninguém tem quartil. */
  pct: number;
}

export interface ResumoFechamento {
  /** `Outros!J5` — SUM(Tabela1[FECHAMENTO]): todos os operadores exibidos. */
  somaFechamentos: number;
  /** `Outros!D25` — o card FATURAMENTO TOTAL. */
  faturamentoTotal: number;
  /** `Outros!K5` — J5 ÷ AVERAGE(D.U.). `null` quando a média não existe ou é 0. */
  mediaPorDiaUtil: number | null;
  /** `Outros!D27` — D25 ÷ D26. `null` quando ninguém tem situação. */
  mediaPorFuncionario: number | null;
  /** `Outros!D26` — quantos têm alguma das treze situações. */
  comSituacao: number;
  /** Quantos têm D.U. preenchido — base da média do K5. */
  comDu: number;
  porSituacao: FatiaSituacao[];
  porQuartil: FatiaQuartilFechamento[];
  /** Operadores com quartil — base do 100% por quartil. */
  totalComQuartil: number;
}

/**
 * Os indicadores e os gráficos da aba `Outros` da planilha.
 *
 * `quartis` só dá a ORDEM e a lista das faixas (1º a 4º, ou o que estiver
 * configurado) — a faixa de cada operador já veio na linha.
 *
 * ## Uma correção sobre a planilha, e só uma
 *
 * `Outros!D5:G5` contava os quartis com `COUNTIF(…,"1°Quartil")`, sem espaço,
 * enquanto a coluna de quartil escreve "1° Quartil". A contagem saía sempre 0 e
 * a representatividade, `#DIV/0!`. O gráfico da planilha nunca mostrou nada; o
 * que ele pretendia mostrar — quantos operadores em cada faixa — é o que sai
 * daqui.
 */
export function resumirFechamento(
  linhas: readonly LinhaFechamento[],
  quartis: readonly QuartilConfig[],
): ResumoFechamento {
  let somaFechamentos = 0;
  let somaDu = 0;
  let comDu = 0;

  const qtdSituacao = new Map<SituacaoFechamento, number>();
  const valorSituacao = new Map<SituacaoFechamento, number>();
  const qtdQuartil = new Map<number, number>();
  let totalComQuartil = 0;

  for (const l of linhas) {
    const fechamento = Number(l.fechamento) || 0;
    somaFechamentos += fechamento;

    // AVERAGE ignora célula vazia e conta o zero digitado.
    if (l.duTrabalhado !== null && l.duTrabalhado !== undefined) {
      somaDu += Number(l.duTrabalhado) || 0;
      comDu++;
    }

    if (l.situacao) {
      qtdSituacao.set(l.situacao, (qtdSituacao.get(l.situacao) ?? 0) + 1);
      valorSituacao.set(l.situacao, (valorSituacao.get(l.situacao) ?? 0) + fechamento);
    }

    if (l.quartil !== null) {
      qtdQuartil.set(l.quartil, (qtdQuartil.get(l.quartil) ?? 0) + 1);
      totalComQuartil++;
    }
  }

  // D26: a soma das treze contagens.
  const comSituacao = [...qtdSituacao.values()].reduce((a, b) => a + b, 0);

  // D25: a soma por situação, sem LICENÇA e FÉRIAS.
  let faturamentoTotal = 0;
  for (const [codigo, valor] of valorSituacao) {
    if (!FORA_DO_FATURAMENTO_TOTAL.has(codigo)) faturamentoTotal += valor;
  }

  // K5 = J5 / AVERAGE(D.U.). Sem D.U. nenhum, ou média zero, o IFERROR do card
  // devolve vazio.
  const mediaDu = comDu > 0 ? somaDu / comDu : 0;
  const mediaPorDiaUtil = mediaDu > 0 ? somaFechamentos / mediaDu : null;

  // D27 = D25 / D26, com o IFERROR do card.
  const mediaPorFuncionario = comSituacao > 0 ? faturamentoTotal / comSituacao : null;

  const porSituacao: FatiaSituacao[] = SITUACOES_FECHAMENTO.map(({ codigo }) => {
    const qtd = qtdSituacao.get(codigo) ?? 0;
    return {
      codigo,
      qtd,
      pct: comSituacao > 0 ? qtd / comSituacao : 0,
      fechamento: valorSituacao.get(codigo) ?? 0,
    };
  });

  const porQuartil: FatiaQuartilFechamento[] = [...quartis]
    .sort((a, b) => a.quartil - b.quartil)
    .map(q => {
      const qtd = qtdQuartil.get(q.quartil) ?? 0;
      return { quartil: q.quartil, qtd, pct: totalComQuartil > 0 ? qtd / totalComQuartil : 0 };
    });

  return {
    somaFechamentos,
    faturamentoTotal,
    mediaPorDiaUtil,
    mediaPorFuncionario,
    comSituacao,
    comDu,
    porSituacao,
    porQuartil,
    totalComQuartil,
  };
}
