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
