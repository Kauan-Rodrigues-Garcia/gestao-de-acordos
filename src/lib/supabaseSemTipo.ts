/**
 * supabaseSemTipo.ts — acesso a tabelas que ainda não estão em `database.types.ts`.
 *
 * `database.types.ts` é GERADO a partir do banco. Uma migration recém-escrita
 * cria tabelas e funções que o arquivo ainda não conhece, e o TypeScript recusa
 * o nome como se fosse erro de digitação.
 *
 * Regenerar os tipos exige a CLI do Supabase apontando para o projeto — coisa
 * que nem sempre está à mão na hora de subir uma correção. Este módulo é a
 * ponte, e de propósito ele é ESTREITO: expõe só `select` + `eq` e a chamada de
 * RPC, o suficiente para leitura simples. Nada de insert, update ou delete sem
 * tipo — aí o risco de gravar coisa errada em silêncio passa a valer o
 * incômodo de regenerar.
 *
 * Quando os tipos forem regenerados, os usos daqui podem voltar ao
 * `supabase.from(...)` normal.
 *
 * Hoje serve `composicao_mes` e `composicao_mes_equipe` (migration 20260803c) e
 * as tabelas do relatório mestre 59 (migration 20260904100000).
 */
import { supabase } from '@/lib/supabase';

export interface RespostaTabela<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface ConsultaSemTipo<T> extends PromiseLike<RespostaTabela<T>> {
  select(colunas: string): ConsultaSemTipo<T>;
  eq(coluna: string, valor: string): ConsultaSemTipo<T>;
  /* `order` e `limit` entraram com o relatório 59 (migration 20260904100000):
     lista de cargas e histórico só fazem sentido do mais recente para o mais
     antigo, e sem teto uma tabela de eventos cresce sem fim. Continuam sendo
     leitura — a fronteira do módulo não mudou. */
  order(coluna: string, opcoes?: { ascending?: boolean }): ConsultaSemTipo<T>;
  limit(n: number): ConsultaSemTipo<T>;
  /* `in` entrou com as assinaturas do NR duplicado (migration 20260909110000):
     as aprovações de uma fila de pedidos são lidas de uma vez, e uma consulta
     por pedido seria uma ida ao servidor por cartão desenhado. Continua sendo
     leitura. */
  in(coluna: string, valores: readonly string[]): ConsultaSemTipo<T>;
  /* `gte`/`lte` entraram com a aba Vendas (migration 20260915100000): a tela
     lê um intervalo de dias, e sem eles a alternativa seria trazer a tabela
     inteira e filtrar no navegador. Continuam sendo leitura. */
  gte(coluna: string, valor: string): ConsultaSemTipo<T>;
  lte(coluna: string, valor: string): ConsultaSemTipo<T>;
  /* `or` entrou junto, pela fila do líder: «aberta OU confirmada sem
     assinatura» é uma pergunta só, e parti-la em duas consultas faria a tela
     juntar e reordenar o que o banco já sabe ordenar. */
  or(filtro: string): ConsultaSemTipo<T>;
  /* `range` entrou com o raio-x do relatório de vendas (21/09/2026): o
     PostgREST corta a resposta em 1.000 linhas sem avisar, e o relatório de
     agosto tem 6.934. Paginar é o único jeito de ler o mês inteiro. Continua
     sendo leitura. */
  range(de: number, ate: number): ConsultaSemTipo<T>;
}

/** Consulta de leitura numa tabela que os tipos gerados ainda não conhecem. */
export function tabelaSemTipo<T>(nome: string): ConsultaSemTipo<T> {
  return (supabase.from as unknown as (n: string) => ConsultaSemTipo<T>)(nome);
}

/**
 * RPC que os tipos gerados ainda não conhecem.
 *
 * `T` descreve o que a função devolve — o tipo é uma AFIRMAÇÃO de quem chama,
 * não uma verificação. Quem usar deve tratar `data` como veio do banco: campo
 * ausente é `undefined`, não erro de compilação. Sem `T` o retorno é `never` e
 * só o `error` interessa, que é o caso das RPCs que não devolvem nada.
 */
export function rpcSemTipo<T = never>(
  nome: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  /*
   * `Promise.resolve` em volta, e não o retorno cru.
   *
   * `supabase.rpc()` devolve o CONSTRUTOR do PostgREST, que é *thenable* —
   * tem `.then`, não tem `.catch` nem `.finally`. A assinatura acima sempre
   * disse `Promise`, e o TypeScript acreditou: chamar `.catch` compilava e
   * estourava em produção com «.catch is not a function».
   *
   * Aconteceu em 10/09/2026, e derrubou as duas abas do Painel Diretoria de
   * uma vez. Consertar só o ponto da chamada deixaria a armadilha armada
   * para o próximo; aqui a função passa a entregar o que a assinatura
   * promete, e o problema deixa de existir.
   */
  return Promise.resolve((supabase.rpc as unknown as
    (n: string, a: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { message: string } | null }>
  )(nome, args));
}
