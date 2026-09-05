/**
 * src/hooks/useOuvidoriaAcesso.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Quem enxerga/edita a aba Ouvidoria (PaguePlay only):
 *   • `ouvidoria_responsavel`  → vê, edita e gerencia acessos
 *   • demais                   → conforme linha em ouvidoria_acessos
 *     ('ver' = leitura; 'editar' = leitura + escrita)
 *
 * Espelha as policies de RLS da migration 20260717b.
 *
 * O responsável saía do CARGO (`cargo === 'ouvidoria'`) até 24/08/2026, e por
 * isso trocar de responsável exigia deploy. Hoje é chave de painel — e quem tem
 * acesso total responde `true` para ela por construção, como para toda chave.
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
  /** true quando a pessoa é responsável pela Ouvidoria (`ouvidoria_responsavel`) */
  isResponsavel: boolean;
  loading: boolean;
}

export function useOuvidoriaAcesso(): OuvidoriaAcessoInfo {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const tenant      = useTenant();
  const { temPermissao } = useCargoPermissoes();

  /*
   * Responsável pela Ouvidoria: enxerga tudo sem depender de concessão em
   * `ouvidoria_acessos`.
   *
   * Era `cargo === 'ouvidoria'` mais `cargo === 'administrador'`. A chave
   * `ouvidoria_responsavel` cobre os dois: os cargos de acesso total respondem
   * `true` para ela por construção, então a segunda comparação era redundante.
   * Promover outra pessoa a responsável deixou de exigir deploy.
   */
  const isResponsavel = temPermissao('ouvidoria_responsavel');
  const acessoTotal   = isResponsavel;

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
