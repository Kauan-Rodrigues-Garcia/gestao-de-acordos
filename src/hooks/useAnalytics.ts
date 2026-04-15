/**
 * useAnalytics.ts — ATUALIZADO
 * Adicionado: `acordosMes: Acordo[]` no retorno para o AnalyticsPanel calcular % por tipo.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Acordo } from '@/lib/supabase';
import { useRealtimeAcordos } from '@/providers/RealtimeAcordosProvider';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { getTodayISO } from '@/lib/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaInfo {
  id?: string;
  tipo: 'setor' | 'equipe' | 'operador';
  referencia_id: string;
  meta_valor: number;
  meta_acordos: number;
  mes: number;
  ano: number;
}

export interface AnalyticsData {
  // Valores monetários
  valorRecebidoMes: number;
  valorAgendadoMes: number;
  valorNaoPago: number;
  valorAgendadoHoje: number;

  // Quantidades
  totalAcordosMes: number;
  totalAcordosHoje: number;
  totalPagosMes: number;
  totalNaoPagos: number;
  totalPendentes: number;

  // Meta
  meta: MetaInfo | null;
  percMeta: number;
  percMetaAcordos: number;

  // Por status (para gráfico)
  porStatus: { name: string; value: number; color: string }[];

  // Por dia do mês (para gráfico de área)
  porDia: { dia: string; recebido: number; agendado: number }[];

  // Por equipe (admin/líder)
  porEquipe?: { nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // Por operador (admin/líder)
  porOperador?: { id: string; nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // NOVO: acordos do mês atual (para calcular % por tipo no painel)
  acordosMes: Acordo[];

  // Setores disponíveis para filtro (admin)
  setores: { id: string; nome: string }[];
  setorFiltro: string | null;
  setSetorFiltro: (id: string | null) => void;

  loading: boolean;
  refetch: () => void;
}

function getMesAtual() {
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

function primeiroDiaMes(): string {
  const { mes, ano } = getMesAtual();
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function ultimoDiaMes(): string {
  const { mes, ano } = getMesAtual();
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

function calcPerc(realizado: number, meta: number): number {
  if (!meta || meta <= 0) return 0;
  return Math.min(Math.round((realizado / meta) * 100), 999);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAnalytics(): AnalyticsData {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { subscribe, unsubscribe } = useRealtimeAcordos();
  // ID estável por instância
  const instanceId = useRef(`useAnalytics-${Math.random().toString(36).slice(2, 10)}`).current;
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [setorFiltro, setSetorFiltro] = useState<string | null>(null);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [metasEquipe, setMetasEquipe] = useState<MetaInfo[]>([]);
  const [metasOperador, setMetasOperador] = useState<MetaInfo[]>([]);
  const [operadoresMap, setOperadoresMap] = useState<Record<string, string>>({});
  const [equipesMap, setEquipesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { mes, ano } = getMesAtual();
  const inicio = primeiroDiaMes();
  const fim = ultimoDiaMes();
  const hoje = getTodayISO();

  const fetchAll = useCallback(async () => {
    if (!perfil || !empresa?.id) return;
    setLoading(true);
    const isAdmin = perfil.perfil === 'administrador' || perfil.perfil === 'super_admin';
    const isLider = perfil.perfil === 'lider';

    try {
      // ── Acordos conforme perfil ──────────────────────────────────────────────
      let q = supabase
        .from('acordos')
        .select('*')
        .eq('empresa_id', empresa.id);

      if (!isAdmin) {
        if (isLider && perfil.setor_id) {
          q = q.eq('setor_id', perfil.setor_id);
        } else {
          q = q.eq('operador_id', perfil.id);
        }
      } else if (setorFiltro) {
        // Admin filtrou por setor específico
        q = q.eq('setor_id', setorFiltro);
      }

      // Carregar setores para o filtro do admin
      if (isAdmin) {
        const { data: setoresData } = await supabase
          .from('setores')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .order('nome');
        setSetores((setoresData as { id: string; nome: string }[]) ?? []);
      }

      const { data: acordosData } = await q;
      setAcordos((acordosData as Acordo[]) || []);

      // ── Meta individual / setor ──────────────────────────────────────────────
      const tipoMeta = isAdmin ? null : isLider ? 'setor' : 'operador';
      const refId    = isLider ? perfil.setor_id : perfil.id;

      if (tipoMeta && refId) {
        const { data: metaData } = await supabase
          .from('metas')
          .select('*')
          .eq('tipo', tipoMeta)
          .eq('referencia_id', refId)
          .eq('empresa_id', empresa.id)
          .eq('mes', mes)
          .eq('ano', ano)
          .maybeSingle();
        setMeta(metaData as MetaInfo | null);
      }

      // ── Metas por equipe / operador (admin/líder) ────────────────────────────
      if (isAdmin || isLider) {
        const [{ data: meq }, { data: mop }] = await Promise.all([
          supabase
            .from('metas')
            .select('*')
            .eq('tipo', 'equipe')
            .eq('empresa_id', empresa.id)
            .eq('mes', mes)
            .eq('ano', ano),
          supabase
            .from('metas')
            .select('*')
            .eq('tipo', 'operador')
            .eq('empresa_id', empresa.id)
            .eq('mes', mes)
            .eq('ano', ano),
        ]);
        setMetasEquipe((meq as MetaInfo[]) || []);
        setMetasOperador((mop as MetaInfo[]) || []);

        // Mapas de nomes
        const [{ data: ops }, { data: eqs }] = await Promise.all([
          supabase
            .from('perfis')
            .select('id, nome')
            .eq('empresa_id', empresa.id)
            .eq('perfil', 'operador'),
          supabase
            .from('equipes')
            .select('id, nome')
            .eq('empresa_id', empresa.id),
        ]);

        const opMap: Record<string, string> = {};
        ((ops as { id: string; nome: string }[]) || []).forEach(o => { opMap[o.id] = o.nome; });
        setOperadoresMap(opMap);

        const eqMap: Record<string, string> = {};
        ((eqs as { id: string; nome: string }[]) || []).forEach(e => { eqMap[e.id] = e.nome; });
        setEquipesMap(eqMap);
      }
    } catch (err) {
      console.error('[useAnalytics] erro:', err);
    } finally {
      setLoading(false);
    }
  }, [perfil, empresa, mes, ano, setorFiltro]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Realtime: subscribe no canal central (sem canal próprio) ────────────────
  // Qualquer evento de acordos dispara um refetch completo das métricas analíticas
  useEffect(() => {
    subscribe(instanceId, () => { fetchAll(); });
    return () => unsubscribe(instanceId);
  }, [subscribe, unsubscribe, instanceId, fetchAll]);

  // ── Derivados computados ─────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const acordosMes = acordos.filter(
      a => a.vencimento >= inicio && a.vencimento <= fim,
    );
    const acordosHoje = acordosMes.filter(a => a.vencimento === hoje);
    const pagos       = acordosMes.filter(a => a.status === 'pago');
    const naoPagos    = acordosMes.filter(a => a.status === 'nao_pago');
    const pendentes   = acordosMes.filter(a => a.status === 'verificar_pendente');

    const valorRecebidoMes   = pagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorAgendadoMes   = acordosMes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorNaoPago       = naoPagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorAgendadoHoje  = acordosHoje.reduce((s, a) => s + (Number(a.valor) || 0), 0);

    const percMeta       = calcPerc(valorRecebidoMes, meta?.meta_valor ?? 0);
    const percMetaAcordos = calcPerc(pagos.length, meta?.meta_acordos ?? 0);

    // Por status
    const porStatus = [
      { name: 'Pago', value: pagos.length, color: 'hsl(var(--chart-2))' },
      { name: 'Pendente', value: pendentes.length, color: 'hsl(var(--chart-4))' },
      { name: 'Não Pago', value: naoPagos.length, color: 'hsl(var(--destructive))' },
    ].filter(s => s.value > 0);

    // Por dia do mês
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const porDia = Array.from({ length: diasNoMes }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${d}`;
      const doDia = acordosMes.filter(a => a.vencimento === iso);
      return {
        dia: String(i + 1),
        recebido:  doDia.filter(a => a.status === 'pago').reduce((s, a) => s + (Number(a.valor) || 0), 0),
        agendado:  doDia.reduce((s, a) => s + (Number(a.valor) || 0), 0),
      };
    });

    // Por equipe
    const porEquipe = Object.entries(
      acordosMes.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const eid = (a as any).equipe_id ?? 'sem_equipe';
          if (!acc[eid]) acc[eid] = { acordos: 0, valor: 0 };
          if (a.status === 'pago') { acc[eid].acordos++; acc[eid].valor += Number(a.valor) || 0; }
          return acc;
        }, {}
      )
    ).map(([eid, d]) => {
      const metaEq = metasEquipe.find(m => m.referencia_id === eid);
      return {
        nome: equipesMap[eid] ?? 'Sem equipe',
        acordos: d.acordos,
        valor: d.valor,
        meta: metaEq?.meta_valor ?? 0,
        perc: calcPerc(d.valor, metaEq?.meta_valor ?? 0),
      };
    }).sort((a, b) => b.valor - a.valor);

    // Por operador
    const porOperador = Object.entries(
      acordosMes.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const oid = (a as any).operador_id ?? 'desconhecido';
          if (!acc[oid]) acc[oid] = { acordos: 0, valor: 0 };
          if (a.status === 'pago') { acc[oid].acordos++; acc[oid].valor += Number(a.valor) || 0; }
          return acc;
        }, {}
      )
    ).map(([oid, d]) => {
      const metaOp = metasOperador.find(m => m.referencia_id === oid);
      return {
        id: oid,
        nome: operadoresMap[oid] ?? 'Operador',
        acordos: d.acordos,
        valor: d.valor,
        meta: metaOp?.meta_valor ?? 0,
        perc: calcPerc(d.valor, metaOp?.meta_valor ?? 0),
      };
    }).sort((a, b) => b.valor - a.valor);

    return {
      valorRecebidoMes,
      valorAgendadoMes,
      valorNaoPago,
      valorAgendadoHoje,
      totalAcordosMes: acordosMes.length,
      totalAcordosHoje: acordosHoje.length,
      totalPagosMes: pagos.length,
      totalNaoPagos: naoPagos.length,
      totalPendentes: pendentes.length,
      percMeta,
      percMetaAcordos,
      porStatus,
      porDia,
      porEquipe,
      porOperador,
      acordosMes, // NOVO: exportado para cálculo de tipo no painel
    };
  }, [acordos, meta, metasEquipe, metasOperador, operadoresMap, equipesMap, inicio, fim, hoje, mes, ano]);

  return {
    ...derived,
    meta,
    loading,
    refetch: fetchAll,
    setores,
    setorFiltro,
    setSetorFiltro,
  };
}
