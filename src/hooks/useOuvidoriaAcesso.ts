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
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { fetchMeuAcesso, OuvidoriaNivel } from '@/services/ouvidoria.service';

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
  const { empresa } = useEmpresa();
  const tenant      = useTenant();

  const cargo         = perfil?.perfil ?? '';
  const isResponsavel = cargo === 'ouvidoria';
  const isAdmin       = cargo === 'administrador' || cargo === 'super_admin';
  const acessoTotal   = isResponsavel || isAdmin;

  const [nivelConcedido, setNivelConcedido] = useState<OuvidoriaNivel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant.isPaguePlay || !perfil?.id || !empresa?.id || acessoTotal) {
      setNivelConcedido(null);
      setLoading(false);
      return;
    }
    let ativo = true;
    setLoading(true);
    fetchMeuAcesso(empresa.id, perfil.id).then(nivel => {
      if (!ativo) return;
      setNivelConcedido(nivel);
      setLoading(false);
    });
    return () => { ativo = false; };
  }, [tenant.isPaguePlay, perfil?.id, empresa?.id, acessoTotal]);

  const pp = tenant.isPaguePlay;
  return {
    podeVer:              pp && (acessoTotal || nivelConcedido !== null),
    podeEditar:           pp && (acessoTotal || nivelConcedido === 'editar'),
    podeGerenciarAcessos: pp && acessoTotal,
    isResponsavel,
    loading,
  };
}
