/**
 * A leitura do Resumo de equipe e setor do operador (`fn_app_resumo_visoes`).
 * Ver `ResumoDaVisao.tsx`.
 */
import { useQuery } from '@tanstack/react-query';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface Conjunto {
  id: string; nome: string;
  recebido: number; recebido_ho: number; hoje: number; hoje_ho: number; qtd_hoje: number;
  meta: number | null; regra?: string;
}
export interface ResumoCru {
  mes: string; hoje: string | null;
  equipe: Conjunto | null; setor: Conjunto | null;
  config: { feriados: string[]; contar_dia_atual: boolean };
}

export function chaveResumoVisoes(mes: string) {
  return ['mobile-resumo-visoes', mes] as const;
}

export function useResumoVisoes(mes: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveResumoVisoes(mes),
    enabled: ativo,
    staleTime: 60_000,
    queryFn: async (): Promise<ResumoCru> => {
      const { data, error } = await rpcSemTipo<ResumoCru>('fn_app_resumo_visoes', { p_mes: mes });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Resumo indisponível');
      return data;
    },
  });
}

