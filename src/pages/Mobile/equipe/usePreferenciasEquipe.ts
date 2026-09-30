/**
 * As chaves dos avisos da equipe — `fn_push_minhas_preferencias` e
 * `fn_push_definir_preferencia` (migration 20260930210000). Por pessoa, não
 * por aparelho.
 *
 * Quem decide se a pessoa escolhe é o banco (`fixo`): quem só lidera recebe
 * sempre; o elite liga cada uma à parte. Sem a migration, as chaves não
 * aparecem (`disponivel`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export type ChaveAviso = 'resumo_equipe' | 'metas_operadores' | 'meta_equipe';

export interface PreferenciasEquipe {
  fixo: boolean;
  resumo_equipe: boolean;
  metas_operadores: boolean;
  meta_equipe: boolean;
}

const CHAVE = ['push-preferencias-equipe'] as const;

export function usePreferenciasEquipe(ativo: boolean) {
  const queryClient = useQueryClient();
  const leitura = useQuery({
    queryKey: CHAVE,
    enabled: ativo,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<PreferenciasEquipe> => {
      const { data, error } = await rpcSemTipo<Partial<PreferenciasEquipe>>('fn_push_minhas_preferencias', {});
      if (error) throw new Error(error.message);
      return {
        fixo: data?.fixo === true,
        resumo_equipe: data?.resumo_equipe === true,
        metas_operadores: data?.metas_operadores === true,
        meta_equipe: data?.meta_equipe === true,
      };
    },
  });

  const gravar = useMutation({
    mutationFn: async ({ chave, ligado }: { chave: ChaveAviso; ligado: boolean }) => {
      const { error } = await rpcSemTipo<boolean>('fn_push_definir_preferencia', { p_chave: chave, p_ligado: ligado });
      if (error) throw new Error(error.message);
      return ligado;
    },
    onMutate: async ({ chave, ligado }) => {
      const antes = queryClient.getQueryData<PreferenciasEquipe>(CHAVE);
      if (antes) queryClient.setQueryData(CHAVE, { ...antes, [chave]: ligado });
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(CHAVE, ctx?.antes);
      toast.error('Não foi possível salvar agora. Tente de novo.');
    },
  });

  return {
    disponivel: leitura.isSuccess,
    preferencias: leitura.data ?? null,
    salvando: gravar.isPending,
    definir: (chave: ChaveAviso, ligado: boolean) => gravar.mutate({ chave, ligado }),
  };
}
