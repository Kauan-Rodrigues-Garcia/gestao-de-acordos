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

/** Retorna a empresa do usuário logado (via join no perfil) */
export async function fetchEmpresaAtual(): Promise<Empresa | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('perfis')
    .select('empresas(*)')
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
