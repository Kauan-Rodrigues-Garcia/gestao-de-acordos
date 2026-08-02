import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { safeNum } from '@/lib/money';
import {
  deslocarMes, normalizarMes, primeiroDiaDoMes, ultimoDiaDoMes,
} from '@/lib/mesReferencia';
import type { MesAnteriorData } from './types';

/**
 * Acordos do mês por setor, o mês anterior para o comparativo e os
 * recebimentos Extra (PaguePlay).
 *
 * Tudo aqui é TABULAÇÃO — é a fonte certa para agendado, pendente, não pago e
 * quantidade de acordos. Os valores RECEBIDOS do painel não saem daqui: vêm do
 * relatório analítico (ver `PainelDiretoria/index.tsx`).
 *
 * @param mesRef mês a carregar (`yyyy-MM`). Antes era sempre `new Date()`, o
 *   que deixava o painel preso ao mês corrente — no dia 02 ele abre zerado e
 *   não havia como conferir o mês que fechou.
 */
export function useSetoresExtras(empresaId: string | undefined, isPP: boolean, mesRef?: string | null) {
  const [setoresDetalhes, setSetoresDetalhes] = useState<{ id: string; nome: string; acordos: any[] }[]>([]);
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
      const inicio = primeiroDiaDoMes(mes);
      const fim    = ultimoDiaDoMes(mes);
      const mesPrev    = deslocarMes(mes, -1);
      const inicioPrev = primeiroDiaDoMes(mesPrev);
      const fimPrev    = ultimoDiaDoMes(mesPrev);

      const [{ data: setoresData }, { data: acordosMesData }, { data: acordosPrevData }] = await Promise.all([
        supabase.from('setores').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('acordos').select('id, valor, status, tipo, setor_id, vencimento, tipo_vinculo')
          .eq('empresa_id', empresaId).neq('tipo_vinculo', 'extra')
          .gte('vencimento', inicio).lte('vencimento', fim),
        supabase.from('acordos').select('id, valor, status, vencimento, tipo_vinculo')
          .eq('empresa_id', empresaId).neq('tipo_vinculo', 'extra')
          .gte('vencimento', inicioPrev).lte('vencimento', fimPrev),
      ]);

      if (setoresData && acordosMesData) {
        const detalhes = (setoresData as { id: string; nome: string }[]).map(s => ({
          ...s,
          acordos: (acordosMesData as any[]).filter(a => a.setor_id === s.id),
        }));
        setSetoresDetalhes(detalhes);
      }

      if (acordosPrevData) {
        const prev = acordosPrevData as any[];
        const prevPagos = prev.filter(a => a.status === 'pago');
        setMesAnterior({
          valorAgendado: prev.reduce((s: number, a: any) => s + safeNum(a.valor), 0),
          // Mantido para o fallback de quando o analítico não está disponível;
          // o comparativo do painel usa o recebido do RELATÓRIO do mês anterior.
          valorRecebido: prevPagos.reduce((s: number, a: any) => s + safeNum(a.valor), 0),
          totalAcordos: prev.length,
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
    setoresDetalhes, loadingSetores, mesAnterior,
    extrasAcordos, extrasOperadoresMap, extrasOpEquipeMap, extrasEquipesMap, loadingExtras,
    reload,
  };
}
