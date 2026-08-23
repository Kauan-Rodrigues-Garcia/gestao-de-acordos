/**
 * useDesafios — estado, rede e tempo real do módulo de Desafios.
 *
 * Dois hooks, com fronteiras deliberadas:
 *
 *   • `useDesafios`         — as campanhas da empresa (a CONFIGURAÇÃO);
 *   • `useResultadoDesafio` — o quadro de UMA campanha, já calculado.
 *
 * A página não busca nada e não calcula nada: ela desenha o que sai daqui. É a
 * mesma divisão que `useAnaliticoDashboard` já fazia — dados no hook, conta no
 * módulo puro, apresentação no componente.
 *
 * ## O tempo real
 *
 * O desafio não tem tabela própria de recebimento: ele lê
 * `analitico_recebimentos`. Então o gatilho de atualização é o MESMO do
 * Analítico — o canal de `analitico_recebimentos` filtrado por empresa, com o
 * mesmo debounce de 1,5 s que existe para a importação em lote (uma importação
 * insere centenas de linhas e dispara um evento por linha).
 *
 * O tópico é literalmente o mesmo de `useAnaliticoDashboard`
 * (`analitico-dash-<empresa>`), com as mesmas escutas: `assinarTabela` conta
 * referências, então o Desafios entra de carona no canal que já existe em vez
 * de abrir um segundo. Um canal por empresa, não um por aba aberta.
 *
 * ## Por que React Query, e não `useState` + `useEffect`
 *
 * Porque a aba pode ser aberta, fechada e reaberta, e porque duas campanhas na
 * tela (a ativa e uma do histórico expandido) pediriam a mesma coisa duas
 * vezes. A chave `['desafio-dados', id]` resolve os dois casos sem nenhum
 * cuidado especial na página.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SituacaoUsuario } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { useEmpresa } from '@/hooks/useEmpresa';
import { idsOcultosRankingQuartil } from '@/services/situacaoUsuario.service';
import {
  buscarDadosDesafio, listarDesafios,
} from '@/services/desafios/desafios.service';
import { calcularDesafio, type ResultadoDesafio } from '@/services/desafios/calcularDesafio';
import type { DadosDesafio, Desafio } from '@/services/desafios/types';

/** Uma importação insere em lote e dispara um evento por linha. */
const DEBOUNCE_IMPORTACAO_MS = 1_500;

/** Referências estáveis para o caso "ainda não chegou" — não invalidam memos. */
const SEM_DESAFIOS: Desafio[] = [];
const SEM_DADOS: DadosDesafio = { participantes: [], linhas: [] };

// ── As campanhas ─────────────────────────────────────────────────────────────

export interface UsoDesafios {
  desafios: Desafio[];
  /** A campanha em cartaz. `null` quando não há nenhuma ativa. */
  ativo: Desafio | null;
  /** Encerradas, da mais recente para a mais antiga. */
  encerrados: Desafio[];
  /** Rascunhos — só chegam para quem tem `desafios_configurar` (a RLS filtra). */
  rascunhos: Desafio[];
  carregando: boolean;
  /** `false` = a migration ainda não foi aplicada nesta empresa. */
  dbAtiva: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useDesafios(ativo: boolean): UsoDesafios {
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const empresaId   = empresa?.id ?? null;
  const habilitado  = ativo && !!empresaId;

  const chave = useMemo(() => ['desafios', empresaId] as const, [empresaId]);

  const query = useQuery({
    queryKey: chave,
    enabled:  habilitado,
    queryFn:  () => listarDesafios(empresaId as string),
  });

  // Ativar ou encerrar uma campanha aparece para quem está com a aba aberta.
  useEffect(() => {
    if (!habilitado || !empresaId) return;
    return assinarTabela(
      {
        topico:  `desafios-${empresaId}`,
        escutas: [{ tabela: 'desafios', filtro: `empresa_id=eq.${empresaId}` }],
      },
      {
        onEvento:      () => { void queryClient.invalidateQueries({ queryKey: chave }); },
        onReconectado: () => { void queryClient.invalidateQueries({ queryKey: chave }); },
      },
    );
  }, [habilitado, empresaId, queryClient, chave]);

  const desafios = query.data?.data ?? SEM_DESAFIOS;

  const separados = useMemo(() => ({
    ativo:      desafios.find(d => d.status === 'ativo') ?? null,
    encerrados: desafios.filter(d => d.status === 'encerrado'),
    rascunhos:  desafios.filter(d => d.status === 'rascunho'),
  }), [desafios]);

  const recarregar = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: chave });
  }, [queryClient, chave]);

  return {
    desafios,
    ...separados,
    carregando: habilitado ? query.isPending : false,
    dbAtiva:    query.data?.dbAtiva ?? true,
    erro:       query.data?.error ?? (query.error instanceof Error ? query.error.message : null),
    recarregar,
  };
}

// ── O quadro de uma campanha ─────────────────────────────────────────────────

export interface UsoResultadoDesafio {
  resultado: ResultadoDesafio | null;
  carregando: boolean;
  erro: string | null;
}

/**
 * @param desafio  a campanha, ou `null` para não buscar nada.
 * @param filtroSetorId setor escolhido na régua do Analítico, para quem tem o
 *   nível `todos_setores`. `null` = a campanha inteira, como configurada.
 */
export function useResultadoDesafio(
  desafio: Desafio | null,
  filtroSetorId: string | null = null,
): UsoResultadoDesafio {
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const empresaId   = empresa?.id ?? null;
  const desafioId   = desafio?.id ?? null;

  const chave = useMemo(() => ['desafio-dados', desafioId] as const, [desafioId]);

  const query = useQuery({
    queryKey: chave,
    enabled:  !!desafioId,
    queryFn:  () => buscarDadosDesafio(desafioId as string),
  });

  /*
   * O mesmo canal do Analítico, por contagem de referências.
   *
   * Tópico e escutas idênticos aos de `useAnaliticoDashboard`: `assinarTabela`
   * avisa em DEV quando um tópico é reutilizado com escutas diferentes, e aqui
   * elas são as mesmas de propósito — é o ponto.
   */
  useEffect(() => {
    if (!desafioId || !empresaId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const invalidar = () => { void queryClient.invalidateQueries({ queryKey: chave }); };

    const cancelar = assinarTabela(
      {
        topico:  `analitico-dash-${empresaId}`,
        escutas: [{
          tabela: 'analitico_recebimentos',
          filtro: `empresa_id=eq.${empresaId}`,
        }],
      },
      {
        onEvento: () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => { debounce = null; invalidar(); }, DEBOUNCE_IMPORTACAO_MS);
        },
        // Já é uma invalidação — sem debounce, é evento único.
        onReconectado: invalidar,
      },
    );

    return () => {
      if (debounce) clearTimeout(debounce);
      cancelar();
    };
  }, [desafioId, empresaId, queryClient, chave]);

  const dados = query.data ?? SEM_DADOS;

  const resultado = useMemo<ResultadoDesafio | null>(() => {
    if (!desafio) return null;
    /*
     * Férias e desligamento somem do ranking pela MESMA regra do ranking do
     * Analítico. A situação vem carimbada em cada participante, e quem decide
     * o que ela significa continua sendo `idsOcultosRankingQuartil` — reescrever
     * `situacao !== 'ativo'` aqui seria a segunda cópia da regra.
     */
    const mapa: Record<string, SituacaoUsuario> = {};
    for (const p of dados.participantes) mapa[p.id] = p.situacao as SituacaoUsuario;

    return calcularDesafio({
      desafio,
      dados,
      ocultos: idsOcultosRankingQuartil(mapa),
      filtroSetorId,
    });
  }, [desafio, dados, filtroSetorId]);

  return {
    resultado,
    carregando: !!desafioId && query.isPending,
    erro: query.error instanceof Error ? query.error.message : null,
  };
}
