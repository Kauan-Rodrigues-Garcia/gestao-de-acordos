/**
 * As empresas da cobrança que a pessoa logada alcança — a lista única de
 * Usuários junta BookPlay e PaguePlay (Cleber, 03-04/10/2026).
 *
 * Quem decide o alcance é o banco (`fn_user_empresas_liberadas`, a mesma porta
 * do seletor de empresa): própria empresa, concessões da aba Multiempresa e o
 * super admin. Aqui só se fica com as da cobrança — Comercial e RH têm a
 * própria lista.
 */
import { supabase, type Empresa } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { produtoDaEmpresa } from '@/lib/produto';

export async function empresasDaCobrancaQueVejo(): Promise<Empresa[]> {
  const { data: liberadas, error } = await rpcSemTipo<unknown[]>('fn_user_empresas_liberadas', {});
  if (error) throw new Error(error.message);
  // SETOF uuid chega como lista de valores (ou de objetos de uma coluna só).
  const ids = (liberadas ?? [])
    .map(x => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x)[0] : null))
    .filter((x): x is string => typeof x === 'string');
  if (!ids.length) return [];
  const { data, error: e2 } = await supabase.from('empresas').select('*').in('id', ids);
  if (e2) throw new Error(e2.message);
  return ((data as Empresa[] | null) ?? []).filter(e => produtoDaEmpresa(e, e.slug) === 'cobranca');
}
