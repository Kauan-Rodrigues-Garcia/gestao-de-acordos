/**
 * Os setores que têm o Ranking de quitação (Configurações → Geral). A régua do
 * Analítico pergunta aqui se mostra a aba; a configuração, para desenhar os
 * interruptores.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listarSetoresDoRanking, type SetorDoRanking } from '@/services/rankingQuitacao/rankingQuitacao.service';

const SEM_SETORES: SetorDoRanking[] = [];

export function useSetoresDoRanking(empresaId: string | null | undefined, ativo = true) {
  const queryClient = useQueryClient();
  const chave = useMemo(() => ['ranking-quitacao-setores', empresaId ?? null] as const, [empresaId]);
  const query = useQuery({
    queryKey: chave,
    enabled: ativo && !!empresaId,
    queryFn: () => listarSetoresDoRanking(empresaId as string),
  });
  const setores = query.data ?? SEM_SETORES;
  const habilitados = useMemo(() => setores.filter(s => s.ativo).map(s => s.setor_id), [setores]);
  const recarregar = useCallback(() => queryClient.invalidateQueries({ queryKey: chave }), [queryClient, chave]);
  return { setores, habilitados, carregando: query.isLoading, recarregar };
}
