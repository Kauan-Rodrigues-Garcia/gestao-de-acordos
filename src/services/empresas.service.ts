/**
 * src/services/empresas.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com empresas.
 */
import { supabase, Empresa } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

/**
 * As empresas que a pessoa logada realmente ALCANÇA.
 *
 * Diferente de `fetchEmpresas`, que lista todas as ativas — a policy de
 * `empresas` é `ativo = true`, então qualquer pessoa autenticada lê as quatro
 * linhas. Isso servia ao seletor enquanto «poder trocar» significava «pode
 * trocar para a outra», com duas empresas no sistema.
 *
 * Com quatro, o seletor passaria a oferecer Comercial e RH a quem só tem
 * cobrança liberada: a troca aconteceria, a tela abriria, e todos os dados
 * viriam vazios — porque a RLS recusa em silêncio. Oferecer uma porta que leva
 * a um cômodo vazio é pior do que não oferecer porta.
 *
 * Quem responde é o banco (`fn_user_empresas_liberadas`), e não uma cópia da
 * regra aqui: é a mesma função que a RLS usa.
 */
export async function fetchEmpresasLiberadas(): Promise<Empresa[]> {
  // `rpcSemTipo` porque `database.types.ts` é gerado do banco e ainda não
  // conhece a função. Mesmo padrão de `acessoMultiempresa.service`.
  const { data: ids, error: erroIds } =
    await rpcSemTipo<{ fn_user_empresas_liberadas: string }[] | string[]>('fn_user_empresas_liberadas', {});

  // Migration ainda não aplicada: cai na lista completa, que é o comportamento
  // de antes. A RLS continua barrando o dado — o seletor é conforto.
  if (erroIds || !ids) return fetchEmpresas();

  const permitidos = (ids as ({ fn_user_empresas_liberadas: string } | string)[])
    .map(v => (typeof v === 'string' ? v : v.fn_user_empresas_liberadas));
  if (permitidos.length === 0) return [];

  const { data, error } = await supabase
    .from('empresas').select('*').in('id', permitidos).eq('ativo', true).order('nome');

  if (error) {
    console.warn('[empresas.service] fetchEmpresasLiberadas error:', error.message);
    return [];
  }
  return (data as Empresa[]) || [];
}

/** Lista todas as empresas ativas */
export async function fetchEmpresas(): Promise<Empresa[]> {
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    console.warn('[empresas.service] fetchEmpresas error:', error.message);
    return [];
  }
  return (data as Empresa[]) || [];
}

/**
 * Como pedir a empresa a partir de `perfis` — sempre com o nome da chave.
 *
 * ## Por que o nome da chave é obrigatório
 *
 * O PostgREST resolve `empresas(...)` procurando UM caminho entre as duas
 * tabelas. Existem dois:
 *
 *   1. `perfis.empresa_id → empresas.id` — o que se quer aqui;
 *   2. `uso_telas` como tabela de JUNÇÃO. A chave primária dela é
 *      `(empresa_id, usuario_id, dia, tela)`, e um PK que contém as duas
 *      chaves estrangeiras é exatamente o formato que o PostgREST lê como
 *      relação muitos-para-muitos.
 *
 * Com dois caminhos, ele recusa a consulta INTEIRA com `PGRST201` em vez de
 * escolher — e como este `select` é o do login, o efeito foi o app inteiro
 * parar de carregar (perfil nulo, menu vazio, tela em branco).
 *
 * `uso_telas` não é junção nenhuma: é fato de uso por dia. Mas o formato dela
 * é indistinguível de uma, e o cache de schema do PostgREST só recalculou as
 * relações no primeiro DDL depois que ela nasceu — o que fez o defeito aparecer
 * um dia inteiro depois da migration que o criou.
 *
 * ⚠️ Toda consulta que trouxer `empresas` a partir de `perfis` precisa deste
 * prefixo. São três hoje: aqui, `useAuth.fetchPerfil` e `AdminUsuarios`.
 */
export const EMBED_EMPRESA = 'empresas!perfis_empresa_id_fkey';

/** Retorna a empresa do usuário logado (via join no perfil) */
export async function fetchEmpresaAtual(): Promise<Empresa | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('perfis')
    .select(`${EMBED_EMPRESA}(*)`)
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('[empresas.service] fetchEmpresaAtual error:', error.message);
    return null;
  }

  return (data?.empresas as unknown as Empresa | null) ?? null;
}

/** Busca empresa por slug */
export async function fetchEmpresaBySlug(slug: string): Promise<Empresa | null> {
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.warn('[empresas.service] fetchEmpresaBySlug error:', error.message);
    return null;
  }

  return (data as Empresa) || null;
}
