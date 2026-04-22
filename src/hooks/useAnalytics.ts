/**
 * useAnalytics.ts — ATUALIZADO
 * Adicionado: `acordosMes: Acordo[]` no retorno para o AnalyticsPanel calcular % por tipo.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, Acordo } from '@/lib/supabase';
import { useRealtimeAcordos } from '@/providers/RealtimeAcordosProvider';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { getTodayISO, isPerfilAdmin, isPerfilLider, isPerfilDiretoria, PP_HO_PERCENTUAL, isPaguePlay } from '@/lib/index';

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

  // "Agendado restante no mês" — acordos PENDENTES (status='verificar_pendente')
  // com vencimento no mês atual e ainda não resolvidos (exclui pago e não pago).
  // Usado apenas em PaguePlay/Bookplay.
  valorAgendadoRestanteMes: number;
  totalAgendadoRestanteMes: number;

  // H.O. — Honorários Operacionais PaguePlay (24,96% do bruto recebido)
  // Disponível para todos, mas só relevante para PaguePlay
  valorHOMes: number;        // H.O. do total recebido no mês
  valorHOAgendado: number;   // H.O. do total agendado no mês
  valorHONaoPago: number;    // H.O. do total não pago

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
  porStatus: { name: string; value: number; color: string; icon: string }[];

  // Por dia do mês (para gráfico de área)
  porDia: { dia: string; recebido: number; agendado: number; ho: number }[];

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

  // Filtro por equipe (Líder/Elite: visão de equipe específica)
  equipeFiltro: string | null;
  setEquipeFiltro: (id: string | null) => void;
  // Equipes do setor do lider/elite (carregadas dinamicamente)
  equipesDoSetor: { id: string; nome: string }[];

  // Filtro por operador (Elite em visão individual)
  operadorFiltro: string | null;
  setOperadorFiltro: (id: string | null) => void;

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
  const { empresa, tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug ?? '');
  const { subscribe, unsubscribe } = useRealtimeAcordos();
  // ID estável por instância
  const instanceId = useRef(`useAnalytics-${Math.random().toString(36).slice(2, 10)}`).current;
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [setorFiltro, setSetorFiltro] = useState<string | null>(null);
  const [equipeFiltro, setEquipeFiltro] = useState<string | null>(null);
  const [operadorFiltro, setOperadorFiltro] = useState<string | null>(null);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [equipesDoSetor, setEquipesDoSetor] = useState<{ id: string; nome: string }[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [metasEquipe, setMetasEquipe] = useState<MetaInfo[]>([]);
  const [metasOperador, setMetasOperador] = useState<MetaInfo[]>([]);
  const [operadoresMap, setOperadoresMap] = useState<Record<string, string>>({});
  const [equipesMap, setEquipesMap] = useState<Record<string, string>>({});
  // BUG FIX Painel Diretoria / Performance por equipe:
  // A tabela `acordos` NÃO tem coluna `equipe_id` — a equipe é uma propriedade do
  // perfil (operador). Para agrupar corretamente por equipe, precisamos do mapa
  // operador_id → equipe_id. Sem isto, todos os acordos caíam em "Sem equipe".
  const [operadorEquipeMap, setOperadorEquipeMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const { mes, ano } = getMesAtual();
  const inicio = primeiroDiaMes();
  const fim = ultimoDiaMes();
  const hoje = getTodayISO();

  const fetchAll = useCallback(async () => {
    if (!perfil || !empresa?.id) return;
    setLoading(true);
    const isAdmin = isPerfilAdmin(perfil.perfil);
    const isLider = isPerfilLider(perfil.perfil);
    const isDiretoria = isPerfilDiretoria(perfil.perfil);

    try {
      // ── Carregar setores para o filtro do admin/diretoria ────────────────────
      if (isAdmin || isDiretoria) {
        const { data: setoresData } = await supabase
          .from('setores')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .order('nome');
        setSetores((setoresData as { id: string; nome: string }[]) ?? []);
      }

      // ── Carregar equipes do setor para o Líder/Elite ─────────────────────────
      let equipesDoSetorAtual: { id: string; nome: string }[] = [];
      if (isLider && perfil.setor_id) {
        const { data: eqData } = await supabase
          .from('equipes')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .eq('setor_id', perfil.setor_id)
          .order('nome');
        equipesDoSetorAtual = (eqData as { id: string; nome: string }[]) ?? [];
        setEquipesDoSetor(equipesDoSetorAtual);
      }

      // ── Resolver operadores da equipe selecionada (se equipeFiltro ativo) ───
      // O campo equipe_id existe em perfis (não em acordos), então precisamos
      // buscar os operador_id dos membros da equipe e filtrar acordos por IN.
      let operadoresDaEquipe: string[] | null = null;
      if (isLider && equipeFiltro && !operadorFiltro) {
        const { data: membros } = await supabase
          .from('perfis')
          .select('id')
          .eq('empresa_id', empresa.id)
          .eq('equipe_id', equipeFiltro);
        operadoresDaEquipe = ((membros as { id: string }[]) ?? []).map(m => m.id);
      }

      // ── Acordos conforme perfil ──────────────────────────────────────────────
      let q = supabase
        .from('acordos')
        .select('*')
        .eq('empresa_id', empresa.id);

      if (!isAdmin && !isDiretoria) {
        if (isLider && perfil.setor_id) {
          // Líder/Elite: hierarquia de filtros
          // 1. visão individual → filtra pelo próprio operador_id
          // 2. visão de equipe  → filtra por operador_id IN (membros da equipe)
          // 3. visão geral      → filtra pelo setor_id
          if (operadorFiltro) {
            q = q.eq('operador_id', operadorFiltro);
          } else if (operadoresDaEquipe !== null) {
            if (operadoresDaEquipe.length === 0) {
              // Equipe sem membros — força retorno vazio
              q = q.eq('operador_id', 'sem-membros-na-equipe');
            } else {
              q = q.in('operador_id', operadoresDaEquipe);
            }
          } else {
            q = q.eq('setor_id', perfil.setor_id);
          }
        } else {
          q = q.eq('operador_id', perfil.id);
        }
      } else if (setorFiltro) {
        // Admin/Diretoria filtrou por setor específico
        q = q.eq('setor_id', setorFiltro);
      }

      const { data: acordosData } = await q;
      setAcordos((acordosData as Acordo[]) || []);

      // ── Meta: hierarquia dependente do filtro ativo ──────────────────────────
      // Prioridade:
      //   1. Filtro individual (operadorFiltro) → meta do operador
      //   2. Filtro de equipe (equipeFiltro)     → meta da equipe selecionada
      //   3. Padrão Líder/Elite                  → meta do setor
      //   4. Operador comum                      → meta do próprio operador
      //   5. Admin                               → sem meta principal
      let tipoMeta: 'setor' | 'equipe' | 'operador' | null = null;
      let refId: string | null = null;

      if (!isAdmin) {
        if (operadorFiltro) {
          tipoMeta = 'operador';
          refId    = operadorFiltro;
        } else if (equipeFiltro && isLider) {
          tipoMeta = 'equipe';
          refId    = equipeFiltro;
        } else if (isLider && perfil.setor_id) {
          tipoMeta = 'setor';
          refId    = perfil.setor_id;
        } else if (!isLider) {
          tipoMeta = 'operador';
          refId    = perfil.id;
        }
      }

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
      } else if (isAdmin) {
        setMeta(null);
      }

      // ── Metas por equipe / operador (admin/líder/diretoria) ─────────────────
      if (isAdmin || isLider || isDiretoria) {
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
            .select('id, nome, equipe_id')
            .eq('empresa_id', empresa.id)
            .in('perfil', ['operador', 'elite', 'gerencia']),
          supabase
            .from('equipes')
            .select('id, nome')
            .eq('empresa_id', empresa.id),
        ]);

        const opMap: Record<string, string> = {};
        const opEqMap: Record<string, string | null> = {};
        ((ops as { id: string; nome: string; equipe_id: string | null }[]) || []).forEach(o => {
          opMap[o.id]   = o.nome;
          opEqMap[o.id] = o.equipe_id ?? null;
        });
        setOperadoresMap(opMap);
        setOperadorEquipeMap(opEqMap);

        const eqMap: Record<string, string> = {};
        ((eqs as { id: string; nome: string }[]) || []).forEach(e => { eqMap[e.id] = e.nome; });
        setEquipesMap(eqMap);
      }
    } catch (err) {
      console.error('[useAnalytics] erro:', err);
    } finally {
      setLoading(false);
    }
  }, [perfil, empresa, mes, ano, setorFiltro, equipeFiltro, operadorFiltro]);

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

    // ── "Agendado restante no mês" — pendentes (exclui pago e não pago) ────
    const valorAgendadoRestanteMes = pendentes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const totalAgendadoRestanteMes = pendentes.length;

    // H.O. — Honorários Operacionais (24,96% do bruto)
    const valorHOMes      = valorRecebidoMes * PP_HO_PERCENTUAL;
    const valorHOAgendado = valorAgendadoMes * PP_HO_PERCENTUAL;
    const valorHONaoPago  = valorNaoPago * PP_HO_PERCENTUAL;

    // Para PaguePlay: meta é baseada em H.O. (24,96% do bruto)
    // Para Bookplay:  meta é baseada no valor bruto recebido
    const basePercMeta   = isPP ? valorHOMes : valorRecebidoMes;
    const percMeta       = calcPerc(basePercMeta, meta?.meta_valor ?? 0);
    const percMetaAcordos = calcPerc(pagos.length, meta?.meta_acordos ?? 0);

    // Por status
    const porStatus = [
      { name: 'Pago',     value: pagos.length,     color: '#22c55e', icon: 'check' },
      { name: 'Pendente', value: pendentes.length,  color: '#f59e0b', icon: 'clock' },
      { name: 'Não Pago', value: naoPagos.length,   color: '#ef4444', icon: 'x'    },
    ].filter(s => s.value > 0);

    // Por dia do mês
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const porDia = Array.from({ length: diasNoMes }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${d}`;
      const doDia = acordosMes.filter(a => a.vencimento === iso);
      const recDia = doDia.filter(a => a.status === 'pago').reduce((s, a) => s + (Number(a.valor) || 0), 0);
      return {
        dia: String(i + 1),
        recebido: recDia,
        agendado: doDia.reduce((s, a) => s + (Number(a.valor) || 0), 0),
        ho:       recDia * PP_HO_PERCENTUAL,
      };
    });

    // Por equipe
    // BUG FIX: a equipe é derivada do OPERADOR (perfis.equipe_id), pois a
    // tabela `acordos` não possui esse campo. O código anterior usava
    // `(a as any).equipe_id` e caía sempre no fallback 'sem_equipe' — todo
    // operador aparecia sem equipe (ex: Jose_Victor com equipe Luciana
    // saía listado como "Sem equipe").
    const porEquipe = Object.entries(
      acordosMes.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const oid = a.operador_id ?? null;
          const eid = (oid && operadorEquipeMap[oid]) || 'sem_equipe';
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
      valorAgendadoRestanteMes,
      totalAgendadoRestanteMes,
      valorHOMes,
      valorHOAgendado,
      valorHONaoPago,
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
  }, [acordos, meta, metasEquipe, metasOperador, operadoresMap, operadorEquipeMap, equipesMap, inicio, fim, hoje, mes, ano, isPP]);

  return {
    ...derived,
    meta,
    loading,
    refetch: fetchAll,
    setores,
    setorFiltro,
    setSetorFiltro,
    equipeFiltro,
    setEquipeFiltro,
    equipesDoSetor,
    operadorFiltro,
    setOperadorFiltro,
  };
}