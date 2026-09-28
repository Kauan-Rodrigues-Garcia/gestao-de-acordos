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
import { assinarSinal } from '@/lib/sinais';
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

  // Tempo real: um SINAL por comando, e não um evento por linha (28/09/2026).
  //
  // A importação do diário grava em lote, e a tabela estava no Postgres
  // Changes: cada linha passava pelo leitor do WAL do Realtime, com ou sem
  // tela aberta — 23 mil mudanças em 10 dias, a segunda tabela mais escrita da
  // publicação. Ninguém usava a linha: a tela só relê. Agora um gatilho por
  // comando manda `diario:<empresa>` (migration 20260928180000), e o portão de
  // `assinarSinal` junta a rajada de uma importação numa releitura só.
  //
  // UPDATE (a marca de «visto») não muda a lista e é ignorado, como antes.
  const fetchRef    = useRef(fetchDados);
  fetchRef.current  = fetchDados;
  const perfilRef   = useRef(perfil?.id);
  perfilRef.current = perfil?.id;

  useEffect(() => {
    if (!empresa?.id || !options.dia) return;

    return assinarSinal('diario', empresa.id, {
      onMudou: (sinal) => {
        if (sinal.operacao === 'UPDATE') return;
        // Um único aviso por importação, e nunca para quem importou.
        const deOutraPessoa = sinal.importado_por.some(id => id !== perfilRef.current);
        if (sinal.operacao === 'INSERT' && hasLoadedOnce.current && deOutraPessoa) {
          toast.info('Recebimento diário atualizado!', {
            id: 'diario-atualizado',   // mesmo id → substitui, não empilha
            description: 'Novos pagamentos foram importados.',
            duration: 4000,
          });
        }
        void fetchRef.current(true);   // silencioso: a tabela fica na tela
      },
      // Sem toast: reconexão não é "chegou importação nova".
      onReconectado: () => { void fetchRef.current(true); },
    });
  }, [empresa?.id, options.dia]);

  return { dados, loading, error, novosIds, refetch: fetchDados };
}
