/**
 * useJornadaAbas — os grupos (subgrupo ou equipe) Suporte/Retenção que a pessoa
 * logada alcança.
 *
 * Decide se o menu mostra «Acesso» e «Retenção», e quais grupos a tela
 * oferece. Quem decide é o banco (`fn_jornada_minhas_abas`): a equipe ou o
 * subgrupo da pessoa, ou a liderança do setor. Mover alguém em Equipes
 * liga ou desliga a aba sem mexer em permissão.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { listarMinhasAbas, type GrupoJornada } from '@/services/jornada/jornada.service';

const NENHUM: GrupoJornada[] = [];

export function useJornadaAbas(): {
  grupos: GrupoJornada[];
  acesso: boolean;
  retencao: boolean;
  carregando: boolean;
  /** A leitura falhou — quase sempre a migration 20261104180000 não aplicada. */
  bancoSemAbas: boolean;
} {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;

  const query = useQuery({
    queryKey: ['jornada-abas', perfil?.id ?? null, empresaId, perfil?.equipe_id ?? null, perfil?.subgrupo_id ?? null],
    enabled: !!perfil?.id && !!empresaId,
    queryFn: () => listarMinhasAbas(empresaId as string),
    staleTime: 5 * 60 * 1000,
  });

  const grupos = query.data ?? NENHUM;
  return {
    grupos,
    acesso: grupos.some(s => s.tipo === 'acesso'),
    retencao: grupos.some(s => s.tipo === 'retencao'),
    carregando: query.isLoading,
    bancoSemAbas: query.data === null,
  };
}
