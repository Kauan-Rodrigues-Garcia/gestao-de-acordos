import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { safeNum } from '@/lib/money';
import type { MesAnteriorData } from './types';

export function useSetoresExtras(empresaId: string | undefined, isPP: boolean) {
  const [setoresDetalhes, setSetoresDetalhes] = useState<{ id: string; nome: string; acordos: any[] }[]>([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [mesAnterior, setMesAnterior] = useState<MesAnteriorData | null>(null);

  const [extrasAcordos, setExtrasAcordos] = useState<any[]>([]);
  const [extrasOperadoresMap, setExtrasOperadoresMap] = useState<Map<string, string>>(new Map());
  const [extrasOpEquipeMap, setExtrasOpEquipeMap] = useState<Map<string, string>>(new Map());
  const [extrasEquipesMap, setExtrasEquipesMap] = useState<Map<string, string>>(new Map());
  const [loadingExtras, setLoadingExtras] = useState(false);

  const carregarSetoresDetalhes = useCallback(async () => {
    if (!empresaId) return;
    setLoadingSetores(true);
    try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const inicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
      const ultimoDia = new Date(anoAtual, mesAtual, 0).getDate();
      const fim = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

      const mesPrev = mesAtual === 1 ? 12 : mesAtual - 1;
      const anoPrev = mesAtual === 1 ? anoAtual - 1 : anoAtual;
      const inicioPrev = `${anoPrev}-${String(mesPrev).padStart(2, '0')}-01`;
      const ultimoDiaPrev = new Date(anoPrev, mesPrev, 0).getDate();
      const fimPrev = `${anoPrev}-${String(mesPrev).padStart(2, '0')}-${String(ultimoDiaPrev).padStart(2, '0')}`;

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
          valorRecebido: prevPagos.reduce((s: number, a: any) => s + safeNum(a.valor), 0),
          totalAcordos: prev.length,
        });
      }
    } catch (err) {
      console.error('[PainelDiretoria] erro ao carregar setores:', err);
    } finally {
      setLoadingSetores(false);
    }
  }, [empresaId]);

  const carregarExtras = useCallback(async () => {
    if (!empresaId || !isPP) return;
    setLoadingExtras(true);
    try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const inicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
      const ultimoDia = new Date(anoAtual, mesAtual, 0).getDate();
      const fim = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

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
  }, [empresaId, isPP]);

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
