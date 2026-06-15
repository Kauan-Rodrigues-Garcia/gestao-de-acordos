import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getTodayISO, formatCurrency, formatDate, isPerfilAdmin, isPerfilLider } from '@/lib/index';
import { criarNotificacao } from '@/services/notificacoes.service';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';

/**
 * Roda uma vez por sessão, em qualquer página.
 * Busca todos os acordos verificar_pendente com vencimento anterior a hoje
 * e os converte para nao_pago no banco — sem depender de nenhuma página específica.
 *
 * Escopo:
 *  - Admin / lider / diretoria: converte todos da empresa
 *  - Operador: converte apenas os seus próprios
 */
export function useMarcarAtrasados() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const jaRodouRef = useRef(false);

  useEffect(() => {
    if (jaRodouRef.current) return;
    if (!perfil?.id || !empresa?.id) return;

    jaRodouRef.current = true;

    void (async () => {
      const hoje = getTodayISO();
      const podeVerTodos =
        isPerfilAdmin(perfil.perfil) ||
        isPerfilLider(perfil.perfil) ||
        perfil.perfil === 'diretoria';

      let query = supabase
        .from('acordos')
        .select('id, operador_id, instituicao, nr_cliente, nome_cliente, valor, vencimento, empresa_id')
        .eq('empresa_id', empresa.id)
        .eq('status', 'verificar_pendente')
        .lt('vencimento', hoje);

      if (!podeVerTodos) {
        query = query.eq('operador_id', perfil.id);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[useMarcarAtrasados] erro ao buscar atrasados:', error.message);
        return;
      }

      const atrasados = data ?? [];
      if (atrasados.length === 0) return;

      const ids = atrasados.map(a => a.id);

      const { error: updateErr } = await supabase
        .from('acordos')
        .update({ status: 'nao_pago' })
        .in('id', ids);

      if (updateErr) {
        console.warn('[useMarcarAtrasados] erro ao atualizar:', updateErr.message);
        return;
      }

      toast.info(`${atrasados.length} acordo(s) atrasado(s) movido(s) para "Não Pago"`);

      for (const a of atrasados) {
        if (!a.operador_id) continue;
        const identificador = a.instituicao
          ? `Código ${a.instituicao}`
          : `NR ${a.nr_cliente || '—'} — ${a.nome_cliente || ''}`;
        criarNotificacao({
          usuario_id: a.operador_id,
          titulo:     'Acordo movido para Não Pago',
          mensagem:   `Acordo ${identificador} foi movido para "Não Pago" por atraso de pagamento.\nValor: ${formatCurrency(a.valor)}\nVencimento: ${formatDate(a.vencimento)}`,
          empresa_id: a.empresa_id,
          acordo_id:  a.id,
        });
      }
    })();
  }, [perfil?.id, perfil?.perfil, empresa?.id]);
}
