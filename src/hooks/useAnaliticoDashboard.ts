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
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
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

/** Agrega as linhas da RPC; `filtro` restringe a um operador ou a um conjunto (equipe/setor). */
export function agregarAnalitico(
  linhas: AnaliticoDashboardLinha[],
  filtro?: string | Set<string> | null,
): AgregadoAnalitico {
  const pertence = (id: string | null): boolean =>
    !filtro ? true
    : typeof filtro === 'string' ? id === filtro
    : id !== null && filtro.has(id);
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

function mesAtualStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function useAnaliticoDashboard(ativo: boolean) {
  const { empresa } = useEmpresa();
  const [linhas, setLinhas]     = useState<AnaliticoDashboardLinha[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [dbAtiva, setDbAtiva]   = useState(true);
  const mes = mesAtualStr();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sufixo único por instância — evita colisão de tópico quando o Dashboard
  // monta mais de um consumidor (painel + header de progresso)
  const canalId = useRef(Math.random().toString(36).slice(2, 8)).current;

  const fetchDados = useCallback(async () => {
    if (!ativo || !empresa?.id) { setLinhas([]); setCarregado(true); return; }
    const { data, dbAtiva: ok } = await buscarAnaliticoDashboardMes(empresa.id, mes);
    setLinhas(data);
    setDbAtiva(ok);
    setCarregado(true);
  }, [ativo, empresa?.id, mes]);

  useEffect(() => { void fetchDados(); }, [fetchDados]);

  // Realtime: novo relatório analítico importado → refetch (com debounce,
  // pois a importação insere em lote)
  useEffect(() => {
    if (!ativo || !empresa?.id || !dbAtiva) return;
    const channel = supabase
      .channel(`analitico-dash-${empresa.id}-${canalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'analitico_recebimentos', filter: `empresa_id=eq.${empresa.id}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => { void fetchDados(); }, 1500);
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [ativo, empresa?.id, dbAtiva, fetchDados, canalId]);

  const total = useMemo(() => agregarAnalitico(linhas), [linhas]);

  return { linhas, total, carregado, dbAtiva, refetch: fetchDados };
}
