/**
 * useAnaliticoDashboard — recebimento do mês vindo do relatório ANALÍTICO
 * (analitico_recebimentos) para o dashboard PaguePlay.
 *
 * Diferente da tabulação manual, o analítico é a fonte "certeira": o
 * recebido no mês, o gráfico por dia, Pix vs Cartão e o total não tabulado
 * passam a vir daqui. O escopo é resolvido no servidor
 * (fn_analitico_dashboard_mes): operador → próprias linhas; líder+ → empresa.
 *
 * Atualiza em tempo real quando um novo relatório analítico é importado.
 *
 * ## Deduplicação (performance)
 *
 * Dois componentes montam este hook ao mesmo tempo — `AnalyticsPanel` e
 * `MetaProgressoHeader`. Na versão anterior (useState + useEffect) cada um fazia
 * a SUA busca paginada do mês e abria o SEU canal de realtime: tudo em dobro, e
 * em dobro outra vez a cada importação. O `canalId` aleatório que existia aqui
 * tratava a colisão de tópico, não a duplicação do trabalho.
 *
 * Agora:
 *   • os dados vêm de `useQuery` com a chave ['analitico-dashboard', empresa, mês]
 *     — N consumidores da mesma chave compartilham UMA requisição e UM cache;
 *   • o realtime é um único canal por empresa, com contagem de referências
 *     (`assinarAnaliticoRealtime`), que invalida a chave em vez de refazer o
 *     fetch por conta própria.
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { useEmpresa } from '@/hooks/useEmpresa';
import { normalizarMes } from '@/lib/mesReferencia';
import { buscarAnaliticoDashboardMes } from '@/services/analitico/analitico.service';

export interface AgregadoAnalitico {
  bruto: number;
  ho: number;
  qtd: number;
  pixBruto: number;
  pixHO: number;
  cartaoBruto: number;
  cartaoHO: number;
  naoTabuladoBruto: number;
  naoTabuladoHO: number;
  naoTabuladoQtd: number;
  /** dia do mês (1..31) → { bruto, ho } */
  porDia: Record<number, { bruto: number; ho: number }>;
  /** operador_id → { bruto, ho, qtd } (líder+ recebe todos; operador só a si) */
  porOperador: Record<string, { bruto: number; ho: number; qtd: number }>;
  /** rótulo da forma (forma_detalhe; fallback boleto_pix/cartao) → { bruto, qtd } */
  porForma: Record<string, { bruto: number; qtd: number }>;
}

/**
 * Agrega as linhas da RPC; `filtro` restringe a um operador ou a um conjunto
 * (equipe/setor). `incluirSemOperador` soma também as linhas órfãs
 * (operador_id null) — regra do consolidado de SETOR; equipe/operador não.
 */
export function agregarAnalitico(
  linhas: AnaliticoDashboardLinha[],
  filtro?: string | Set<string> | null,
  incluirSemOperador = false,
): AgregadoAnalitico {
  const pertence = (id: string | null): boolean =>
    !filtro ? true
    : id === null ? incluirSemOperador
    : typeof filtro === 'string' ? id === filtro
    : filtro.has(id);
  const agg: AgregadoAnalitico = {
    bruto: 0, ho: 0, qtd: 0,
    pixBruto: 0, pixHO: 0, cartaoBruto: 0, cartaoHO: 0,
    naoTabuladoBruto: 0, naoTabuladoHO: 0, naoTabuladoQtd: 0,
    porDia: {}, porOperador: {}, porForma: {},
  };
  for (const l of linhas) {
    if (!pertence(l.operador_id)) continue;
    const total = Number(l.total) || 0;
    const ho    = Number(l.total_ho) || 0;
    const qtd   = Number(l.qtd) || 0;

    agg.bruto += total; agg.ho += ho; agg.qtd += qtd;

    if (l.forma_pagamento === 'cartao') { agg.cartaoBruto += total; agg.cartaoHO += ho; }
    else                                { agg.pixBruto    += total; agg.pixHO    += ho; }

    // Rótulo real (BookPlay); PaguePlay cai no consolidado boleto_pix/cartao
    const rotulo = l.forma_detalhe
      ?? (l.forma_pagamento === 'cartao' ? 'Cartão' : 'Pix/Boleto');
    if (!agg.porForma[rotulo]) agg.porForma[rotulo] = { bruto: 0, qtd: 0 };
    agg.porForma[rotulo].bruto += total;
    agg.porForma[rotulo].qtd  += qtd;

    if (l.status_tabulacao === 'nao_tabulado') {
      agg.naoTabuladoBruto += total; agg.naoTabuladoHO += ho; agg.naoTabuladoQtd += qtd;
    }

    const diaNum = Number(l.dia.slice(8, 10));
    if (!agg.porDia[diaNum]) agg.porDia[diaNum] = { bruto: 0, ho: 0 };
    agg.porDia[diaNum].bruto += total;
    agg.porDia[diaNum].ho    += ho;

    if (l.operador_id) {
      if (!agg.porOperador[l.operador_id]) agg.porOperador[l.operador_id] = { bruto: 0, ho: 0, qtd: 0 };
      const op = agg.porOperador[l.operador_id];
      op.bruto += total; op.ho += ho; op.qtd += qtd;
    }
  }
  return agg;
}


// ── Realtime compartilhado ───────────────────────────────────────────────────
// A dedução por tópico e a contagem de referências que existiam aqui viraram
// `assinarTabela` (src/lib/realtime.ts), que faz o mesmo para todo o app e ainda
// reconecta. Sobra o debounce, que é específico daqui: a importação insere EM
// LOTE (um evento por linha) e queremos um único disparo por importação.
const DEBOUNCE_IMPORTACAO_MS = 1_500;

// ── Hook ─────────────────────────────────────────────────────────────────────

interface ResultadoDashboard {
  linhas:  AnaliticoDashboardLinha[];
  dbAtiva: boolean;
}

/** Referência estável para o caso "sem dados" — evita novo array a cada render
 *  (o que invalidaria o useMemo de `total` sem que nada tenha mudado). */
const SEM_LINHAS: AnaliticoDashboardLinha[] = [];

/**
 * @param mesRef mês a buscar (`yyyy-MM`). Omitido = mês corrente. O mês entra na
 *   chave do cache, então trocar de mês é uma entrada nova — voltar para o mês
 *   anterior já visto é instantâneo, sem ida ao banco.
 */
export function useAnaliticoDashboard(ativo: boolean, mesRef?: string | null) {
  const { empresa }  = useEmpresa();
  const queryClient  = useQueryClient();
  const mes          = normalizarMes(mesRef);
  const empresaId    = empresa?.id ?? null;
  const habilitado   = ativo && !!empresaId;

  // Chave compartilhada: os dois consumidores caem na MESMA entrada de cache,
  // então a busca paginada do mês acontece uma vez só.
  const chave = useMemo(
    () => ['analitico-dashboard', empresaId, mes] as const,
    [empresaId, mes],
  );

  const query = useQuery<ResultadoDashboard>({
    queryKey: chave,
    enabled:  habilitado,
    queryFn:  async () => {
      const { data, dbAtiva } = await buscarAnaliticoDashboardMes(empresaId as string, mes);
      return { linhas: data, dbAtiva };
    },
  });

  const dbAtiva = query.data?.dbAtiva ?? true;

  // Novo relatório importado → invalida a chave. Quem estiver montado refaz UMA
  // busca (o React Query agrupa), em vez de uma por componente.
  useEffect(() => {
    if (!habilitado || !empresaId || !dbAtiva) return;

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
  }, [habilitado, empresaId, dbAtiva, queryClient, chave]);

  const linhas = query.data?.linhas ?? SEM_LINHAS;
  const total  = useMemo(() => agregarAnalitico(linhas), [linhas]);

  const refetch = useCallback(async () => { await query.refetch(); }, [query]);

  return {
    linhas,
    total,
    // Desabilitado conta como "carregado" — é o que a versão anterior fazia, e o
    // consumidor usa isso para decidir quando esconder o skeleton.
    carregado: habilitado ? query.isFetched : true,
    dbAtiva,
    refetch,
  };
}
