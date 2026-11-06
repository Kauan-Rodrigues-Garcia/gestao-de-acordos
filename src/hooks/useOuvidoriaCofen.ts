/**
 * useOuvidoriaCofen — os setores de regra Cofen que a pessoa logada alcança na
 * aba Ouvidoria, e se gerencia cada um.
 *
 * Decide se o menu mostra «Ouvidoria» e quais setores a tela oferece. Quem
 * decide é o banco (`fn_ouvidoria_cofen_setores`, migration 20261106150000):
 * a chave `ver_ouvidoria_cofen` (do cargo, ou liberada pelo líder na aba) e
 * estar num setor Cofen. A chave refaz a leitura quando muda (o sinal
 * `permissoes:` invalida `useCargoPermissoes`, e a chave entra aqui).
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { listarSetores } from '@/services/ouvidoriaCofen.service';
import type { SetorOuvidoria } from '@/pages/Ouvidoria/ouvidoria';

const NENHUM: SetorOuvidoria[] = [];

export function useOuvidoriaCofen(): {
  setores: SetorOuvidoria[];
  carregando: boolean;
  /** A leitura falhou — quase sempre a migration 20261106150000 não aplicada. */
  bancoSemAba: boolean;
} {
  const { perfil } = useAuth();
  const { temPermissao, loading } = useCargoPermissoes();
  const chave = !loading && temPermissao('ver_ouvidoria_cofen');

  const query = useQuery({
    queryKey: ['ouvidoria-cofen-setores', perfil?.id ?? null, perfil?.setor_id ?? null, chave],
    enabled: !!perfil?.id && chave,
    queryFn: listarSetores,
    staleTime: 5 * 60 * 1000,
  });

  return {
    setores: chave ? (query.data ?? NENHUM) : NENHUM,
    carregando: loading || (chave && query.isLoading),
    bancoSemAba: chave && query.data === null,
  };
}
