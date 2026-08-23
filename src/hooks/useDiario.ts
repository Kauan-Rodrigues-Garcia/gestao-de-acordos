/**
 * useDiario — busca e realtime de diario_recebimentos (PaguePlay).
 *
 * Lógica de "novos" do operador:
 *   Um pagamento só é considerado lido quando o operador abre a aba
 *   (marcarVisto=true) após a importação. Os ids não vistos no momento da
 *   carga ficam em `novosIds` durante a sessão — a lista continua separando
 *   "anteriores" × "novos" mesmo depois de o banco marcar visto=true.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { DiarioRecebimento } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { buscarDiario, marcarVistoDiario } from '@/services/diario/diario.service';

export interface UseDiarioOptions {
  /** Dia do relatório ('yyyy-MM-dd'); null = ainda não resolvido (não busca) */
  dia: string | null;
  /** Filtrar por operador específico; null = somente órfãos; undefined = todos */
  operadorFiltro?: string | null;
  /** Marca as linhas do usuário atual como vistas após a carga (visão operador) */
  marcarVisto?: boolean;
}

export function useDiario(options: UseDiarioOptions) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [dados,   setDados]   = useState<DiarioRecebimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // Ids não vistos na carga — mantidos como "novos" durante a sessão
  const novosIdsRef   = useRef<Set<string>>(new Set());
  const [novosIds, setNovosIds] = useState<Set<string>>(new Set());
  const hasLoadedOnce = useRef(false);

  /**
   * `silencioso` = a tela já tem conteúdo e alguém está lendo.
   *
   * A importação do diário insere em lote e dispara um evento por linha; até
   * aqui cada rajada trocava a tabela inteira por esqueleto. Falso por padrão
   * para que a troca de dia continue mostrando esqueleto — o conteúdo em tela
   * é de OUTRO dia, e mantê-lo visível seria apresentá-lo como o do dia novo.
   */
  const fetchDados = useCallback(async (silencioso = false) => {
    if (!empresa?.id || !perfil?.id || !options.dia) {
      setDados([]);
      setLoading(false);
      return;
    }
    if (!silencioso) setLoading(true);
    setError(null);

    const { data, error: err } = await buscarDiario({
      empresaId:  empresa.id,
      dia:        options.dia,
      operadorId: options.operadorFiltro,
    });

    if (err) {
      setError(err);
      // Em releitura o dado antigo fica: é verdade de um minuto atrás, e vale
      // mais que uma tabela vazia por queda de rede.
      if (!silencioso) setLoading(false);
      return;
    }

    // Linhas iguais voltam com a MESMA referência; lista sem novidade volta
    // por referência e não renderiza. Ver `lib/dadosVivos`.
    setDados(atual => reconciliarLista(atual, data, {
      chave: d => d.id, iguais: iguaisProfundo,
    }));

    // Congela os "novos" da sessão e marca como vistos no banco
    const naoVistosProprios = data.filter(d => !d.visto && d.operador_id === perfil.id);
    if (naoVistosProprios.length) {
      for (const d of naoVistosProprios) novosIdsRef.current.add(d.id);
      setNovosIds(new Set(novosIdsRef.current));
      if (options.marcarVisto) {
        marcarVistoDiario(empresa.id, perfil.id).catch(() => {});
      }
    }

    if (!silencioso) setLoading(false);
    hasLoadedOnce.current = true;
  }, [empresa?.id, perfil?.id, options.dia, options.operadorFiltro, options.marcarVisto]);

  useEffect(() => {
    void fetchDados();
  }, [fetchDados]);

  // Realtime: refetch em INSERT/DELETE (UPDATE de "visto" não altera a lista).
  // A importação insere EM LOTE (1 evento por linha) → refetch/toast debounced:
  // um único aviso por importação, e nunca para quem importou.
  const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtToastRef    = useRef(false);

  // Lidos por ref: `fetchDados` muda a cada troca de filtro, e o canal não
  // precisa ser derrubado por isso. O tópico passa a depender só de (empresa, dia).
  const fetchRef    = useRef(fetchDados);
  fetchRef.current  = fetchDados;
  const perfilRef   = useRef(perfil?.id);
  perfilRef.current = perfil?.id;

  useEffect(() => {
    if (!empresa?.id || !options.dia) return;
    const empresaId = empresa.id;

    const agendarRefetch = () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
      rtDebounceRef.current = setTimeout(() => {
        if (rtToastRef.current) {
          rtToastRef.current = false;
          toast.info('Recebimento diário atualizado!', {
            id: 'diario-atualizado',   // mesmo id → substitui, não empilha
            description: 'Novos pagamentos foram importados.',
            duration: 4000,
          });
        }
        void fetchRef.current(true);   // silencioso: a tabela fica na tela
      }, 1500);
    };

    return assinarTabela(
      {
        topico:  `diario-${empresaId}-${options.dia}`,
        escutas: [
          {
            tabela: 'diario_recebimentos',
            evento: 'INSERT',
            filtro: `empresa_id=eq.${empresaId}`,
          },
          {
            // DELETE sem filtro de propósito: o payload de DELETE só traz a
            // replica identity, então `empresa_id=eq.…` nunca casaria e o evento
            // não chegaria. O custo é um refetch a mais quando a OUTRA empresa
            // apaga linhas — a RLS garante que o dado em si não cruza.
            tabela: 'diario_recebimentos',
            evento: 'DELETE',
          },
        ],
      },
      {
        onEvento: (payload) => {
          if (payload.eventType === 'INSERT') {
            const importadoPorMim =
              (payload.new as { importado_por_id?: string | null } | null)?.importado_por_id
                === perfilRef.current;
            if (hasLoadedOnce.current && !importadoPorMim) rtToastRef.current = true;
          }
          agendarRefetch();
        },
        // Sem toast: reconexão não é "chegou importação nova".
        onReconectado: () => { void fetchRef.current(true); },
      },
    );
  }, [empresa?.id, options.dia]);

  // Debounce pendente não deve sobreviver ao unmount do hook.
  useEffect(() => () => {
    if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
  }, []);

  return { dados, loading, error, novosIds, refetch: fetchDados };
}
