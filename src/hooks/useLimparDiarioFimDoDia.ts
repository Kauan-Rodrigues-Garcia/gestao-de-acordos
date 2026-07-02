import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { isPerfilAdmin, isPerfilLider, isPerfilDiretoria } from '@/lib/index';
import { limparTodoDiario } from '@/services/diario/diario.service';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';

/** Hora local (horário do Brasil) a partir da qual a limpeza pode rodar. */
const HORA_LIMPEZA = 23; // 23h

/**
 * Limpeza automática de fim de dia do Recebimento diário.
 *
 * A partir das 23h, quando o PRIMEIRO líder/admin abre o sistema, apaga todos
 * os registros de `diario_recebimentos` da empresa, deixando o dia seguinte
 * limpo para uma nova importação. Roda em qualquer página (montado no Layout),
 * espelhando o padrão de useMarcarAtrasados.
 *
 * Garantias:
 *  - Somente líder/elite/gerência/diretoria/admin (RLS exige o papel para
 *    deletar; operador é ignorado).
 *  - No máximo uma vez por dia por navegador (marca a data em localStorage),
 *    evitando reexecução a cada navegação/reload.
 *  - Idempotente: se outro líder já limpou, o DELETE não encontra linhas.
 *
 * Observação: como o gatilho é o login, a limpeza acontece "assim que alguém
 * entra a partir das 23h" — não é um agendamento no servidor. Se ninguém
 * entrar após as 23h, os dados só são apagados no próximo acesso de um líder.
 */
export function useLimparDiarioFimDoDia() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const jaRodouRef  = useRef(false);

  useEffect(() => {
    if (jaRodouRef.current) return;
    if (!perfil?.id || !empresa?.id) return;

    const podeLimpar =
      isPerfilAdmin(perfil.perfil) ||
      isPerfilLider(perfil.perfil) ||
      isPerfilDiretoria(perfil.perfil);
    if (!podeLimpar) return;

    const agora = new Date();
    if (agora.getHours() < HORA_LIMPEZA) return;

    // Executa no máximo uma vez por dia (por navegador)
    const hojeLocal =
      `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const chave = `diario_limpo_${empresa.id}`;
    let jaLimpouHoje = false;
    try { jaLimpouHoje = localStorage.getItem(chave) === hojeLocal; } catch { /* ignore */ }
    if (jaLimpouHoje) return;

    jaRodouRef.current = true;

    void (async () => {
      const { removidos, error } = await limparTodoDiario(empresa.id);
      if (error) {
        console.warn('[useLimparDiarioFimDoDia] erro ao limpar:', error);
        jaRodouRef.current = false; // permite nova tentativa nesta sessão
        return;
      }
      try { localStorage.setItem(chave, hojeLocal); } catch { /* ignore */ }
      if (removidos > 0) {
        toast.info('Recebimento diário zerado para o novo dia.', {
          description: `${removidos} registro${removidos !== 1 ? 's' : ''} do dia foram limpos.`,
          duration: 5000,
        });
      }
    })();
  }, [perfil?.id, perfil?.perfil, empresa?.id]);
}
