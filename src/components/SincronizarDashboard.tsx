/**
 * SincronizarDashboard — mantém o cache do Dashboard fiel ao banco, com ou sem
 * o Dashboard aberto (12/11/2026).
 *
 * O Dashboard guarda o mês por 5 minutos (`useAnaliticoDashboard`) e só se
 * invalidava pelo sinal `analitico`, e só enquanto estava montado. Duas falhas:
 *
 *   • o ajuste de recebimento e o relatório do setor (o 1017) mandam o sinal
 *     `ajustes`, que o Dashboard não ouvia: depois de importar o 1017 o setor
 *     seguia com o número antigo;
 *   • importar com o Dashboard fechado (no Analítico, ou o robô do 59) deixava
 *     a leitura velha no cache, e voltar ao Dashboard mostrava o mês de antes
 *     por até 5 minutos.
 *
 * Aqui, um ouvinte para o app inteiro: cada sinal invalida as chaves do
 * Dashboard. Quem está na tela relê na hora; quem não está fica marcado como
 * velho e relê ao voltar — sem custo de banco enquanto ninguém olha.
 *
 * Não desenha nada.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmpresa } from '@/hooks/useEmpresa';
import { assinarSinal } from '@/lib/sinais';
import { invalidarSomasDeAjuste } from '@/services/analitico/ajusteManual.service';
import { CHAVE_ANALITICO_DASHBOARD } from '@/hooks/useAnaliticoDashboard';
import { CHAVE_SETOR_DASHBOARD } from '@/hooks/useSetorDoDashboard';

/** Tabulação é UPDATE e não muda valor (ver «Só UPDATE» em `sinais.ts`). */
const MINIMO_SO_UPDATE_MS = 5 * 60_000;

export function SincronizarDashboard(): null {
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const empresaId = empresa?.id ?? null;

  useEffect(() => {
    if (!empresaId) return;
    const invalidar = () => {
      void queryClient.invalidateQueries({ queryKey: [CHAVE_ANALITICO_DASHBOARD, empresaId] });
      void queryClient.invalidateQueries({ queryKey: [CHAVE_SETOR_DASHBOARD, empresaId] });
    };
    const cancelarAnalitico = assinarSinal('analitico', empresaId, {
      onMudou: invalidar, onReconectado: invalidar,
    }, { minimoSoUpdateMs: MINIMO_SO_UPDATE_MS });
    const cancelarAjustes = assinarSinal('ajustes', empresaId, {
      // As somas de ajuste ficam guardadas por 2 minutos: sem isto a releitura
      // do Dashboard juntaria o ajuste de antes.
      onMudou: () => { invalidarSomasDeAjuste(); invalidar(); },
      onReconectado: () => { invalidarSomasDeAjuste(); invalidar(); },
    });
    // Receptivo digitado entra no total do setor (Painel do Líder).
    const cancelarContribuicao = assinarSinal('contribuicao', empresaId, {
      onMudou: () => { void queryClient.invalidateQueries({ queryKey: [CHAVE_SETOR_DASHBOARD, empresaId] }); },
    });
    return () => { cancelarAnalitico(); cancelarAjustes(); cancelarContribuicao(); };
  }, [empresaId, queryClient]);

  return null;
}
