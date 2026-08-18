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
 * Hoje serve `composicao_mes` e `composicao_mes_equipe` (migration 20260803c).
 */
import { supabase } from '@/lib/supabase';

export interface RespostaTabela<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface ConsultaSemTipo<T> extends PromiseLike<RespostaTabela<T>> {
  select(colunas: string): ConsultaSemTipo<T>;
  eq(coluna: string, valor: string): ConsultaSemTipo<T>;
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
  return (supabase.rpc as unknown as
    (n: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>
  )(nome, args);
}
