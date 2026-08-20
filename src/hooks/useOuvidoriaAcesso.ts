/**
 * src/hooks/useOuvidoriaAcesso.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Quem enxerga/edita a aba Ouvidoria (PaguePlay only):
 *   • cargo 'ouvidoria'            → vê, edita e gerencia acessos
 *   • administrador / super_admin  → idem
 *   • demais                        → conforme linha em ouvidoria_acessos
 *     ('ver' = leitura; 'editar' = leitura + escrita)
 *
 * Espelha as policies de RLS da migration 20260717b — o gate real é o banco;
 * este hook só decide o que renderizar (item na nav, botões, página).
 */
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';

export interface OuvidoriaAcessoInfo {
  podeVer: boolean;
  podeEditar: boolean;
  podeGerenciarAcessos: boolean;
  /** true quando o usuário é o cargo ouvidoria (responsável) */
  isResponsavel: boolean;
  loading: boolean;
}

export function useOuvidoriaAcesso(): OuvidoriaAcessoInfo {
  const { perfil }  = useAuth();
  const tenant      = useTenant();
  const { temPermissao, loading } = useCargoPermissoes();

  const cargo         = perfil?.perfil ?? '';
  const isResponsavel = cargo === 'ouvidoria';
  const pp = tenant.isPaguePlay;

  return {
    podeVer:              pp && temPermissao('ver_ouvidoria'),
    podeEditar:           pp && temPermissao('editar_ouvidoria'),
    podeGerenciarAcessos: pp && temPermissao('gerenciar_acessos_ouvidoria'),
    isResponsavel,
    loading,
  };
}
