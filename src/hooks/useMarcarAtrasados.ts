import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getTodayISO } from '@/lib/index';
import { veAlemDeSi } from '@/lib/permissoes-escopo';
import { converterAtrasados } from '@/services/atrasados.service';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';

/**
 * Roda uma vez por sessão, em qualquer página.
 * Converte os acordos `verificar_pendente` com vencimento anterior a hoje para
 * `nao_pago` no banco — sem depender de nenhuma página específica.
 *
 * Escopo: os NÍVEIS do Dashboard, e não uma lista de cargo.
 *  - enxerga além de si → converte todos da empresa
 *  - só os próprios     → converte apenas os seus
 *
 * A conversão em si — e as travas contra desfazer pagamento e notificar em
 * dobro — mora em `services/atrasados.service`.
 */
export function useMarcarAtrasados() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, loading: permissoesCarregando } = useCargoPermissoes();
  const jaRodouRef = useRef(false);

  useEffect(() => {
    if (jaRodouRef.current) return;
    if (!perfil?.id || !empresa?.id) return;
    /*
     * Esperar as permissões. Enquanto carregam, `temPermissao` responde
     * `false` para todo cargo que não é de acesso total — e a varredura roda
     * UMA vez por sessão. Quem enxerga a empresa inteira convertia só os
     * próprios atrasados, e o `jaRodouRef` impedia a segunda chance: o resto
     * da fila esperava outra pessoa abrir o sistema.
     */
    if (permissoesCarregando) return;

    jaRodouRef.current = true;

    // Quem enxerga além de si no Dashboard varre a fila inteira; quem não,
    // só a própria. Era `isPerfilAdmin || isPerfilLider || 'diretoria'` — uma
    // TERCEIRA lista de cargo para a mesma pergunta que o painel de metas e o
    // AnalyticsPanel já faziam, cada um com a sua.
    const podeVerTodos = veAlemDeSi('dashboard', temPermissao);

    void converterAtrasados({
      empresaId: empresa.id,
      operadorId: podeVerTodos ? null : perfil.id,
      hoje: getTodayISO(),
    })
      .then(n => {
        if (n > 0) toast.info(`${n} acordo(s) atrasado(s) movido(s) para "Não Pago"`);
      })
      .catch(e => {
        console.warn('[useMarcarAtrasados] erro ao buscar atrasados:', e instanceof Error ? e.message : e);
      });
  }, [perfil?.id, perfil?.perfil, empresa?.id, permissoesCarregando, temPermissao]);
}
