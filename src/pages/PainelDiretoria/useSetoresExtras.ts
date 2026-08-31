import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { safeNum } from '@/lib/money';
import { deslocarMes, normalizarMes, primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import type { MesAnteriorData } from './types';

/**
 * Agregado do mês por setor, o mês anterior para o comparativo e os
 * recebimentos Extra (PaguePlay).
 *
 * Tudo aqui é TABULAÇÃO — é a fonte certa para agendado, agendado restante,
 * não pago e quantidade de acordos. Os valores RECEBIDOS do painel não saem
 * daqui: vêm do relatório analítico (ver `PainelDiretoria/index.tsx`).
 *
 * A soma acontece no BANCO, via `fn_diretoria_setores_do_mes`. Antes esta
 * função baixava todo acordo do mês e somava em JavaScript — e o `.select()`
 * não tinha paginação nem `order`, então o teto de 1000 linhas do PostgREST
 * cortava o mês numa fatia arbitrária. Com mais de 1000 acordos o painel
 * inteiro passava a mentir sem exibir erro nenhum: foi o que zerou o card
 * "Pendente" enquanto o agendado seguia mostrando número.
 *
 * @param mesRef mês a carregar (`yyyy-MM`). Antes era sempre `new Date()`, o
 *   que deixava o painel preso ao mês corrente — no dia 02 ele abre zerado e
 *   não havia como conferir o mês que fechou.
 */

/** Uma linha do agregado. `id` nulo é o balde dos acordos sem setor. */
export interface SetorAgregado {
  id: string | null;
  nome: string | null;
  totalAgendado: number;
  /** Recebido TABULADO. O painel troca pelo relatório quando ele existe. */
  totalRecebido: number;
  totalNaoPago: number;
  /** Agendado do mês que ainda não virou pago nem não pago. */
  totalRestante: number;
  totalAcordos: number;
  qtdRestante: number;
  porTipo: Record<string, { agendado: number; recebido: number; qtd: number }>;
}

interface LinhaRpc {
  setor_id: string | null;
  setor_nome: string | null;
  total_agendado: number | string | null;
  total_recebido: number | string | null;
  total_nao_pago: number | string | null;
  total_restante: number | string | null;
  total_acordos: number | string | null;
  qtd_restante: number | string | null;
  por_tipo: Record<string, { agendado: number; recebido: number; qtd: number }> | null;
}

function normalizar(linhas: LinhaRpc[]): SetorAgregado[] {
  return linhas.map(l => ({
    id:            l.setor_id,
    nome:          l.setor_nome,
    totalAgendado: safeNum(l.total_agendado),
    totalRecebido: safeNum(l.total_recebido),
    totalNaoPago:  safeNum(l.total_nao_pago),
    totalRestante: safeNum(l.total_restante),
    totalAcordos:  safeNum(l.total_acordos),
    qtdRestante:   safeNum(l.qtd_restante),
    porTipo:       l.por_tipo ?? {},
  }));
}

export function useSetoresExtras(empresaId: string | undefined, isPP: boolean, mesRef?: string | null) {
  const [setoresDetalhes, setSetoresDetalhes] = useState<SetorAgregado[]>([]);
  /** Acordos sem setor: não vira card, mas conta nos totais do painel. */
  const [semSetor, setSemSetor] = useState<SetorAgregado | null>(null);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [mesAnterior, setMesAnterior] = useState<MesAnteriorData | null>(null);

  const [extrasAcordos, setExtrasAcordos] = useState<any[]>([]);
  const [extrasOperadoresMap, setExtrasOperadoresMap] = useState<Map<string, string>>(new Map());
  const [extrasOpEquipeMap, setExtrasOpEquipeMap] = useState<Map<string, string>>(new Map());
  const [extrasEquipesMap, setExtrasEquipesMap] = useState<Map<string, string>>(new Map());
  const [loadingExtras, setLoadingExtras] = useState(false);

  const mes = normalizarMes(mesRef);

  const carregarSetoresDetalhes = useCallback(async () => {
    if (!empresaId) return;
    setLoadingSetores(true);
    try {
      const mesPrev = deslocarMes(mes, -1);

      const [atual, anterior] = await Promise.all([
        supabase.rpc('fn_diretoria_setores_do_mes', { p_empresa_id: empresaId, p_mes: mes }),
        supabase.rpc('fn_diretoria_setores_do_mes', { p_empresa_id: empresaId, p_mes: mesPrev }),
      ]);

      if (atual.error) throw atual.error;

      const linhas = normalizar((atual.data ?? []) as unknown as LinhaRpc[]);
      setSetoresDetalhes(linhas.filter(l => l.id !== null));
      setSemSetor(linhas.find(l => l.id === null) ?? null);

      if (!anterior.error) {
        // Soma TODAS as linhas, inclusive a de sem setor: o comparativo é do
        // mês inteiro, não do que coube em card.
        const prev = normalizar((anterior.data ?? []) as unknown as LinhaRpc[]);
        setMesAnterior({
          valorAgendado: prev.reduce((s, l) => s + l.totalAgendado, 0),
          // Fallback de quando o analítico não está disponível; o comparativo
          // do painel usa o recebido do RELATÓRIO do mês anterior.
          valorRecebido: prev.reduce((s, l) => s + l.totalRecebido, 0),
          totalAcordos:  prev.reduce((s, l) => s + l.totalAcordos, 0),
        });
      }
    } catch (err) {
      console.error('[PainelDiretoria] erro ao carregar setores:', err);
    } finally {
      setLoadingSetores(false);
    }
  }, [empresaId, mes]);

  const carregarExtras = useCallback(async () => {
    if (!empresaId || !isPP) return;
    setLoadingExtras(true);
    try {
      const inicio = primeiroDiaDoMes(mes);
      const fim    = ultimoDiaDoMes(mes);

      const { data: extrasData } = await supabase
        .from('acordos')
        .select('id, valor, status, tipo, setor_id, operador_id, tipo_vinculo, vencimento')
        .eq('empresa_id', empresaId).eq('tipo_vinculo', 'extra')
        .gte('vencimento', inicio).lte('vencimento', fim);

      if (extrasData) {
        const acordos = extrasData as any[];
        setExtrasAcordos(acordos);

        const opIds = [...new Set(acordos.map((a: any) => a.operador_id).filter(Boolean))];
        if (opIds.length > 0) {
          const { data: perfisData } = await supabase.from('perfis').select('id, nome, equipe_id').in('id', opIds);
          if (perfisData) {
            const pList = perfisData as { id: string; nome: string; equipe_id: string | null }[];
            setExtrasOperadoresMap(new Map(pList.map(p => [p.id, p.nome])));
            setExtrasOpEquipeMap(new Map(pList.filter(p => p.equipe_id).map(p => [p.id, p.equipe_id!])));

            const eqIds = [...new Set(pList.map(p => p.equipe_id).filter(Boolean))] as string[];
            if (eqIds.length > 0) {
              const { data: equipeData } = await supabase.from('equipes').select('id, nome').in('id', eqIds);
              if (equipeData) {
                setExtrasEquipesMap(new Map((equipeData as { id: string; nome: string }[]).map(e => [e.id, e.nome])));
              }
            } else {
              setExtrasEquipesMap(new Map());
            }
          }
        } else {
          setExtrasOperadoresMap(new Map());
          setExtrasOpEquipeMap(new Map());
          setExtrasEquipesMap(new Map());
        }
      }
    } catch (err) {
      console.error('[PainelDiretoria] erro ao carregar extras:', err);
    } finally {
      setLoadingExtras(false);
    }
  }, [empresaId, isPP, mes]);

  useEffect(() => { carregarSetoresDetalhes(); }, [carregarSetoresDetalhes]);
  useEffect(() => { carregarExtras(); }, [carregarExtras]);

  function reload() {
    carregarSetoresDetalhes();
    carregarExtras();
  }

  return {
    setoresDetalhes, semSetor, loadingSetores, mesAnterior,
    extrasAcordos, extrasOperadoresMap, extrasOpEquipeMap, extrasEquipesMap, loadingExtras,
    reload,
  };
}
