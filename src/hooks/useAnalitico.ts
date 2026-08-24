/**
 * useAnalitico — busca e realtime de analitico_recebimentos (PaguePlay)
 *
 * Ao montar, marca como vistos os registros não vistos do operador atual
 * (tag "novo" desaparece após a primeira visualização do mês).
 *
 * ## A releitura não troca a tela
 *
 * Uma importação insere em lote e dispara um evento por linha. Até aqui o
 * `onEvento` chamava a mesma função da carga inicial, que liga `loading` — e a
 * tabela de 2.400 linhas virava esqueleto, com quem estava lendo perdendo o
 * scroll, para no fim reaparecer quase idêntica.
 *
 * Agora `loading` vale só para a PRIMEIRA carga e para a troca de filtro (mês,
 * operador — recortes diferentes, conteúdo diferente). A releitura do realtime
 * passa por `reconciliarLista`: as linhas iguais voltam com a mesma referência
 * e, quando nada mudou, o próprio array anterior volta e o React não renderiza.
 *
 * A comparação é PROFUNDA porque a linha traz `perfis` (join) e
 * `pagamentos_detalhados` (array) — com a rasa, nenhuma linha seria igual.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { buscarAnalitico, marcarVistoAnalitico } from '@/services/analitico/analitico.service';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { veAlemDeSi } from '@/lib/permissoes-escopo';

export interface UseAnaliticoOptions {
  mes: string;                  // 'yyyy-MM'
  /** Filtrar por operador específico (líder filtrando equipe) */
  operadorFiltro?: string | null;
  /** null = somente sem operador (bucket sem match) */
  apenasOrfaos?: boolean;
}

export function useAnalitico(options: UseAnaliticoOptions) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const [dados,       setDados]       = useState<AnaliticoRecebimento[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [novosCount,  setNovosCount]  = useState(0);
  const marcouRef     = useRef(false);
  const hasLoadedOnce = useRef(false);

  /*
   * Enxerga além de si nesta aba?
   *
   * Era `isPerfilAdminOuLider(cargo)`. A tela que consome este hook
   * (`pages/Analitico`) já decidia o alcance dela por `niveisLiberados`, então
   * ligar `analitico_escopo_setor` num operador abria a visão de setor na tela e
   * o hook continuava filtrando pelo id dele — a lista vinha vazia, sem
   * explicação. É o defeito clássico de duas autoridades na mesma tela.
   */
  const isLiderMais = veAlemDeSi('analitico', temPermissao);

  /**
   * `silencioso` = a tela já tem conteúdo e alguém está lendo.
   *
   * O padrão é falso para que a troca de filtro continue mostrando esqueleto:
   * o conteúdo em tela é de OUTRO recorte, e deixá-lo visível enquanto o novo
   * não chega seria apresentá-lo como resposta do filtro recém-escolhido.
   */
  const fetchDados = useCallback(async (silencioso = false) => {
    if (!empresa?.id || !perfil?.id) return;
    if (!silencioso) setLoading(true);
    setError(null);

    let operadorId: string | null | undefined = undefined;
    if (options.apenasOrfaos) {
      operadorId = null;
    } else if (options.operadorFiltro !== undefined) {
      operadorId = options.operadorFiltro;
    } else if (!isLiderMais) {
      operadorId = perfil.id;
    }

    const { data, error: err } = await buscarAnalitico({
      empresaId:  empresa.id,
      mes:        options.mes,
      operadorId,
    });

    if (err) {
      setError(err);
      // Falha em releitura mantém o que está na tela: é dado de um minuto
      // atrás, e vale mais que uma tabela vazia por queda de rede.
      if (!silencioso) setLoading(false);
      return;
    }

    // A releitura substitui só o que mudou. Ver o cabeçalho.
    setDados(atual => reconciliarLista(atual, data, {
      chave: d => d.id, iguais: iguaisProfundo,
    }));
    const naoVistos = data.filter(d => !d.visto && d.operador_id === perfil.id).length;
    setNovosCount(naoVistos);
    if (!silencioso) setLoading(false);
    hasLoadedOnce.current = true;
  }, [empresa?.id, perfil?.id, options.mes, options.operadorFiltro, options.apenasOrfaos, isLiderMais]);

  // Marcar como visto ao abrir (uma vez por mount)
  useEffect(() => {
    if (!perfil?.id || !empresa?.id || marcouRef.current) return;
    marcouRef.current = true;
    marcarVistoAnalitico(empresa.id, perfil.id, options.mes).catch(() => {});
  }, [empresa?.id, perfil?.id, options.mes]);

  useEffect(() => {
    void fetchDados();
  }, [fetchDados]);

  // Realtime: a importação insere EM LOTE (1 evento por linha), então o
  // refetch/toast é debounced — um único aviso por importação, e nunca para
  // quem importou (o próprio fluxo de importar já dá o feedback).
  const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtToastRef    = useRef(false);

  // `fetchDados` muda a cada troca de filtro. Lido por ref para que a assinatura
  // dependa só de (empresa, mês): trocar de operador no filtro não precisa
  // derrubar e recriar o canal.
  const fetchRef  = useRef(fetchDados);
  fetchRef.current = fetchDados;
  const perfilRef = useRef(perfil?.id);
  perfilRef.current = perfil?.id;

  useEffect(() => {
    if (!empresa?.id) return;
    const empresaId = empresa.id;

    return assinarTabela(
      {
        topico:  `analitico-${empresaId}-${options.mes}`,
        escutas: [{
          tabela: 'analitico_recebimentos',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento: (payload) => {
          const importadoPorMim =
            (payload.new as { importado_por_id?: string | null } | null)?.importado_por_id
              === perfilRef.current;
          if (hasLoadedOnce.current && payload.eventType === 'INSERT' && !importadoPorMim) {
            rtToastRef.current = true;
          }
          if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
          rtDebounceRef.current = setTimeout(() => {
            if (rtToastRef.current) {
              rtToastRef.current = false;
              toast.info('Analítico atualizado!', {
                id: 'analitico-atualizado',   // mesmo id → substitui, não empilha
                description: 'Novos recebimentos foram importados.',
                duration: 4000,
              });
            }
            void fetchRef.current(true);   // silencioso: a tabela fica na tela
          }, 1500);
        },
        // Sem toast: a reconexão é assunto interno, não "chegou importação nova".
        onReconectado: () => { void fetchRef.current(true); },
      },
    );
  }, [empresa?.id, options.mes]);

  // Debounce pendente não deve sobreviver ao unmount do hook.
  useEffect(() => () => {
    if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
  }, []);

  return { dados, loading, error, novosCount, refetch: fetchDados };
}
