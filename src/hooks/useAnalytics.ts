/**
 * useAnalytics.ts
 * Hook centralizado para dados analíticos por perfil.
 * - Operador: dados próprios
 * - Líder: setor + equipe
 * - Admin: todos os setores + equipes + operadores
 * Atualiza em tempo real via Supabase Realtime.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, Acordo, Setor } from '@/lib/supabase';
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
  valorRecebidoMes: number;       // R$ pagos no mês atual
  valorAgendadoMes: number;       // R$ total agendado p/ o mês
  valorNaoPago: number;           // R$ em não-pagos
  valorAgendadoHoje: number;      // R$ agendado p/ hoje

  // Quantidades
  totalAcordosMes: number;        // qtd acordos no mês
  totalAcordosHoje: number;       // qtd acordos hoje
  totalPagosMes: number;          // qtd pagos no mês
  totalNaoPagos: number;          // qtd não-pagos totais
  totalPendentes: number;         // qtd pendentes (verificar)

  // Meta
  meta: MetaInfo | null;
  percMeta: number;               // % da meta de valor atingida
  percMetaAcordos: number;        // % da meta de qtd atingida

  // Por status (para gráfico)
  porStatus: { name: string; value: number; color: string }[];

  // Por dia do mês (para gráfico de linha)
  porDia: { dia: string; recebido: number; agendado: number }[];

  // Por equipe (admin/líder)
  porEquipe?: { nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // Por operador (admin/líder)
  porOperador?: { id: string; nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  loading: boolean;
  refetch: () => void;
}

const HOJE = getTodayISO();

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
  const [acordos, setAcordos] = useState<Acordo[]>([]);
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
      // ── Buscar acordos conforme perfil ──────────────────────────────────────
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
      }

      const { data: acordosData } = await q;
      setAcordos((acordosData as Acordo[]) || []);

      // ── Meta individual / setor / equipe ────────────────────────────────────
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

      // ── Metas por equipe e por operador (admin/líder) ───────────────────────
      if (isAdmin || isLider) {
        const [{ data: mEq }, { data: mOp }] = await Promise.all([
          supabase.from('metas').select('*').eq('tipo', 'equipe').eq('empresa_id', empresa.id).eq('mes', mes).eq('ano', ano),
          supabase.from('metas').select('*').eq('tipo', 'operador').eq('empresa_id', empresa.id).eq('mes', mes).eq('ano', ano),
        ]);
        setMetasEquipe((mEq as MetaInfo[]) || []);
        setMetasOperador((mOp as MetaInfo[]) || []);

        // Nomes operadores
        const { data: ops } = await supabase
          .from('perfis').select('id, nome, equipe_id')
          .eq('empresa_id', empresa.id)
          .eq('perfil', 'operador');
        const om: Record<string, string> = {};
        const eq: Record<string, string> = {};
        (ops || []).forEach((o: any) => { om[o.id] = o.nome; });
        setOperadoresMap(om);

        // Nomes equipes
        const { data: eqs } = await supabase
          .from('equipes').select('id, nome')
          .eq('empresa_id', empresa.id);
        (eqs || []).forEach((e: any) => { eq[e.id] = e.nome; });
        setEquipesMap(eq);
      }
    } finally {
      setLoading(false);
    }
  }, [perfil?.id, empresa?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime — recarregar ao mudar acordos ou metas
  useEffect(() => {
    if (!empresa?.id) return;
    const ch1 = supabase.channel('analytics-acordos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acordos', filter: `empresa_id=eq.${empresa.id}` }, fetchAll)
      .subscribe();
    const ch2 = supabase.channel('analytics-metas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metas', filter: `empresa_id=eq.${empresa.id}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [empresa?.id, fetchAll]);

  // ── Computar métricas ──────────────────────────────────────────────────────
  const metricas = useMemo(() => {
    const acordosMes   = acordos.filter(a => a.vencimento >= inicio && a.vencimento <= fim);
    const acordosHoje2 = acordos.filter(a => a.vencimento === hoje);

    const valorRecebidoMes  = acordosMes.filter(a => a.status === 'pago').reduce((s, a) => s + Number(a.valor), 0);
    const valorAgendadoMes  = acordosMes.reduce((s, a) => s + Number(a.valor), 0);
    const valorNaoPago      = acordos.filter(a => a.status === 'nao_pago').reduce((s, a) => s + Number(a.valor), 0);
    const valorAgendadoHoje = acordosHoje2.reduce((s, a) => s + Number(a.valor), 0);

    const totalAcordosMes  = acordosMes.length;
    const totalAcordosHoje = acordosHoje2.length;
    const totalPagosMes    = acordosMes.filter(a => a.status === 'pago').length;
    const totalNaoPagos    = acordos.filter(a => a.status === 'nao_pago').length;
    const totalPendentes   = acordos.filter(a => a.status === 'verificar_pendente').length;

    const percMeta        = calcPerc(valorRecebidoMes,  meta?.meta_valor  || 0);
    const percMetaAcordos = calcPerc(totalPagosMes,     meta?.meta_acordos || 0);

    // Por status (gráfico pizza)
    const porStatus = [
      { name: 'Pago', value: acordos.filter(a => a.status === 'pago').length, color: 'hsl(var(--chart-2))' },
      { name: 'Pendente', value: totalPendentes, color: 'hsl(var(--chart-4))' },
      { name: 'Não Pago', value: totalNaoPagos, color: 'hsl(var(--chart-1))' },
    ].filter(d => d.value > 0);

    // Por dia do mês (gráfico linha — últimos 30 dias)
    const diasMap: Record<string, { recebido: number; agendado: number }> = {};
    acordosMes.forEach(a => {
      const d = a.vencimento.slice(8, 10);
      if (!diasMap[d]) diasMap[d] = { recebido: 0, agendado: 0 };
      diasMap[d].agendado += Number(a.valor);
      if (a.status === 'pago') diasMap[d].recebido += Number(a.valor);
    });
    const porDia = Object.entries(diasMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => ({ dia, ...v }));

    // Por operador (admin/líder)
    const porOperador = Object.entries(operadoresMap).map(([id, nome]) => {
      const ops = acordosMes.filter(a => a.operador_id === id);
      const valor = ops.filter(a => a.status === 'pago').reduce((s, a) => s + Number(a.valor), 0);
      const metaOp = metasOperador.find(m => m.referencia_id === id);
      return { id, nome, acordos: ops.length, valor, meta: metaOp?.meta_valor || 0, perc: calcPerc(valor, metaOp?.meta_valor || 0) };
    }).sort((a, b) => b.valor - a.valor);

    // Por equipe
    const porEquipe = Object.entries(equipesMap).map(([id, nome]) => {
      const eqAcordos = acordosMes.filter(a => (a as any).equipe_id === id);
      const valor = eqAcordos.filter(a => a.status === 'pago').reduce((s, a) => s + Number(a.valor), 0);
      const metaEq = metasEquipe.find(m => m.referencia_id === id);
      return { nome, acordos: eqAcordos.length, valor, meta: metaEq?.meta_valor || 0, perc: calcPerc(valor, metaEq?.meta_valor || 0) };
    });

    return {
      valorRecebidoMes, valorAgendadoMes, valorNaoPago, valorAgendadoHoje,
      totalAcordosMes, totalAcordosHoje, totalPagosMes, totalNaoPagos, totalPendentes,
      percMeta, percMetaAcordos, porStatus, porDia,
      porOperador: porOperador.length > 0 ? porOperador : undefined,
      porEquipe:   porEquipe.length   > 0 ? porEquipe   : undefined,
    };
  }, [acordos, meta, metasEquipe, metasOperador, operadoresMap, equipesMap, inicio, fim, hoje]);

  return { ...metricas, meta, loading, refetch: fetchAll };
}
