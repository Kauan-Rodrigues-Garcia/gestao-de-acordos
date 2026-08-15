/**
 * desempenhoDia.service.ts — as leituras do painel Desempenho do Dia.
 *
 * Quatro origens, cada uma respondendo ao que só ela sabe:
 *
 *   analitico_recebimentos   quanto o ERP recebeu     (faixa "o dia em dinheiro")
 *   acordos                  o que foi tabulado aqui  (faixa "a minha operação")
 *   metas + metas_config_mes o alvo e os dias úteis
 *   pix_automatico_acordos   o Pix do dia             (BookPlay)
 *
 * As três primeiras existem nas duas operações. A quarta é só BookPlay, e a
 * função devolve lista vazia na PaguePlay em vez de consultar uma tabela que
 * naquele tenant nunca tem linha.
 *
 * ## O recorte
 *
 * O painel soma "as pessoas que eu enxergo", e não "o setor pelo carimbo do
 * relatório". A diferença aparece só na BookPlay, onde o ERP carimba o setor na
 * importação: a aba Analítico pode somar pelo carimbo, e aqui a soma é pelos
 * operadores.
 *
 * É deliberado. O painel é uma espiada rápida em «como vai o meu dia / o dia da
 * minha gente», e a resposta útil é a das pessoas. Reproduzir a escada de
 * carimbo, setor alternativo e origens excluídas exigiria as mesmas seis
 * consultas do Painel de Metas para um painel que abre e fecha em segundos — e
 * duplicaria uma regra que já vive em `escopoAnalitico`.
 */

import { supabase } from '@/lib/supabase';
import {
  linhaNoEscopo, ESCOPO_EMPRESA, type EscopoAnalitico,
} from '@/services/analitico/escopoAnalitico';

/** Uma linha do analítico, com o mínimo que o painel usa. */
export interface LinhaAnaliticoDia {
  data_pagamento: string;
  valor_recebido: number;
  total_ho: number | null;
  operador_id: string | null;
  setor_id?: string | null;
}

export interface AcordoDoDia {
  status: string | null;
  valor: number | null;
  tipo_vinculo: string | null;
  tag_ids: string[] | null;
}

export interface LinhaPixDia {
  status: string | null;
  valor: number | null;
  pct_comissao: number | null;
}

const PAGINA = 1000;
/**
 * Teto de páginas. A janela do painel são ~15 dias; a BookPlay faz ~7.700 linhas
 * em 30 dias, então 8 páginas cobrem com folga. O teto existe para um filtro
 * quebrado não virar download infinito no navegador de quem abriu o painel.
 */
const MAX_PAGINAS = 12;

/**
 * Lê o analítico de um intervalo, paginando.
 *
 * A paginação é obrigatória: o PostgREST devolve 1.000 linhas por vez, e uma
 * janela de 15 dias da BookPlay inteira passa disso. Sem ela o painel mostraria
 * um número truncado — plausível, e errado.
 */
export async function buscarAnaliticoPeriodo(params: {
  empresaId: string;
  de: string;
  ate: string;
  /** Quando o escopo é uma pessoa só, o filtro vai ao banco e a página encolhe. */
  operadorId?: string | null;
}): Promise<{ linhas: LinhaAnaliticoDia[]; erro: string | null }> {
  const { empresaId, de, ate, operadorId } = params;
  const linhas: LinhaAnaliticoDia[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let q = supabase
      .from('analitico_recebimentos')
      .select('data_pagamento, valor_recebido, total_ho, operador_id, setor_id')
      .eq('empresa_id', empresaId)
      .gte('data_pagamento', de)
      .lte('data_pagamento', ate)
      // Ordem total pela PK: sem ela as páginas se sobrepõem e o total muda a
      // cada abertura do painel. Mesmo contrato de `paginarParalelo`.
      .order('id', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

    if (operadorId) q = q.eq('operador_id', operadorId);

    const { data, error } = await q;
    if (error) return { linhas: [], erro: error.message };

    const lote = (data as LinhaAnaliticoDia[] | null) ?? [];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  return { linhas, erro: null };
}

/** Soma por dia, aplicando o escopo em memória. */
export function somarPorDia(
  linhas: readonly LinhaAnaliticoDia[],
  escopo: EscopoAnalitico,
): { bruto: Record<string, number>; ho: Record<string, number> } {
  const bruto: Record<string, number> = {};
  const ho: Record<string, number> = {};

  for (const l of linhas) {
    if (!linhaNoEscopo(l, escopo)) continue;
    const dia = l.data_pagamento;
    bruto[dia] = (bruto[dia] ?? 0) + (Number(l.valor_recebido) || 0);
    ho[dia] = (ho[dia] ?? 0) + (Number(l.total_ho) || 0);
  }

  return { bruto, ho };
}

/**
 * Os acordos com vencimento no dia.
 *
 * O recorte é por VENCIMENTO, e não pela data em que alguém marcou como pago:
 * tabular hoje um acordo que venceu ontem tem de contar ontem, senão o dia de
 * ontem muda de número toda vez que alguém abre o sistema.
 */
export async function buscarAcordosDoDia(params: {
  empresaId: string;
  dia: string;
  operadorId?: string | null;
  setorId?: string | null;
}): Promise<{ acordos: AcordoDoDia[]; erro: string | null }> {
  const { empresaId, dia, operadorId, setorId } = params;

  let q = supabase
    .from('acordos')
    .select('status, valor, tipo_vinculo, tag_ids')
    .eq('empresa_id', empresaId)
    .eq('vencimento', dia);

  if (operadorId)   q = q.eq('operador_id', operadorId);
  else if (setorId) q = q.eq('setor_id', setorId);

  const { data, error } = await q;
  if (error) return { acordos: [], erro: error.message };
  return { acordos: (data as AcordoDoDia[] | null) ?? [], erro: null };
}

/** Quantos acordos foram CRIADOS no dia — o outro lado do trabalho. */
export async function contarFormalizadosDoDia(params: {
  empresaId: string;
  dia: string;
  operadorId?: string | null;
  setorId?: string | null;
}): Promise<number> {
  const { empresaId, dia, operadorId, setorId } = params;
  const amanha = diaSeguinte(dia);

  let q = supabase
    .from('acordos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .gte('criado_em', `${dia}T00:00:00`)
    .lt('criado_em', `${amanha}T00:00:00`);

  if (operadorId)   q = q.eq('operador_id', operadorId);
  else if (setorId) q = q.eq('setor_id', setorId);

  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

/**
 * O Pix Automático do dia. BookPlay apenas.
 *
 * `criado_em` e não `avaliado_em`: o Pix pertence ao dia em que ENTROU. Um Pix
 * de ontem aprovado hoje continua sendo produção de ontem, e mudá-lo de dia
 * reescreveria um número que a equipe já leu.
 */
export async function buscarPixDoDia(params: {
  empresaId: string;
  dia: string;
  isPaguePlay: boolean;
  operadorId?: string | null;
  setorId?: string | null;
}): Promise<LinhaPixDia[]> {
  const { empresaId, dia, isPaguePlay, operadorId, setorId } = params;
  if (isPaguePlay) return [];

  const amanha = diaSeguinte(dia);
  let q = supabase
    .from('pix_automatico_acordos')
    .select('status, valor, pct_comissao')
    .eq('empresa_id', empresaId)
    .gte('criado_em', `${dia}T00:00:00`)
    .lt('criado_em', `${amanha}T00:00:00`);

  if (operadorId)   q = q.eq('operador_id', operadorId);
  else if (setorId) q = q.eq('setor_id', setorId);

  const { data, error } = await q;
  if (error) return [];
  return (data as LinhaPixDia[] | null) ?? [];
}

/**
 * A meta mensal do escopo, sempre em BRUTO (é como está no banco).
 *
 * Mesma precedência do Painel de Metas, para os dois não discordarem:
 *
 *   pessoa escolhida ....... a meta dela
 *   setor com meta própria . a meta do setor
 *   nem uma nem outra ...... a soma das metas individuais de quem está no escopo
 *
 * `null` quando não há meta nenhuma — e `null` é diferente de zero: sem alvo
 * definido o painel não desenha barra, em vez de cobrar por um número que
 * ninguém estabeleceu.
 */
export async function buscarMetaDoEscopo(params: {
  empresaId: string;
  mes: number;
  ano: number;
  operadorId?: string | null;
  setorId?: string | null;
  operadoresDoEscopo?: readonly string[];
}): Promise<number | null> {
  const { empresaId, mes, ano, operadorId, setorId, operadoresDoEscopo } = params;

  const umaMeta = async (tipo: string, referenciaId: string): Promise<number | null> => {
    const { data } = await supabase
      .from('metas')
      .select('meta_valor')
      .eq('empresa_id', empresaId).eq('tipo', tipo)
      .eq('referencia_id', referenciaId)
      .eq('mes', mes).eq('ano', ano)
      .maybeSingle();
    const v = Number((data as { meta_valor: number } | null)?.meta_valor) || 0;
    return v > 0 ? v : null;
  };

  if (operadorId) return umaMeta('operador', operadorId);

  if (setorId) {
    const doSetor = await umaMeta('setor', setorId);
    if (doSetor !== null) return doSetor;
  }

  const ids = operadoresDoEscopo ?? [];
  if (!ids.length) return null;

  const { data } = await supabase
    .from('metas')
    .select('meta_valor')
    .eq('empresa_id', empresaId).eq('tipo', 'operador')
    .in('referencia_id', [...ids])
    .eq('mes', mes).eq('ano', ano);

  const soma = ((data as { meta_valor: number }[] | null) ?? [])
    .reduce((s, m) => s + (Number(m.meta_valor) || 0), 0);
  return soma > 0 ? soma : null;
}

/**
 * O escopo do analítico a partir de quem está olhando.
 *
 * `equipe` é o tipo usado para «as pessoas que eu enxergo» — ele casa a linha
 * pelo conjunto de operadores, que é exatamente a pergunta. Ver o cabeçalho
 * deste arquivo para por que o painel não usa o carimbo de setor.
 */
export function escopoDoPainel(params: {
  operadorSelecionado?: string | null;
  vejoTodos: boolean;
  meuId: string;
  operadoresVisiveis: readonly string[];
}): EscopoAnalitico {
  const { operadorSelecionado, vejoTodos, meuId, operadoresVisiveis } = params;

  if (operadorSelecionado) {
    return { tipo: 'operador', operadorId: operadorSelecionado };
  }
  if (vejoTodos) return ESCOPO_EMPRESA;
  if (operadoresVisiveis.length > 0) {
    return { tipo: 'equipe', operadores: new Set(operadoresVisiveis) };
  }
  return { tipo: 'operador', operadorId: meuId };
}

/** 'yyyy-MM-dd' do dia seguinte. */
export function diaSeguinte(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

/** 'yyyy-MM-dd' de N dias antes. */
export function diasAntes(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  const antes = new Date(y, m - 1, d - n);
  return `${antes.getFullYear()}-${String(antes.getMonth() + 1).padStart(2, '0')}-${String(antes.getDate()).padStart(2, '0')}`;
}
