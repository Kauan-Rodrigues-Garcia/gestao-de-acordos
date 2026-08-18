/**
 * src/services/empresas.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com empresas.
 */
import { supabase, Empresa } from '@/lib/supabase';

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
