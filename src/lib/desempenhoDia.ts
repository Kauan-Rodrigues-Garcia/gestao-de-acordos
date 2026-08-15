/**
 * desempenhoDia.ts — as contas do painel Desempenho do Dia.
 *
 * Puro e sem React, como `fechamentoMes.ts` e `mesReferencia.ts`: são regras de
 * negócio que precisam ser as mesmas em toda tela que perguntar, e que devem
 * poder ser testadas sem montar componente.
 *
 * ## Duas fontes, e por quê
 *
 * O painel responde a duas perguntas com origens diferentes:
 *
 *   "quanto entrou?"          → analitico_recebimentos, o relatório do ERP
 *   "como está meu trabalho?" → acordos, a tabulação feita aqui dentro
 *
 * Elas não são versões do mesmo número. Em 14 dias medidos, o analítico da
 * BookPlay somou R$ 1.413.487 contra R$ 104.172 de acordos tabulados — 13,6×.
 * A maior parte do que o ERP recebe nunca vira acordo neste sistema, e isso é
 * esperado (é o mesmo fato que o Painel de Metas chama de "não tabulado").
 *
 * A consequência prática: a META é calibrada contra o analítico, então comparar
 * meta com soma de acordos daria uma barra vermelha todo dia, para sempre,
 * inclusive num dia excelente. Cada faixa do painel declara a sua fonte.
 */

import { listarDiasUteis } from '@/lib/diasUteis';
import { partesDoMes } from '@/lib/mesReferencia';

// ─── Barra de três estados ───────────────────────────────────────────────────

/**
 * O estado de um acordo, do ponto de vista do dia.
 *
 * `verificar_pendente` é um estado PRÓPRIO, e não uma variante de "não pago".
 * A taxa de eficiência antiga (`pagos ÷ agendados`) somava os dois: com 41% dos
 * acordos da BookPlay em verificação, ela mostrava 37% num dia em que nada tinha
 * dado errado. São problemas de pessoas diferentes — "o cliente não pagou" é do
 * operador, "ninguém conferiu ainda" é de quem verifica.
 */
export type EstadoDoDia = 'pago' | 'a_verificar' | 'nao_pago';

export interface BarraEstados {
  pago: number;
  aVerificar: number;
  naoPago: number;
  total: number;
  /**
   * `pagos ÷ (pagos + não pagos)` em pontos percentuais inteiros — a conversão
   * sobre o que JÁ foi conferido.
   *
   * `null` quando nada foi conferido no dia. Um dia com 40 acordos todos em
   * verificação tem conversão desconhecida, não 0% — e mostrar 0% ali seria a
   * mesma mentira que esta versão veio corrigir.
   */
  conversao: number | null;
}

const BARRA_VAZIA: BarraEstados = {
  pago: 0, aVerificar: 0, naoPago: 0, total: 0, conversao: null,
};

/** O estado que a barra usa, a partir do `status` cru do acordo. */
export function estadoDoAcordo(status: string | null | undefined): EstadoDoDia {
  const s = String(status ?? '').toLowerCase().trim();
  if (s === 'pago') return 'pago';
  if (s === 'verificar_pendente') return 'a_verificar';
  return 'nao_pago';
}

export function barraEstados(
  acordos: readonly { status: string | null | undefined }[],
): BarraEstados {
  if (!acordos.length) return BARRA_VAZIA;

  let pago = 0, aVerificar = 0, naoPago = 0;
  for (const a of acordos) {
    const e = estadoDoAcordo(a.status);
    if (e === 'pago') pago++;
    else if (e === 'a_verificar') aVerificar++;
    else naoPago++;
  }

  const conferidos = pago + naoPago;
  return {
    pago, aVerificar, naoPago,
    total: acordos.length,
    conversao: conferidos > 0 ? Math.round((pago / conferidos) * 100) : null,
  };
}

// ─── Meta do dia ─────────────────────────────────────────────────────────────

export interface MetaDoDia {
  /** A meta diária: meta do mês ÷ dias úteis do mês. */
  valor: number;
  /** Quanto do dia já foi feito, em pontos percentuais (pode passar de 100). */
  percentual: number;
  diasUteis: number;
}

/**
 * A meta de um dia, a partir da meta mensal.
 *
 * `null` quando não há meta gravada para o mês, e não zero: um operador sem meta
 * definida não está 0% de nada, e uma barra vermelha em cima disso seria
 * cobrança por um alvo que ninguém estabeleceu.
 *
 * A meta chega SEMPRE em bruto (é assim que está no banco — ver
 * `lib/unidadeValor.ts`). Converter para H.O. é responsabilidade de quem chama,
 * com `metaNaUnidade`, do mesmo jeito que o Painel de Metas faz.
 */
export function metaDoDia(params: {
  metaMensal: number | null | undefined;
  mes: string;
  feriados?: readonly string[];
  realizadoNoDia: number;
}): MetaDoDia | null {
  const { metaMensal, mes, feriados = [], realizadoNoDia } = params;

  if (metaMensal === null || metaMensal === undefined) return null;
  if (!Number.isFinite(metaMensal) || metaMensal <= 0) return null;

  const { ano, mes: mesNum } = partesDoMes(mes);
  const diasUteis = listarDiasUteis(ano, mesNum, [...feriados]).length;
  if (diasUteis === 0) return null;

  const valor = metaMensal / diasUteis;
  return {
    valor,
    percentual: valor > 0 ? Math.round((realizadoNoDia / valor) * 100) : 0,
    diasUteis,
  };
}

// ─── Variação contra ontem e contra a média ──────────────────────────────────

export interface Variacao {
  /** Variação percentual arredondada. `null` quando não há base de comparação. */
  pct: number | null;
  /** O valor com que se comparou — o painel mostra no tooltip. */
  base: number;
}

/**
 * A variação de `atual` sobre `base`, em pontos percentuais.
 *
 * `null` quando a base é zero: sair de R$ 0 para R$ 1.000 não é "aumento de
 * infinito por cento", é um dia que começou. Mostrar `+∞%` ou `+100%` ali seria
 * inventar uma comparação que não existe.
 */
export function variacao(atual: number, base: number): Variacao {
  if (!Number.isFinite(base) || base <= 0) return { pct: null, base: base || 0 };
  return { pct: Math.round(((atual - base) / base) * 100), base };
}

/**
 * A média dos N dias ÚTEIS anteriores a `dia`.
 *
 * Só dias úteis: incluir sábado e domingo — em que o ERP recebe quase nada —
 * puxaria a média para baixo e faria toda segunda-feira parecer excepcional.
 * Feriado também sai, pela mesma razão.
 *
 * Dias úteis sem nenhum recebimento CONTAM, com valor zero. Eles são dias em que
 * se trabalhou e não entrou nada; descartá-los faria a média medir "quanto entra
 * nos dias em que entra alguma coisa", que não é a pergunta.
 */
export function mediaDiasUteisAnteriores(params: {
  porDia: Readonly<Record<string, number>>;
  dia: string;
  quantidade?: number;
  feriados?: readonly string[];
}): number {
  const { porDia, dia, quantidade = 7, feriados = [] } = params;
  const uteis = diasUteisAnteriores(dia, quantidade, feriados);
  if (!uteis.length) return 0;

  const soma = uteis.reduce((s, d) => s + (porDia[d] ?? 0), 0);
  return soma / uteis.length;
}

/** Os N dias úteis imediatamente anteriores a `dia`, do mais antigo ao mais novo. */
export function diasUteisAnteriores(
  dia: string, quantidade: number, feriados: readonly string[] = [],
): string[] {
  const feriadoSet = new Set(feriados);
  const encontrados: string[] = [];

  const [y, m, d] = dia.split('-').map(Number);
  if (!y || !m || !d) return [];

  const cursor = new Date(y, m - 1, d);
  // Teto de 60 voltas: sem ele, uma entrada inválida ou uma lista de feriados
  // absurda daria laço infinito no navegador do usuário.
  for (let i = 0; i < 60 && encontrados.length < quantidade; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5 && !feriadoSet.has(iso)) encontrados.push(iso);
  }

  return encontrados.reverse();
}

// ─── Pix Automático (BookPlay) ───────────────────────────────────────────────

export interface ResumoPixDia {
  /** Aprovados no dia — os únicos que geram comissão. */
  aprovados: number;
  pendentes: number;
  /** Soma de `valor × pct_comissao` dos aprovados. */
  comissao: number;
  /** Soma do `valor` dos aprovados, para o subtítulo. */
  valorAprovado: number;
}

const PIX_VAZIO: ResumoPixDia = {
  aprovados: 0, pendentes: 0, comissao: 0, valorAprovado: 0,
};

/**
 * O Pix Automático de um dia.
 *
 * `pct_comissao` é FRAÇÃO no banco (0,2500 nas 414 linhas aprovadas medidas), e
 * não percentual. Multiplicar por 100 em algum ponto do caminho daria uma
 * comissão 100× maior — e como o número é plausível à primeira vista, passaria.
 *
 * Só `aprovado` entra na comissão: pendente e desaprovado têm `pct_comissao`
 * nulo justamente porque ainda não valem nada.
 */
export function resumoPixDia(
  linhas: readonly {
    status: string | null | undefined;
    valor: number | null | undefined;
    pct_comissao: number | null | undefined;
  }[],
): ResumoPixDia {
  if (!linhas.length) return PIX_VAZIO;

  let aprovados = 0, pendentes = 0, comissao = 0, valorAprovado = 0;
  for (const l of linhas) {
    const status = String(l.status ?? '').toLowerCase().trim();
    if (status === 'pendente') { pendentes++; continue; }
    if (status !== 'aprovado') continue;

    const valor = Number(l.valor) || 0;
    const pct = Number(l.pct_comissao) || 0;
    aprovados++;
    valorAprovado += valor;
    comissao += valor * pct;
  }

  return { aprovados, pendentes, comissao, valorAprovado };
}

// ─── Recebimento por tag ─────────────────────────────────────────────────────

export interface FatiaTag {
  tagId: string;
  nome: string;
  cor: string;
  valor: number;
  qtd: number;
  /** Fatia do total do dia, em pontos percentuais inteiros. */
  pct: number;
}

/**
 * As tags de um dia, da maior para a menor.
 *
 * Devolve lista vazia quando nenhum acordo do dia tem tag — e o painel omite o
 * bloco inteiro nesse caso. Nos dados medidos isso é ~99% dos dias: só 13 dos
 * 1.963 acordos da BookPlay em 30 dias têm tag. Um bloco que ocupa o maior
 * espaço do painel e fica vazio quase sempre é ruído com aparência de conteúdo.
 *
 * Acordo sem tag NÃO vira fatia "Sem tag": o denominador aqui é o total do dia,
 * então uma fatia de 99% chamada "Sem tag" empurraria as reais para invisíveis.
 */
export function fatiasPorTag(
  acordos: readonly { valor: number | null | undefined; tag_ids: string[] | null | undefined }[],
  tags: readonly { id: string; nome: string; cor: string }[],
): FatiaTag[] {
  const acumulado: Record<string, { valor: number; qtd: number }> = {};
  let totalDoDia = 0;

  for (const a of acordos) {
    const valor = Number(a.valor) || 0;
    totalDoDia += valor;
    for (const tid of a.tag_ids ?? []) {
      if (!acumulado[tid]) acumulado[tid] = { valor: 0, qtd: 0 };
      acumulado[tid].valor += valor;
      acumulado[tid].qtd++;
    }
  }

  return Object.entries(acumulado)
    .map(([tagId, d]) => {
      const tag = tags.find(t => t.id === tagId);
      return {
        tagId,
        nome: tag?.nome ?? 'Tag removida',
        cor: tag?.cor ?? '#6b7280',
        valor: d.valor,
        qtd: d.qtd,
        pct: totalDoDia > 0 ? Math.round((d.valor / totalDoDia) * 100) : 0,
      };
    })
    .sort((a, b) => b.valor - a.valor);
}
