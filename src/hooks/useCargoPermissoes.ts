/**
 * src/hooks/useCargoPermissoes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook que carrega e expõe as permissões de um cargo específico para a
 * empresa atual. Usado por toda a aplicação para aplicar RBAC no frontend.
 *
 * ## Uso
 * ```tsx
 * const { temPermissao, loading } = useCargoPermissoes();
 * if (temPermissao('ver_lixeira')) { ... }
 * ```
 *
 * ## Isolamento multi-tenant
 * As permissões são sempre filtradas por `empresa_id`, garantindo que
 * cada empresa tem seu próprio conjunto de permissões por cargo.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

export type PermissoesMap = Record<string, boolean>;

export interface CargoPermissaoRow {
  id: string;
  empresa_id: string;
  cargo: string;
  permissoes: PermissoesMap;
  descricao?: string;
  atualizado_em: string;
}

interface UseCargoPermissoesReturn {
  /** Mapa de permissões do cargo do usuário atual */
  permissoes: PermissoesMap;
  /** Todas as linhas de permissão da empresa (para admin) */
  todasPermissoes: CargoPermissaoRow[];
  loading: boolean;
  /** Verifica se o usuário tem determinada permissão */
  temPermissao: (key: string) => boolean;
  /** Admin/super_admin tem acesso total independente das permissões configuradas */
  isAdmin: boolean;
  /** Recarrega dados do banco */
  refresh: () => Promise<void>;
}

export function useCargoPermissoes(): UseCargoPermissoesReturn {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [permissoes, setPermissoes] = useState<PermissoesMap>({});
  const [todasPermissoes, setTodasPermissoes] = useState<CargoPermissaoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const cargo = perfil?.perfil ?? '';
  const isAdmin = cargo === 'administrador' || cargo === 'super_admin';

  const fetch = useCallback(async () => {
    if (!empresa?.id || !cargo) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Busca todas as permissões da empresa (para a tela de admin)
      const { data: todas, error: erroTodas } = await supabase
        .from('cargos_permissoes')
        .select('*')
        .eq('empresa_id', empresa.id)
        .order('cargo');

      if (erroTodas) throw erroTodas;
      setTodasPermissoes((todas as CargoPermissaoRow[]) ?? []);

      // Permissões do cargo atual
      const minha = (todas as CargoPermissaoRow[])?.find(r => r.cargo === cargo);
      setPermissoes(minha?.permissoes ?? {});
    } catch (e) {
      console.warn('[useCargoPermissoes] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, cargo]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const temPermissao = useCallback(
    (key: string): boolean => {
      // Admin e super_admin têm acesso total
      if (isAdmin) return true;
      return !!permissoes[key];
    },
    [isAdmin, permissoes]
  );

  return {
    permissoes,
    todasPermissoes,
    loading,
    temPermissao,
    isAdmin,
    refresh: fetch,
  };
}
