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

/* ── A meta proporcional à presença ───────────────────────────────────────── */

/**
 * Quanto do mês de trabalho o recorte teve de verdade.
 *
 * Era o item que sobrou da Fase 8: «Andamento das Metas ainda cobra o mês
 * cheio de quem esteve fora». A regra de QUAIS tipos descontam já estava
 * gravada em `ausencias_tipos.abate_meta` desde 15/09; o que faltava era a
 * conta.
 */
export interface PresencaDoRecorte {
  /** Dias úteis do mês. É o mês cheio de UMA pessoa. */
  uteis: number;
  /**
   * Quantas pessoas o recorte tem.
   *
   * É o multiplicador da capacidade: uma equipe de 5 tem `5 × uteis` dias de
   * trabalho disponíveis no mês, e é disso que a ausência desconta.
   *
   * **Quem está cadastrado, e não quem vendeu.** A diferença aparece em quem
   * passou o mês inteiro de férias: pelo cadastro ela entra com 21 dias de
   * capacidade e 21 de ausência, e o líquido dela é zero — que é a resposta
   * certa. Contando só quem vendeu, ela sairia do denominador e os 21 dias de
   * ausência dela seriam descontados da capacidade dos colegas.
   *
   * Robô fica fora dos dois lados: automação não tira férias, e somá-la ao
   * denominador diluiria o desconto de quem tirou.
   */
  pessoas: number;
  /** A soma dos dias úteis perdidos por todas elas. Meio período vale 0,5. */
  diasAbatidos: number;
}

/**
 * A fração do mês que o recorte esteve presente: de 0 a 1.
 *
 * `null` quando não dá para saber — sem dias úteis, sem pessoa, ou sem
 * ninguém tendo perguntado a ausência ao banco. **`null` não é 1**: a tela
 * precisa distinguir «ninguém faltou» de «não perguntei», ou uma migration
 * não aplicada viraria, em silêncio, um mês de presença perfeita.
 *
 * Nunca passa de 1 nem desce de 0. Ausência marcada errada — dez dias num
 * mês de cinco pessoas que só teve três — não pode virar meta negativa.
 */
export function fatorDePresenca(p: PresencaDoRecorte): number | null {
  const capacidade = (Number(p.uteis) || 0) * (Number(p.pessoas) || 0);
  if (capacidade <= 0) return null;
  const presentes = capacidade - (Number(p.diasAbatidos) || 0);
  return Math.min(1, Math.max(0, presentes / capacidade));
}

/**
 * A meta reescrita pelo que o recorte teve de mês.
 *
 * Uma equipe de 5 com 21 dias úteis tem 105 dias de trabalho. Se dois
 * atestados comeram 10, ela teve 95 — 90,5% do mês —, e cobrar dela os 100%
 * da meta é cobrar por um trabalho que ninguém podia fazer.
 *
 * **A régua não muda.** O que muda é o alvo; qual das duas decide continua
 * sendo a configuração. E `fator: null` devolve a meta intacta, porque não
 * saber quanto alguém faltou não é motivo para mexer no número de ninguém.
 *
 * A quantidade é arredondada para cima: meia venda não existe, e arredondar
 * para baixo daria de presente a fração de venda que a proporcionalidade
 * acabou de criar.
 */
export function ajustarMetaPorPresenca(
  meta: MetaDoRecorte,
  fator: number | null,
): MetaDoRecorte {
  if (fator === null || fator >= 1) return meta;
  return {
    regua: meta.regua,
    quantidade: Math.ceil((Number(meta.quantidade) || 0) * fator),
    valor: (Number(meta.valor) || 0) * fator,
  };
}

/**
 * O rótulo do desconto, para a tela dizer por que o número mudou.
 *
 * Meta que desce sem explicação se lê como erro, e a primeira pessoa a notar
 * vai perguntar se o sistema está somando direito. `null` quando não houve
 * desconto — aí não há nada a explicar.
 */
export function rotuloDaPresenca(p: PresencaDoRecorte, fator: number | null): string | null {
  if (fator === null || fator >= 1) return null;
  const dias = Number(p.diasAbatidos) || 0;
  const plural = dias === 1 ? 'dia útil' : 'dias úteis';
  return `${formatarDias(dias)} ${plural} de ausência · meta em ${Math.round(fator * 100)}%`;
}

/** `4` e não `4,0`; `3,5` quando houve meio período. */
function formatarDias(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
