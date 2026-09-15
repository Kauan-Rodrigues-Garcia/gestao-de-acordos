/**
 * vendasMeta.ts — a meta do Comercial tem DUAS réguas, e só uma vale.
 *
 * ## O que o pedido diz
 *
 * «A parte de meta é diferente nas vendas: tem setores que a meta são definidas
 * por vendas — exemplo, fez 10 vendas bateu a meta — e tem setores que são
 * divididos por valores, exemplo fazer R$ 100.000,00 bateu a meta. Na
 * configuração de meta deixar isso bem colocado, também podendo ser separado
 * por equipe.»
 *
 * Então a régua é **configuração**, não cálculo: o mesmo mês pode ser medido por
 * quantidade num setor e por valor noutro.
 *
 * ## As duas contas já existiam na planilha, e batem ao centavo
 *
 * O rodapé de agosto/2026 calculava as duas ao mesmo tempo. Conferido número a
 * número contra `Planilha Mensal (1).xlsx`:
 *
 *   meta de faturamento ....... R$ 962.136,00      21 dias úteis, 16 trabalhados
 *   META DO DIA ............... 962.136 ÷ 21 = 45.816,00          ✓ planilha
 *   EXPECT. FATURAMENTO ....... 45.816 × 16 = 733.056             ✓ planilha
 *   PROJEÇÃO .................. 683.531,24 ÷ 733.056 = 93,24%     ✓ planilha
 *   Falta p/Meta .............. 962.136 − 683.531,24 = 278.604,76 ✓ planilha
 *   Por Dia (5 restantes) ..... 278.604,76 ÷ 5 = 55.720,95        ✓ planilha
 *
 *   meta de quantidade ........ 161 vendas
 *   META DO DIA ............... 161 ÷ 21 = 7,67                   ✓ planilha
 *   EXPECTATIVA DE VENDA ...... 7,67 × 16 = 122,67                ✓ planilha
 *   Faltam para meta .......... 161 − 129 = 32                    ✓ planilha
 *
 * Não é conta nova: é a conta que a liderança já fazia na mão, escrita uma vez.
 *
 * ## Por que as duas são calculadas mesmo com uma só valendo
 *
 * Porque a que não vale continua sendo informação. Um setor medido por valor
 * que bate o dinheiro com metade das vendas está vendendo caro; um que bate a
 * quantidade e não o valor está vendendo barato. Esconder a régua não escolhida
 * apagaria a segunda leitura — e ela é gratuita.
 */
import type { ResumoVendas } from '@/lib/vendas';

/** Qual das duas decide se a meta foi batida. Vem da configuração. */
export type ReguaMeta = 'quantidade' | 'valor';

export const REGUAS: readonly ReguaMeta[] = ['quantidade', 'valor'] as const;

export const REGUA_LABEL: Record<ReguaMeta, string> = {
  quantidade: 'Quantidade de vendas',
  valor:      'Valor de faturamento',
};

export function ehRegua(v: unknown): v is ReguaMeta {
  return typeof v === 'string' && (REGUAS as readonly string[]).includes(v);
}

/** O que a configuração de meta guarda para um setor, equipe ou operador. */
export interface MetaDoRecorte {
  /** Qual régua vale. Sem ela, nada é «batido» — ver `progressoDaMeta`. */
  regua: ReguaMeta | null;
  /** Meta em quantidade de vendas. */
  quantidade: number;
  /** Meta em valor de faturamento. */
  valor: number;
}

/** O andamento de UMA régua. */
export interface AndamentoRegua {
  /** Quanto foi pedido. */
  alvo: number;
  /** Quanto foi feito — só o que está na régua «confirmada E assinada». */
  feito: number;
  /** `feito ÷ alvo`. `null` quando não há meta: 0/0 não é 0%, é «sem meta». */
  pct: number | null;
  /** Quanto falta. Nunca negativo — bater a meta não gera «falta -9». */
  falta: number;
  bateu: boolean;
}

export interface RitmoDoMes {
  /** Meta ÷ dias úteis do mês. É a «META DO DIA» da planilha. */
  porDia: number;
  /** O que deveria estar feito hoje: `porDia × dias trabalhados`. */
  esperado: number;
  /**
   * `feito ÷ esperado`. É a «PROJEÇÃO» da planilha — e não a projeção do mês
   * fechado: ela responde «estou no ritmo?», não «vou chegar lá?».
   */
  projecaoPct: number | null;
  /**
   * Quanto por dia daqui para frente, para fechar a meta. `null` quando não há
   * dia restante — aí a pergunta já não é de ritmo.
   */
  precisaPorDia: number | null;
}

export interface AndamentoDaMeta {
  regua: ReguaMeta | null;
  quantidade: AndamentoRegua;
  valor: AndamentoRegua;
  /** O andamento da régua que vale, ou `null` quando nenhuma foi escolhida. */
  oficial: AndamentoRegua | null;
  ritmoQuantidade: RitmoDoMes | null;
  ritmoValor: RitmoDoMes | null;
  /** O ritmo da régua que vale. */
  ritmoOficial: RitmoDoMes | null;
}

function andamento(alvo: number, feito: number): AndamentoRegua {
  const a = Number(alvo) || 0;
  const f = Number(feito) || 0;
  return {
    alvo: a,
    feito: f,
    // Sem meta não há percentual. Devolver 0% faria um setor sem meta aparecer
    // no fim do ranking como se estivesse indo mal.
    pct: a > 0 ? f / a : null,
    falta: Math.max(0, a - f),
    bateu: a > 0 && f >= a,
  };
}

function ritmo(alvo: number, feito: number, uteis: number, trabalhados: number): RitmoDoMes | null {
  const a = Number(alvo) || 0;
  if (a <= 0 || uteis <= 0) return null;

  // Piso de 1: no primeiro dia do mês `trabalhados` é 0, e dividir por ele
  // devolveria Infinity. Cobrar o esperado de um dia é a leitura certa — é o
  // mesmo piso que `calcularProjecao` usa na cobrança.
  const dias = Math.max(trabalhados, 1);
  const porDia = a / uteis;
  const esperado = porDia * dias;
  const restantes = Math.max(0, uteis - trabalhados);
  const falta = Math.max(0, a - (Number(feito) || 0));

  return {
    porDia,
    esperado,
    projecaoPct: esperado > 0 ? (Number(feito) || 0) / esperado : null,
    precisaPorDia: restantes > 0 ? falta / restantes : null,
  };
}

/**
 * O andamento das duas réguas, e qual delas manda.
 *
 * `uteis` são os dias úteis do mês e `trabalhados` os já decorridos — os mesmos
 * números que o Fechamento e o Painel Líder usam, de `@/lib/diasUteis`.
 */
export function progressoDaMeta(params: {
  meta: MetaDoRecorte;
  resumo: Pick<ResumoVendas, 'quantidade' | 'valor'>;
  uteis: number;
  trabalhados: number;
}): AndamentoDaMeta {
  const { meta, resumo, uteis, trabalhados } = params;

  const q = andamento(meta.quantidade, resumo.quantidade);
  const v = andamento(meta.valor, resumo.valor);
  const rq = ritmo(meta.quantidade, resumo.quantidade, uteis, trabalhados);
  const rv = ritmo(meta.valor, resumo.valor, uteis, trabalhados);

  const regua = ehRegua(meta.regua) ? meta.regua : null;

  return {
    regua,
    quantidade: q,
    valor: v,
    oficial:      regua === 'quantidade' ? q  : regua === 'valor' ? v  : null,
    ritmoQuantidade: rq,
    ritmoValor:      rv,
    ritmoOficial: regua === 'quantidade' ? rq : regua === 'valor' ? rv : null,
  };
}

/**
 * A meta bateu?
 *
 * **Sem régua escolhida, a resposta é `false`** — e não «bateu porque uma das
 * duas bateu». Deixar as duas valerem ao mesmo tempo é o defeito que a
 * configuração existe para evitar: um setor medido por valor que fez muitas
 * vendas pequenas apareceria como tendo batido sem ter batido.
 */
export function bateuAMeta(a: AndamentoDaMeta): boolean {
  return a.oficial?.bateu ?? false;
}

/**
 * O rótulo curto do andamento, para card e tabela.
 *
 * Devolve a régua oficial; a outra vai ao lado, na tela, como segunda leitura.
 */
export function rotuloDoAndamento(a: AndamentoDaMeta): string {
  if (!a.oficial || !a.regua) return 'Sem meta definida';
  const pct = a.oficial.pct === null ? '—' : `${Math.round(a.oficial.pct * 100)}%`;
  return a.regua === 'quantidade'
    ? `${a.oficial.feito} de ${a.oficial.alvo} vendas · ${pct}`
    : `${pct} do faturamento`;
}
