/**
 * useVeQuadroPessoal — quem abre o sistema do RH (Quadro de Pessoal e Usuários).
 *
 * A chave `ver_quadro_pessoal` é EXPLÍCITA (13/11/2026): o acesso total do
 * administrador não a concede, e a semeadura não a liga em cargo de acesso
 * total. O Cleber quer o super_admin sempre dentro — é quem libera a aba para
 * os outros —, e para todo o resto manda `temPermissaoExplicita`.
 *
 * Fica num lugar só para a exceção de cargo (o super_admin) não se espalhar
 * pelas telas. O banco faz o mesmo em `fn_rh_historico_mes`
 * (`fn_user_tem OR fn_user_is_super_admin`).
 */
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';

export function useVeQuadroPessoal(): { podeVer: boolean; carregando: boolean } {
  const { perfil } = useAuth();
  const { temPermissaoExplicita, loading } = useCargoPermissoes();
  return {
    podeVer: perfil?.perfil === 'super_admin' || temPermissaoExplicita('ver_quadro_pessoal'),
    carregando: loading,
  };
}
