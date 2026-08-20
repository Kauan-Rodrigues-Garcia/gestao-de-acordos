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
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
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
  const { temPermissao } = useCargoPermissoes();

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

  /**
   * A permissão configurável entra como um E, nunca como um OU.
   *
   * A concessão fina de `ouvidoria_acessos` continua mandando em QUEM foi
   * habilitado individualmente; a permissão do cargo decide se aquele cargo
   * pode a ação. Quem perder qualquer um dos dois lados perde o acesso — é o
   * lado seguro, e mantém a regra da migration 20260717b intacta.
   */
  const podeVerPorPermissao       = temPermissao('ver_ouvidoria');
  const podeEditarPorPermissao    = temPermissao('editar_ouvidoria');
  const podeGerenciarPorPermissao = temPermissao('gerenciar_acessos_ouvidoria');

  return {
    podeVer:              pp && podeVerPorPermissao
                             && (acessoTotal || nivelConcedido !== null),
    podeEditar:           pp && podeEditarPorPermissao
                             && (acessoTotal || nivelConcedido === 'editar'),
    podeGerenciarAcessos: pp && podeGerenciarPorPermissao && acessoTotal,
    isResponsavel,
    loading,
  };
}
