import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { normalizarMes } from '@/lib/mesReferencia';
import {
  carregarSetorDoDashboard, lerSetorDoMes, type SetorDoDashboard,
} from '@/pages/Dashboard/setorDoDashboard';

/** Prefixo das chaves — `SincronizarDashboard` invalida por ele. */
export const CHAVE_SETOR_DASHBOARD = 'dashboard-setor';

/**
 * O total do setor em foco no Dashboard, pelo caminho do Painel do Líder
 * (ver `setorDoDashboard.ts`). `setorId` nulo = não há setor inteiro na tela
 * (pessoa, equipe ou divisão): nada é lido.
 *
 * Se a leitura falhar (a conciliação nega acesso a quem não tem o Painel do
 * Líder), `dados` fica nulo e o Dashboard segue com o analítico.
 */
export function useSetorDoDashboard(setorId: string | null, mesRef: string): {
  dados: SetorDoDashboard | null;
  /** true enquanto a primeira leitura deste setor/mês não voltou. */
  pendente: boolean;
} {
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const mes = normalizarMes(mesRef);
  const habilitado = !!empresaId && !!setorId;

  const query = useQuery({
    queryKey: [CHAVE_SETOR_DASHBOARD, empresaId, mes, setorId, tenant.isPaguePlay],
    enabled: habilitado,
    // Igual ao card do setor no Painel: a conciliação não manda sinal, e o
    // Painel a relê a cada minuto. O analítico e o ajuste invalidam antes.
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async (): Promise<SetorDoDashboard | null> => {
      const setor = await lerSetorDoMes(empresaId as string, setorId as string, mes);
      if (!setor) return null;
      try {
        return await carregarSetorDoDashboard({
          empresaId: empresaId as string,
          mes,
          setor,
          isPaguePlay: tenant.isPaguePlay,
          // A mesma leitura (e o mesmo cache) do app e da tela de equipe.
          // Carregada só aqui (import dinâmico): o setor que não soma pessoas não
          // paga o código nem a leitura.
          carregarFontes: async () => {
            const { carregarFontes, chaveFontesEquipe } = await import('@/pages/Mobile/equipe/useTelaEquipe');
            return queryClient.fetchQuery({
              queryKey: chaveFontesEquipe(empresaId, mes),
              queryFn: () => carregarFontes(empresaId as string, mes),
              staleTime: 60_000,
            });
          },
        });
      } catch {
        // Sem acesso à conciliação (ou ela fora do ar): o analítico responde.
        return null;
      }
    },
  });

  return {
    dados: habilitado ? (query.data ?? null) : null,
    pendente: habilitado && !query.isFetched,
  };
}
