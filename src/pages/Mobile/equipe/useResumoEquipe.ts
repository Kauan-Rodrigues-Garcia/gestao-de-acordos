/**
 * A chave do resumo por hora da equipe — `fn_push_resumo_equipe_ligado` e
 * `fn_push_definir_resumo_equipe` (migration 20260930200000). Por pessoa, não
 * por aparelho. Sem a migration no banco, a chave não aparece (`disponivel`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

const CHAVE = ['push-resumo-equipe'] as const;

export function useResumoEquipe(ativo: boolean) {
  const queryClient = useQueryClient();
  const leitura = useQuery({
    queryKey: CHAVE,
    enabled: ativo,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await rpcSemTipo<boolean>('fn_push_resumo_equipe_ligado', {});
      if (error) throw new Error(error.message);
      return data === true;
    },
  });

  const gravar = useMutation({
    mutationFn: async (ligado: boolean) => {
      const { error } = await rpcSemTipo<boolean>('fn_push_definir_resumo_equipe', { p_ligado: ligado });
      if (error) throw new Error(error.message);
      return ligado;
    },
    onMutate: async (ligado) => {
      const antes = queryClient.getQueryData<boolean>(CHAVE);
      queryClient.setQueryData(CHAVE, ligado);
      return { antes };
    },
    onError: (_e, _ligado, ctx) => {
      queryClient.setQueryData(CHAVE, ctx?.antes);
      toast.error('Não foi possível salvar agora. Tente de novo.');
    },
    onSuccess: (ligado) => {
      toast.success(ligado ? 'Resumo da equipe ligado.' : 'Resumo da equipe desligado.');
    },
  });

  return {
    disponivel: leitura.isSuccess,
    ligado: leitura.data === true,
    salvando: gravar.isPending,
    definir: (ligado: boolean) => gravar.mutate(ligado),
  };
}
