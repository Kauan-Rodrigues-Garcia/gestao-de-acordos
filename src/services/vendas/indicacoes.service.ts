/**
 * indicacoes.service.ts — o que a aba Indicações lê e grava.
 *
 * Leitura direta na tabela, escrita só por RPC — mesmo desenho de `vendas`.
 *
 * ## O ranking não é `SECURITY DEFINER`, e isso é a decisão
 *
 * `fn_indicacoes_ranking` roda com o alcance de quem chama. Então o operador vê
 * o próprio número, o líder vê o setor, e a função não precisa saber de nada
 * disso: a RLS de `indicacoes` responde. Fazê-la DEFINER obrigaria a repetir a
 * regra de escopo dentro dela — e duas cópias da mesma regra é como as telas
 * passam a discordar.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import type { ItemIndicacao } from '@/lib/indicacoes';
import { mensagemDoErro, pareceNaoInstalado } from './erroDoBanco';

const MIGRATION = '20260915200000_vendas_fase7_indicacoes.sql';

export interface Indicacao {
  id: string;
  empresa_id: string;
  operador_id: string;
  setor_id: string | null;
  equipe_id: string | null;
  instituicao: string;
  gestora: string | null;
  telefone: string | null;
  data_indicacao: string;
  observacao: string | null;
  criado_em: string;
  /** Join parcial — a tela mostra o nome de quem indicou. */
  perfis?: { id: string; nome: string } | null;
}

/** Uma linha do ranking. */
export interface LinhaRanking {
  operador_id: string;
  operador_nome: string;
  equipe_id: string | null;
  equipe_nome: string;
  quantidade: number;
  primeira: string;
  ultima: string;
}

export interface PontoDoDia {
  dia: string;
  quantidade: number;
}

/** Uma instituição recusada, com quem já a tinha indicado. */
export interface Repetida {
  instituicao: string;
  ja_indicada_por: string;
  em: string;
}

export interface Resultado<T = null> {
  ok: boolean;
  dado: T | null;
  erro: string | null;
}

function traduzir(mensagem: string): string {
  return mensagemDoErro(mensagem, 'A aba Indicações', MIGRATION);
}

function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/*
 * O join pede `perfis:operador_id`, e ele só existe porque `operador_id` tem
 * FOREIGN KEY. Sem ela o PostgREST responde «could not find a relationship» —
 * o erro que custou horas na Fase 2. Há teste que varre os serviços e exige FK
 * para cada coluna embutida; ver `vendas.sql.test.ts`.
 */
const COLUNAS = `
  id, empresa_id, operador_id, setor_id, equipe_id,
  instituicao, gestora, telefone, data_indicacao, observacao, criado_em,
  perfis:operador_id ( id, nome )
`;

export interface IndicacoesDoPeriodo {
  itens: Indicacao[];
  /** `false` enquanto a migration não for aplicada. A tela avisa em vez de gritar. */
  disponivel: boolean;
  erro: string | null;
}

export async function buscarIndicacoes(params: {
  empresaId: string;
  de: string;
  ate: string;
}): Promise<IndicacoesDoPeriodo> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('indicacoes')
    .select(COLUNAS)
    .eq('empresa_id', params.empresaId)
    .gte('data_indicacao', params.de)
    .lte('data_indicacao', params.ate)
    .order('data_indicacao', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    return { itens: [], disponivel: !pareceNaoInstalado(error.message), erro: error.message };
  }
  return { itens: (data ?? []) as unknown as Indicacao[], disponivel: true, erro: null };
}

export interface ResultadoLote {
  gravadas: number;
  repetidas: Repetida[];
}

/**
 * Grava várias de uma vez.
 *
 * Não aborta no primeiro repetido: quem volta com oito nomes e tem o terceiro
 * repetido quer os outros sete gravados, e a lista de quais bateram.
 */
export async function salvarLote(params: {
  empresaId: string;
  operadorId: string;
  itens: readonly ItemIndicacao[];
}): Promise<Resultado<ResultadoLote>> {
  const { data, error } = await rpcSemTipo<ResultadoLote[] | ResultadoLote>(
    'fn_indicacoes_salvar_lote',
    {
      p_empresa_id:  params.empresaId,
      p_operador_id: params.operadorId,
      p_itens:       params.itens,
    },
  );

  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  // RPC que devolve TABLE com uma linha chega como array ou como objeto,
  // conforme a versão do PostgREST. Aceitar os dois evita um erro que só
  // apareceria em produção.
  const l = Array.isArray(data) ? (data[0] ?? null) : data;
  return {
    ok: true,
    dado: {
      gravadas:  num(l?.gravadas),
      repetidas: Array.isArray(l?.repetidas) ? (l.repetidas as Repetida[]) : [],
    },
    erro: null,
  };
}

/**
 * Corrige uma indicação — inclusive QUEM indicou, que é o erro mais provável
 * quando o líder cadastra pelo operador (migration 20260915210000).
 *
 * Setor e equipe só mudam no banco quando o operador muda: corrigir o telefone
 * de uma indicação de março não a puxa para a equipe de hoje. Nome que colide
 * com outra instituição volta recusado com quem e quando.
 */
export async function corrigirIndicacao(params: {
  id: string;
  operadorId: string;
  instituicao: string;
  gestora: string | null;
  telefone: string | null;
  dataIndicacao: string;
  observacao: string | null;
}): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_indicacao_corrigir', {
    p_id:             params.id,
    p_operador_id:    params.operadorId,
    p_instituicao:    params.instituicao,
    p_gestora:        params.gestora,
    p_telefone:       params.telefone,
    p_data_indicacao: params.dataIndicacao,
    p_observacao:     params.observacao,
  });
  if (error) {
    return {
      ok: false,
      dado: null,
      erro: mensagemDoErro(error.message, 'A correção de indicação', '20260915210000_vendas_fase7_corrigir_indicacao.sql'),
    };
  }
  return { ok: true, dado: data ?? null, erro: null };
}

/** Quem pode aparecer como «quem indicou». Gente de verdade, e ainda na casa. */
export interface PessoaQueIndica {
  id: string;
  nome: string;
}

export async function buscarQuemPodeIndicar(empresaId: string): Promise<PessoaQueIndica[]> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('perfis')
    .select('id, nome, situacao, robo')
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true });

  if (error || !data) return [];
  // Robô não visita escola, e desligado não volta com oito nomes.
  return data
    .filter(p => p.situacao !== 'desligado' && p.robo !== true)
    .map(p => ({ id: String(p.id), nome: String(p.nome ?? '—') }));
}

export async function excluirIndicacao(id: string): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_indicacao_excluir', { p_id: id });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}

export async function buscarRanking(params: {
  empresaId: string; de: string; ate: string;
}): Promise<Resultado<LinhaRanking[]>> {
  const { data, error } = await rpcSemTipo<LinhaRanking[]>('fn_indicacoes_ranking', {
    p_empresa_id: params.empresaId, p_de: params.de, p_ate: params.ate,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  const linhas = (Array.isArray(data) ? data : []).map(l => ({
    ...l,
    quantidade: num(l.quantidade),
  }));
  return { ok: true, dado: linhas, erro: null };
}

export async function buscarPorDia(params: {
  empresaId: string; de: string; ate: string;
}): Promise<Resultado<PontoDoDia[]>> {
  const { data, error } = await rpcSemTipo<PontoDoDia[]>('fn_indicacoes_por_dia', {
    p_empresa_id: params.empresaId, p_de: params.de, p_ate: params.ate,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  const pontos = (Array.isArray(data) ? data : []).map(p => ({
    dia: String(p.dia),
    quantidade: num(p.quantidade),
  }));
  return { ok: true, dado: pontos, erro: null };
}
