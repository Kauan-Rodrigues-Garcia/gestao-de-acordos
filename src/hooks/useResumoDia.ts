import { useState, useEffect, useCallback } from 'react';
import { supabase, Acordo, AcordoTag } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { getTodayISO, PP_HO_PERCENTUAL, isPerfilAdmin, isPerfilLider } from '@/lib/index';

export interface ResumoDiaData {
  valorRecebido: number;
  valorHO: number;
  valorDireto: number;
  valorExtra: number;
  valorHODireto: number;
  valorHOExtra: number;
  qtdFormalizados: number;
  qtdPagos: number;
  totalHoje: number;
  taxaEficiencia: number;
  porTag: { tagId: string; nome: string; cor: string; valor: number; qtd: number }[];
}

export interface OperadorItem { id: string; nome: string; }

const EMPTY: ResumoDiaData = {
  valorRecebido: 0, valorHO: 0, valorDireto: 0, valorExtra: 0,
  valorHODireto: 0, valorHOExtra: 0, qtdFormalizados: 0,
  qtdPagos: 0, totalHoje: 0, taxaEficiencia: 0, porTag: [],
};

function getTomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d);
}

export function useResumoDia({
  selectedOperadorId,
  temLogicaDiretoExtra = false,
  tags,
}: {
  selectedOperadorId?: string | null;
  temLogicaDiretoExtra?: boolean;
  tags: AcordoTag[];
}) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const [data, setData] = useState<ResumoDiaData>(EMPTY);
  const [operadores, setOperadores] = useState<OperadorItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!perfil || !empresa?.id) { setLoading(false); return; }
    setLoading(true);

    const hoje = getTodayISO();
    const amanha = getTomorrowISO();
    const _isAdmin = isPerfilAdmin(perfil.perfil);
    const _isLider = isPerfilLider(perfil.perfil);
    const _isDiretoria = perfil.perfil === 'diretoria';
    const _podeVerTodos = _isAdmin || _isLider || _isDiretoria;

    try {
      // ── Operadores para o seletor ────────────────────────────────────────
      if (_podeVerTodos) {
        let opQ = supabase
          .from('perfis')
          .select('id, nome, equipe_id')
          .eq('empresa_id', empresa.id)
          .in('perfil', ['operador', 'elite', 'gerencia'])
          .order('nome');

        // Líder/Elite/Gerencia: apenas operadores do seu setor
        if (_isLider && !_isAdmin && !_isDiretoria && perfil.setor_id) {
          const { data: eqs } = await supabase
            .from('equipes')
            .select('id')
            .eq('empresa_id', empresa.id)
            .eq('setor_id', perfil.setor_id);
          const eqIds = ((eqs as { id: string }[]) || []).map(e => e.id);
          if (eqIds.length > 0) {
            opQ = (opQ as any).in('equipe_id', eqIds);
          }
        }

        const { data: ops } = await opQ;
        setOperadores(((ops as { id: string; nome: string }[]) || []).map(o => ({ id: o.id, nome: o.nome })));
      }

      // ── Aplica escopo de perfil à query ──────────────────────────────────
      function applyScope(q: ReturnType<typeof supabase.from>) {
        if (_isAdmin || _isDiretoria) {
          return selectedOperadorId ? (q as any).eq('operador_id', selectedOperadorId) : q;
        }
        if (_isLider) {
          if (selectedOperadorId) return (q as any).eq('operador_id', selectedOperadorId);
          if (perfil.setor_id) return (q as any).eq('setor_id', perfil.setor_id);
          return (q as any).eq('operador_id', perfil.id);
        }
        return (q as any).eq('operador_id', perfil.id);
      }

      // ── Acordos pagos hoje via pago_em (independe do vencimento) ───────────
      // pago_em é TIMESTAMPTZ em UTC; usamos range para cobrir o dia Brasil (UTC-3)
      const { data: pagosHojeData } = await applyScope(
        supabase
          .from('acordos')
          .select('*')
          .eq('empresa_id', empresa.id)
          .eq('status', 'pago')
          .gte('pago_em', `${hoje}T00:00:00`)
          .lt('pago_em', `${amanha}T00:00:00`)
      );

      // ── Acordos com vencimento hoje (para taxa de eficiência) ────────────
      const { data: agendadosHojeData } = await applyScope(
        supabase.from('acordos').select('id, status').eq('empresa_id', empresa.id).eq('vencimento', hoje)
      );

      // ── Acordos formalizados hoje (criados hoje) ─────────────────────────
      const { data: formalizadosData } = await applyScope(
        supabase
          .from('acordos')
          .select('id')
          .eq('empresa_id', empresa.id)
          .gte('criado_em', `${hoje}T00:00:00`)
          .lt('criado_em', `${amanha}T00:00:00`)
      );

      // ── Métricas ─────────────────────────────────────────────────────────
      // pagos hoje = acordos com pago_em hoje (qualquer vencimento)
      const pagos = (pagosHojeData as Acordo[]) || [];
      // agendados hoje = acordos com vencimento hoje (para cálculo de eficiência)
      const agendadosHoje = (agendadosHojeData as { id: string; status: string }[]) || [];

      const valorRecebido = pagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
      let valorDireto = 0, valorExtra = 0;

      if (temLogicaDiretoExtra) {
        const direto = pagos.filter(a => a.tipo_vinculo !== 'extra');
        const extra = pagos.filter(a => a.tipo_vinculo === 'extra');
        valorDireto = direto.reduce((s, a) => s + (Number(a.valor) || 0), 0);
        valorExtra = extra.reduce((s, a) => s + (Number(a.valor) || 0), 0);
      }

      // ── Recebimento por tag ───────────────────────────────────────────────
      const tagMap: Record<string, { valor: number; qtd: number }> = {};
      for (const a of pagos) {
        const tagIds = a.tag_ids;
        if (!tagIds?.length) {
          if (!tagMap['__none']) tagMap['__none'] = { valor: 0, qtd: 0 };
          tagMap['__none'].valor += Number(a.valor) || 0;
          tagMap['__none'].qtd++;
        } else {
          for (const tid of tagIds) {
            if (!tagMap[tid]) tagMap[tid] = { valor: 0, qtd: 0 };
            tagMap[tid].valor += Number(a.valor) || 0;
            tagMap[tid].qtd++;
          }
        }
      }

      const porTag = Object.entries(tagMap)
        .map(([tagId, d]) => {
          if (tagId === '__none') return { tagId, nome: 'Sem tag', cor: '#6b7280', ...d };
          const tag = tags.find(t => t.id === tagId);
          return { tagId, nome: tag?.nome ?? 'Tag', cor: tag?.cor ?? '#6366f1', ...d };
        })
        .sort((a, b) => b.valor - a.valor);

      const qtdFormalizados = (formalizadosData || []).length;
      const qtdPagos = pagos.length;
      const totalHoje = agendadosHoje.length;

      setData({
        valorRecebido,
        valorHO: valorRecebido * PP_HO_PERCENTUAL,
        valorDireto,
        valorExtra,
        valorHODireto: valorDireto * PP_HO_PERCENTUAL,
        valorHOExtra: valorExtra * PP_HO_PERCENTUAL,
        qtdFormalizados,
        qtdPagos,
        totalHoje,
        taxaEficiencia: totalHoje > 0 ? Math.round((qtdPagos / totalHoje) * 100) : 0,
        porTag,
      });
    } catch (err) {
      console.error('[useResumoDia]', err);
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [perfil, empresa?.id, selectedOperadorId, temLogicaDiretoExtra, tags]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, operadores, loading, refetch: fetch };
}
