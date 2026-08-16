/**
 * diretoExtra.service.ts — quanto do recebido é vínculo DIRETO e quanto é EXTRA.
 *
 * ## A base é o ANALÍTICO, e quem responde é o próprio relatório
 *
 * O relatório traz a coluna "Tipo comissão": `Extra` para recebimento de NR
 * vinculado a outro operador, `Integral` para o do próprio. É a resposta
 * pronta, linha a linha, tabulada ou não. Desde a 20260813a ela é importada
 * para `analitico_recebimentos.tipo_comissao`.
 *
 * Ordem de decisão:
 *
 *   1. `tipo_comissao` do relatório — vale para toda linha
 *   2. `acordos.tipo_vinculo` via `acordo_id` — só para linha importada ANTES
 *      da 20260813a, que não tem a coluna preenchida
 *   3. nenhum dos dois → "sem vínculo definido"
 *
 * O passo 2 existe porque as 23 mil linhas já importadas ficaram com NULL: o
 * relatório de origem não é guardado, então só reimportar preenche. Enquanto
 * isso, a tabulação ainda salva o que der.
 *
 * Antes disso, o passo 2 era o ÚNICO caminho — e no setor Receptivo dava zero:
 * das 269 linhas do mês da equipe Matheus, nenhuma tinha acordo tabulado, e o
 * painel mostrava R$ 0,00 em direto e extra apesar de o relatório dizer
 * exatamente quais eram quais.
 *
 * `direto + extra + naoTabulado` é sempre o total do analítico no mesmo escopo.
 *
 * A RPC do dashboard devolve linhas já agregadas por dia/forma, sem esses
 * campos, então este recorte precisa ler a tabela.
 */

import { supabase } from '@/lib/supabase';
import { primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import { PP_HO_PERCENTUAL } from '@/lib/index';
import { classificarComissao } from '@/services/analitico/analiticoComum';
import type { EscopoAnalitico } from '@/services/analitico/escopoAnalitico';

/** UUID que nunca casa — `in` com lista vazia é erro 22P02 no Postgres. */
const UUID_IMPOSSIVEL = '00000000-0000-0000-0000-000000000000';

const PAGINA = 1000;

/**
 * Os dois lados de cada total.
 *
 * O bruto é o que entrou; o H.O. é o que fica na PaguePlay. O painel exibe um
 * ou outro conforme o alternador, e os dois precisam existir para que trocar de
 * unidade não dispare uma segunda ida ao banco.
 *
 * Na BookPlay o lado `…HO` é sempre 0 — `total_ho` não é preenchido lá.
 */
export interface TotaisDiretoExtra {
  direto: number;
  diretoHO: number;
  extra: number;
  extraHO: number;
  /** Recebido sem acordo tabulado — fecha a soma com o total do analítico. */
  naoTabulado: number;
  naoTabuladoHO: number;
  qtdDireto: number;
  qtdExtra: number;
  qtdNaoTabulado: number;
}

const ZERADO: TotaisDiretoExtra = {
  direto: 0, diretoHO: 0, extra: 0, extraHO: 0, naoTabulado: 0, naoTabuladoHO: 0,
  qtdDireto: 0, qtdExtra: 0, qtdNaoTabulado: 0,
};

interface LinhaAnalitico {
  valor_recebido: number | string | null;
  /** Parcela retida pela PaguePlay, gravada linha a linha pelo relatório. */
  total_ho: number | string | null;
  acordo_id: string | null;
  /** Coluna "Tipo comissão" do relatório (20260813a). */
  tipo_comissao: string | null;
}

/**
 * Traduz o escopo em UM filtro de coluna para a query.
 *
 * Espelha `linhaNoEscopo` de `escopoAnalitico.ts`, mas no servidor: setor que
 * soma pelo carimbo filtra por `setor_id`; os demais recortes filtram pelos
 * operadores que o escopo já resolveu. A regra não é reinventada aqui — ela
 * chega pronta no objeto `escopo`.
 *
 * `null` significa "sem recorte" (escopo de empresa).
 */
type FiltroEscopo =
  | null
  | { coluna: 'operador_id' | 'setor_id'; igual: string }
  | { coluna: 'operador_id'; dentro: string[] };

function filtroDoEscopo(escopo: EscopoAnalitico): FiltroEscopo {
  switch (escopo.tipo) {
    case 'empresa':
      return null;
    case 'operador':
      return { coluna: 'operador_id', igual: escopo.operadorId };
    case 'equipe':
      return montarFiltroDeOperadores(escopo.operadores);
    case 'setor':
      return escopo.porRelatorio
        ? { coluna: 'setor_id', igual: escopo.setorId }
        : montarFiltroDeOperadores(escopo.operadores);
  }
}

function montarFiltroDeOperadores(operadores: ReadonlySet<string>): FiltroEscopo {
  const ids = [...operadores];
  // Conjunto vazio precisa devolver ZERO linhas, não a empresa inteira.
  return ids.length
    ? { coluna: 'operador_id', dentro: ids }
    : { coluna: 'operador_id', igual: UUID_IMPOSSIVEL };
}

/**
 * Separa o recebimento do analítico por vínculo do acordo tabulado.
 *
 * `escopo` vem de `useEscopoAnalitico` — o mesmo que alimenta o total da tela.
 * Nunca monte o conjunto de operadores à mão para chamar isto.
 */
export interface PontoAgendadoDia {
  /** Dia do mês, 1..31. */
  dia: number;
  agendado: number;
}

/**
 * Valor AGENDADO por dia do mês, no mesmo escopo do recebimento.
 *
 * Sai de `acordos.vencimento` — é o que ainda NÃO entrou, então não teria como
 * estar num relatório de recebimento.
 *
 * Existe como busca própria, e não como reaproveitamento do `porDia` de
 * `useAnalytics`, porque aquele é escopado pelos filtros do DASHBOARD, e o
 * painel tem o seu próprio recorte (o alternador Eu / Minha equipe). Misturar
 * os dois punha, no mesmo gráfico, barras de um operador e uma linha do setor
 * inteiro.
 */
export async function buscarAgendadoPorDia(params: {
  empresaId: string;
  mes: string;
  escopo: EscopoAnalitico | null;
}): Promise<PontoAgendadoDia[]> {
  const { empresaId, mes, escopo } = params;
  if (!empresaId || !escopo) return [];

  const filtro = filtroDoEscopo(escopo);
  const porDia = new Map<number, number>();

  try {
    let offset = 0;
    for (;;) {
      let q = supabase
        .from('acordos')
        .select('vencimento, valor')
        .eq('empresa_id', empresaId)
        .gte('vencimento', primeiroDiaDoMes(mes))
        .lte('vencimento', ultimoDiaDoMes(mes))
        .order('id', { ascending: true });

      if (filtro && 'igual' in filtro)  q = q.eq(filtro.coluna, filtro.igual);
      if (filtro && 'dentro' in filtro) q = q.in(filtro.coluna, filtro.dentro);

      const { data, error } = await q.range(offset, offset + PAGINA - 1);
      if (error) {
        console.warn('[agendadoPorDia] erro na leitura:', error.message);
        break;
      }
      const lote = (data as { vencimento: string; valor: number | string | null }[]) ?? [];
      for (const a of lote) {
        const dia = Number(a.vencimento.slice(8, 10));
        if (!dia) continue;
        porDia.set(dia, (porDia.get(dia) ?? 0) + (Number(a.valor) || 0));
      }
      if (lote.length < PAGINA) break;
      offset += PAGINA;
    }
  } catch {
    return [];
  }

  return [...porDia.entries()]
    .map(([dia, agendado]) => ({ dia, agendado }))
    .sort((a, b) => a.dia - b.dia);
}

// ── Extra por TABULAÇÃO (PaguePlay) ─────────────────────────────────────────

/**
 * O extra da PaguePlay, somado dos acordos em vez do relatório.
 *
 * ## Por que existe
 *
 * O relatório da PaguePlay **não traz a coluna "Tipo comissão"** — em
 * agosto/2026 são 0 linhas preenchidas de 1.859. Sem ela, `buscarDiretoExtraDoMes`
 * cai no caminho reserva (`acordo_id` → `acordos.tipo_vinculo`), e ali o
 * resultado é ZERO: nenhuma das 792 linhas com acordo aponta para um acordo
 * extra — todas são diretas. O card mostrava R$ 0,00 com 29 extras tabulados no
 * mesmo mês.
 *
 * A causa é que o recebimento extra da PaguePlay não entra no relatório. Não é
 * dado faltando, é dado que nunca vem por ali. A única fonte é a tabulação.
 *
 * ## As quatro regras do recorte
 *
 *   • `tipo_vinculo = 'extra'`  — o que o operador marcou
 *   • `vencimento` dentro do mês — a MESMA régua do card "Recebimento direto"
 *     ao lado e do gráfico de agendado, para os dois números serem comparáveis
 *   • `status = 'pago'`          — o card se chama *recebimento*
 *   • escopo                     — o mesmo filtro do resto do painel
 *
 * ## Não fecha com o total, e isso é proposital
 *
 * `direto + extra + naoTabulado = total do analítico` continua valendo para
 * `TotaisDiretoExtra`. Este número vive FORA daquela soma: é dinheiro que o
 * relatório não conhece. Não entra no total recebido, não entra na meta, não
 * mexe na projeção nem no quartil — é acompanhamento. Somar seria contar
 * receita que a régua da meta nunca viu.
 *
 * ## Na BookPlay isto não roda
 *
 * Lá `tipo_comissao` vem preenchido e o caminho normal está certo. Quem decide
 * é o chamador (`usePainelMetas`), pelo tenant.
 */
export interface ExtraTabulado {
  /** Soma de `acordos.valor`. */
  bruto: number;
  /** A parcela que fica na PaguePlay — ver `PP_HO_PERCENTUAL`. */
  ho: number;
  qtd: number;
}

const EXTRA_ZERADO: ExtraTabulado = { bruto: 0, ho: 0, qtd: 0 };

export async function buscarExtraTabuladoDoMes(params: {
  empresaId: string;
  mes: string;
  escopo: EscopoAnalitico | null;
}): Promise<ExtraTabulado> {
  const { empresaId, mes, escopo } = params;
  if (!empresaId || !escopo) return EXTRA_ZERADO;

  const filtro = filtroDoEscopo(escopo);
  let bruto = 0;
  let qtd = 0;

  try {
    let offset = 0;
    for (;;) {
      let q = supabase
        .from('acordos')
        .select('valor')
        .eq('empresa_id', empresaId)
        .eq('tipo_vinculo', 'extra')
        .eq('status', 'pago')
        .gte('vencimento', primeiroDiaDoMes(mes))
        .lte('vencimento', ultimoDiaDoMes(mes))
        .order('id', { ascending: true });

      if (filtro && 'igual' in filtro)  q = q.eq(filtro.coluna, filtro.igual);
      if (filtro && 'dentro' in filtro) q = q.in(filtro.coluna, filtro.dentro);

      const { data, error } = await q.range(offset, offset + PAGINA - 1);
      if (error) {
        console.warn('[extraTabulado] erro na leitura dos acordos:', error.message);
        break;
      }
      const lote = (data as { valor: number | string | null }[]) ?? [];
      for (const a of lote) {
        bruto += Number(a.valor) || 0;
        qtd++;
      }
      if (lote.length < PAGINA) break;
      offset += PAGINA;
    }
  } catch {
    return EXTRA_ZERADO;
  }

  // `acordos` não guarda H.O. linha a linha como o analítico guarda: aqui ele é
  // derivado, com a mesma constante que `useAnalytics`, `AnalyticsPanel` e
  // `EvolucaoDiaria` usam. Régua nova aqui faria o mesmo dinheiro valer duas
  // coisas diferentes em duas telas.
  return { bruto, ho: bruto * PP_HO_PERCENTUAL, qtd };
}

export async function buscarDiretoExtraDoMes(params: {
  empresaId: string;
  mes: string;
  escopo: EscopoAnalitico | null;
}): Promise<TotaisDiretoExtra> {
  const { empresaId, mes, escopo } = params;
  if (!empresaId || !escopo) return ZERADO;

  const filtro = filtroDoEscopo(escopo);

  try {
    // 1. Linhas do analítico no mês, dentro do escopo.
    const linhas: LinhaAnalitico[] = [];
    let offset = 0;
    for (;;) {
      let q = supabase
        .from('analitico_recebimentos')
        .select('valor_recebido, total_ho, acordo_id, tipo_comissao')
        .eq('empresa_id', empresaId)
        .eq('mes_referencia', primeiroDiaDoMes(mes))
        .order('id', { ascending: true });

      if (filtro && 'igual' in filtro)  q = q.eq(filtro.coluna, filtro.igual);
      if (filtro && 'dentro' in filtro) q = q.in(filtro.coluna, filtro.dentro);

      const { data, error } = await q.range(offset, offset + PAGINA - 1);
      if (error) {
        console.warn('[diretoExtra] erro na leitura do analítico:', error.message);
        break;
      }
      const lote = (data as LinhaAnalitico[]) ?? [];
      linhas.push(...lote);
      if (lote.length < PAGINA) break;
      offset += PAGINA;
    }

    if (!linhas.length) return ZERADO;

    // 2. Vínculo dos acordos citados — FALLBACK para linha sem `tipo_comissao`
    //    (importada antes da 20260813a). Só busca os IDs que apareceram e só
    //    quando ainda faltar classificar alguma.
    const semTipo = linhas.filter(l => !l.tipo_comissao && l.acordo_id);
    const vinculo = new Map<string, 'direto' | 'extra'>();

    if (semTipo.length) {
      const idsAcordo = [...new Set(semTipo.map(l => l.acordo_id as string))];
      for (let i = 0; i < idsAcordo.length; i += PAGINA) {
        const fatia = idsAcordo.slice(i, i + PAGINA);
        const { data, error } = await supabase
          .from('acordos')
          .select('id, tipo_vinculo')
          .in('id', fatia);
        if (error) {
          console.warn('[diretoExtra] erro na leitura dos vínculos:', error.message);
          break;
        }
        for (const a of (data as { id: string; tipo_vinculo: 'direto' | 'extra' | null }[]) ?? []) {
          // `null` é 'direto': a coluna nasceu depois dos acordos antigos.
          vinculo.set(a.id, a.tipo_vinculo === 'extra' ? 'extra' : 'direto');
        }
      }
    }

    // 3. Classifica cada linha. O relatório manda primeiro: ele diz o vínculo
    //    de TODA linha, tabulada ou não. A tabulação é só o remendo para o que
    //    foi importado antes de a coluna existir.
    const totais: TotaisDiretoExtra = { ...ZERADO };
    for (const l of linhas) {
      const valor = Number(l.valor_recebido) || 0;
      const ho    = Number(l.total_ho) || 0;
      const tipo = classificarComissao(l.tipo_comissao)
        ?? (l.acordo_id ? vinculo.get(l.acordo_id) ?? null : null);

      if (tipo === 'extra') {
        totais.extra += valor; totais.extraHO += ho; totais.qtdExtra++;
      } else if (tipo === 'direto') {
        totais.direto += valor; totais.diretoHO += ho; totais.qtdDireto++;
      } else {
        // Nem o relatório nem a tabulação sabem: dizer "direto" inventaria número.
        totais.naoTabulado += valor; totais.naoTabuladoHO += ho; totais.qtdNaoTabulado++;
      }
    }
    return totais;
  } catch {
    return ZERADO;
  }
}
