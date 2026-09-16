/**
 * vendasDashboard.ts — as contas que só o Dashboard do Comercial faz.
 *
 * ## Por que um arquivo novo, e não mais funções em `vendasPlacar`
 *
 * `vendasPlacar.ts` responde «quem, onde, como e em que dia» — é o cadastro do
 * mês, e três telas o consomem. O que mora aqui é outra pergunta: **como o mês
 * está indo**, que é a única pergunta do Dashboard. Ticket médio, aproveitamento,
 * acumulado e variação contra o mês passado não aparecem no Painel Líder nem na
 * aba Vendas, e não deviam: lá a pergunta é «o que eu faço agora».
 *
 * Essa separação é a resposta ao defeito que motivou a reescrita de 15/09/2026 —
 * Dashboard, Painel Líder e Vendas mostravam os mesmos quatro números.
 *
 * ## Nada aqui desenha, e nada aqui vai ao banco
 *
 * Funções puras sobre a lista que a RLS já recortou, como todo o resto do
 * Comercial. É o que deixa cada uma destas contas ter teste sem montar tela.
 */
import type { GavetaVenda, ResumoVendas } from '@/lib/vendas';
import { GAVETA_LABELS } from '@/lib/vendas';
import type { PontoDoDia } from '@/lib/vendasPlacar';
import { diasNoMes } from '@/lib/mesReferencia';

/* ── O mês, dia a dia, com o acumulado ────────────────────────────────────── */

export interface PontoDoMes {
  /** Dia do mês, 1..31. */
  dia: number;
  /** `'01'` — o rótulo do eixo, com zero à esquerda para ordenar como texto. */
  rotulo: string;
  quantidade: number;
  valor: number;
  /** A soma corrida do mês até este dia, inclusive. */
  acumulado: number;
}

/**
 * A série do mês inteiro, com os dias vazios preenchidos e o acumulado pronto.
 *
 * `serieDiaria` (de `vendasPlacar`) devolve **só os dias que tiveram venda**, e
 * de propósito: quem desenha é que decide se o fim de semana vira buraco ou
 * vira base. O Dashboard decide que vira base — um gráfico de ritmo com os dias
 * faltando comprime o mês e faz três dias seguidos de venda parecerem
 * consecutivos quando havia um fim de semana no meio.
 *
 * O acumulado é calculado aqui, e não pelo gráfico, porque ele tem de existir
 * também para os dias sem venda: é uma linha que anda reto, nunca uma que some.
 */
export function serieDoMes(pontos: readonly PontoDoDia[], mes: string): PontoDoMes[] {
  const porDia = new Map<number, { quantidade: number; valor: number }>();
  for (const p of pontos) {
    const dia = Number(String(p.dia).slice(8, 10));
    if (!Number.isFinite(dia) || dia < 1) continue;
    const atual = porDia.get(dia);
    if (atual) { atual.quantidade += p.quantidade; atual.valor += p.valor; }
    else porDia.set(dia, { quantidade: p.quantidade, valor: p.valor });
  }

  let acumulado = 0;
  return Array.from({ length: diasNoMes(mes) }, (_, i) => {
    const dia = i + 1;
    const doDia = porDia.get(dia);
    acumulado += doDia?.valor ?? 0;
    return {
      dia,
      rotulo: String(dia).padStart(2, '0'),
      quantidade: doDia?.quantidade ?? 0,
      valor: doDia?.valor ?? 0,
      acumulado,
    };
  });
}

/* ── O tamanho da venda ───────────────────────────────────────────────────── */

/**
 * Quanto vale a venda média do recorte.
 *
 * `null` sem venda nenhuma — e não zero. «Ticket médio R$ 0,00» se lê como
 * vendas de graça; «—» se lê como não houve venda, que é o que houve.
 *
 * É o número que separa duas situações que a quantidade sozinha confunde: um
 * mês com 10 vendas de R$ 50 mil e um com 100 de R$ 5 mil fecham igual no
 * dinheiro e são operações diferentes.
 */
export function ticketMedio(resumo: Pick<ResumoVendas, 'quantidade' | 'valor'>): number | null {
  return resumo.quantidade > 0 ? resumo.valor / resumo.quantidade : null;
}

/**
 * De tudo que chegou a ser confirmado, quanto ficou de pé.
 *
 * Mesmo denominador de `pctDevolucao` e `pctCancelamento` — o que foi
 * confirmado alguma vez, sem as abertas —, porque as três respondem a mesma
 * pergunta por ângulos diferentes e usar bases distintas faria a soma delas não
 * dar 100%.
 *
 * Note que **não** é `1 − devolução − cancelamento`: a gaveta «pendente de
 * assinatura» também está no denominador, e ela não é perda nem aproveitamento
 * — é trabalho em aberto do líder.
 */
export function aproveitamento(resumo: ResumoVendas): number | null {
  const g = resumo.porGaveta;
  const base = g.na_meta + g.pendente_assinatura + g.devolvida + g.cancelada;
  return base > 0 ? g.na_meta / base : null;
}

/**
 * Quanto do que foi vendido já entrou de verdade.
 *
 * `valor_total` é o que a venda vale e conta na meta; `valor_recebido` é o que
 * o cliente pagou até agora. Medido em 15/09/2026, o setor tinha R$ 740.166,80
 * na régua e R$ 46.305,90 recebidos — 6%. Os dois números estão certos e dizem
 * coisas diferentes, e é justamente por isso que esta fração existe: sem ela,
 * alguém compara os dois cards e acha que um deles está quebrado.
 *
 * `null` sem faturamento — dividir por zero não é 0%, é «não houve mês».
 */
export function coberturaDeRecebimento(
  resumo: Pick<ResumoVendas, 'valor' | 'recebido'>,
): number | null {
  return resumo.valor > 0 ? resumo.recebido / resumo.valor : null;
}

/* ── A régua, como fatia ──────────────────────────────────────────────────── */

export interface FatiaDaRegua {
  gaveta: GavetaVenda;
  rotulo: string;
  quantidade: number;
  valor: number;
  /** Participação no VALOR do mês inteiro, em %, com uma casa. */
  perc: number;
  cor: string;
}

/**
 * A cor de cada gaveta no anel.
 *
 * Não são os tokens de `GAVETA_COLORS` — aqueles são classes do Tailwind, e o
 * recharts pinta atributo SVG, que não entende `bg-success/15`. São hex, pela
 * mesma razão que `BREAKDOWN_COLORS` é hex no painel da cobrança.
 *
 * Devolvida e cancelada são tons diferentes de vermelho de propósito: no resto
 * da plataforma as duas compartilham `destructive`, mas num anel duas fatias da
 * mesma cor viram uma fatia só, e elas são conversas diferentes — devolvida
 * voltou depois de entrar, cancelada caiu antes.
 */
export const COR_DA_GAVETA: Record<GavetaVenda, string> = {
  na_meta:             '#22c55e',
  pendente_assinatura: '#f59e0b',
  aberta:              '#94a3b8',
  devolvida:           '#f43f5e',
  cancelada:           '#ef4444',
};

/**
 * As cinco gavetas como fatias de um anel, na ordem da régua.
 *
 * Gaveta vazia **não entra**: uma legenda com «Cancelada 0 · R$ 0,00» repetida
 * todo mês treina o olho a pular a legenda inteira, inclusive no mês em que ela
 * tem número.
 *
 * A ordem é a de `GAVETAS_EM_ORDEM` e não a do tamanho: o anel conta uma
 * história que vai do que contou até o que se perdeu, e reordenar por valor
 * embaralharia essa leitura a cada mês.
 */
export function fatiasDaRegua(
  resumo: Pick<ResumoVendas, 'porGaveta' | 'valorPorGaveta'>,
  ordem: readonly GavetaVenda[],
): FatiaDaRegua[] {
  const total = ordem.reduce((s, g) => s + (resumo.valorPorGaveta[g] ?? 0), 0);
  return ordem
    .filter(g => (resumo.porGaveta[g] ?? 0) > 0)
    .map(g => {
      const valor = resumo.valorPorGaveta[g] ?? 0;
      return {
        gaveta: g,
        rotulo: GAVETA_LABELS[g],
        quantidade: resumo.porGaveta[g] ?? 0,
        valor,
        perc: total > 0 ? Math.round((valor / total) * 1000) / 10 : 0,
        cor: COR_DA_GAVETA[g],
      };
    });
}

/* ── Contra o mês passado ─────────────────────────────────────────────────── */

export interface Variacao {
  /** A diferença relativa: `+0.18` é 18% acima do mês anterior. */
  fracao: number;
  direcao: 'up' | 'down' | 'neutral';
  /** `'+18%'`, `'−7%'` ou `'estável'`, pronto para a tela. */
  rotulo: string;
}

/**
 * Quanto este número mudou em relação ao mesmo número do mês passado.
 *
 * **`null` quando não há base de comparação**, e isso inclui o mês anterior
 * valer zero. É a diferença que importa aqui: o Comercial só tem setembro
 * carregado, e agosto ainda não foi importado (`Prospeccao_202608.csv`). Um
 * «+100%» contra um mês que ninguém importou seria uma mentira com cara de
 * notícia boa — e a seta ficaria verde para sempre.
 *
 * O limiar de 0,5% existe porque variação minúscula não é variação: uma seta
 * para cima por causa de R$ 40 num mês de R$ 740 mil ensina a ignorar a seta.
 */
export function variacao(atual: number, anterior: number): Variacao | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  if (anterior <= 0) return null;

  const fracao = (atual - anterior) / anterior;
  if (Math.abs(fracao) < 0.005) {
    return { fracao, direcao: 'neutral', rotulo: 'estável' };
  }
  const pct = Math.round(Math.abs(fracao) * 100);
  return {
    fracao,
    direcao: fracao > 0 ? 'up' : 'down',
    // Menos-matemático (U+2212), e não hífen: é o mesmo sinal que o card de
    // «Diferença para projeção» da cobrança usa, e os dois ficam lado a lado.
    rotulo: `${fracao > 0 ? '+' : '−'}${pct}%`,
  };
}
