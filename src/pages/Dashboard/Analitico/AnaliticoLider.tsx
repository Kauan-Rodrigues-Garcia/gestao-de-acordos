/**
 * AnaliticoLider — visão líder/gerência/admin
 *
 * • Cards de resumo mensal (snapshot salvo na importação — não distorcido por deleções)
 * • Agrupamento por equipe em "Por operador" (respeita filtro de setor)
 * • Ranking com pódio (top 3 + faixas 4-10 + demais), filtrável por equipe/setor
 * • Destaques do dia filtráveis por equipe/setor
 * • Filtro de equipe nos tabs Ranking e Destaques (só equipes do setor selecionado)
 * • Filtro de data por operador expandido (client-side)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, Users, Trophy, AlertCircle, ChevronDown, ChevronRight,
  Trash2, Loader2, Star, CalendarDays, X, Filter, Copy,
  TrendingUp, CreditCard, Calendar, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useTenant } from '@/lib/tenant-config';
import { copiarTexto } from '@/lib/clipboard';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  buscarResumoOperadoresAnalitico,
  buscarAnalitico,
  buscarDestaquesDoMes,
  buscarEquipesComOperadores,
  buscarResumoMensal,
  removerLinhaAnalitico,
  removerOrfaosDoMes,
  limparDadosDoMes,
  type ResumoOperadorAnalitico,
  type DestaqueDiaAnalitico,
  type ResumoMensalAnalitico,
  type EquipeAnalitico,
  type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import { toast } from 'sonner';
import { TabulacaoCell } from './TabulacaoCell';
import { ImportarModal } from './ImportarModal';
import { RankingView } from './RankingView';
import { useAnaliticoImport } from '@/hooks/useAnaliticoImport';

const ORFAOS_PAGE = 100;
const DIAS_PT     = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_PT    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface AnaliticoLiderProps {
  empresaId: string;
  mes: string;
  setorId?: string | null;
  temPermissaoImportar: boolean;
  operadorId: string;
  operadorNome: string;
  liderId?: string | null;
  onAbrirNovoAcordo: (dados: {
    instituicao: string; nomeCliente: string;
    forma: 'boleto_pix' | 'cartao'; valor: number; dataPagamento?: string;
  }) => void;
  onVerAcordo: (acordoId: string, codigo?: string) => void;
  onRefetch: () => void;
}

interface FiltroData { inicio: string; fim: string }

export function AnaliticoLider({
  empresaId, mes, setorId,
  temPermissaoImportar, operadorId, operadorNome, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoLiderProps) {
  const importHook = useAnaliticoImport();
  const tenant = useTenant();
  const mostrarHO = tenant.isPaguePlay;   // HO só existe no relatório PaguePlay

  const [modalImportar, setModalImportar] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'operadores' | 'ranking' | 'destaques' | 'orfaos'>('operadores');

  // ── Resumos por operador ──────────────────────────────────────────────────
  const [resumos,        setResumos]        = useState<ResumoOperadorAnalitico[]>([]);
  const [loadingResumos, setLoadingResumos] = useState(true);

  // ── Snapshot mensal (cards de resumo) ────────────────────────────────────
  const [snapshot,        setSnapshot]        = useState<ResumoMensalAnalitico | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);

  // ── Linhas expandidas (lazy) ──────────────────────────────────────────────
  const [expandidos,    setExpandidos]    = useState<Set<string>>(new Set());
  const [linhasMap,     setLinhasMap]     = useState<Map<string, AnaliticoRecebimento[]>>(new Map());
  const [loadingLinhas, setLoadingLinhas] = useState<Set<string>>(new Set());
  const [filtrosDatas,  setFiltrosDatas]  = useState<Map<string, FiltroData>>(new Map());

  // ── Órfãos ────────────────────────────────────────────────────────────────
  const [orfaos,         setOrfaos]         = useState<AnaliticoRecebimento[]>([]);
  const [loadingOrfaos,  setLoadingOrfaos]  = useState(false);
  const [orfaosVisiveis, setOrfaosVisiveis] = useState(ORFAOS_PAGE);
  const [removendoId,       setRemovendoId]       = useState<string | null>(null);
  const [removendoTodos,    setRemovendoTodos]    = useState(false);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [limpando,           setLimpando]           = useState(false);

  // ── Destaques ─────────────────────────────────────────────────────────────
  const [destaques,        setDestaques]        = useState<DestaqueDiaAnalitico[]>([]);
  const [loadingDestaques, setLoadingDestaques] = useState(false);

  // ── Equipes ───────────────────────────────────────────────────────────────
  const [equipes,           setEquipes]           = useState<EquipeAnalitico[]>([]);
  const [operadorEquipeMap, setOperadorEquipeMap] = useState<Record<string, OperadorEquipeInfo>>({});
  const [filtroEquipeId,    setFiltroEquipeId]    = useState<string | null>(null);

  // ── Cargas ────────────────────────────────────────────────────────────────
  const carregarResumos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingResumos(true);
    setExpandidos(new Set());
    setLinhasMap(new Map());
    setFiltrosDatas(new Map());
    const { data, error } = await buscarResumoOperadoresAnalitico(empresaId, mes);
    if (error) toast.error(`Erro ao carregar resumo: ${error}`);
    setResumos(data);
    setLoadingResumos(false);
  }, [empresaId, mes]);

  const carregarSnapshot = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingSnapshot(true);
    const { data } = await buscarResumoMensal(empresaId, mes);
    setSnapshot(data);
    setLoadingSnapshot(false);
  }, [empresaId, mes]);

  const carregarOrfaos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingOrfaos(true);
    setOrfaosVisiveis(ORFAOS_PAGE);
    const { data } = await buscarAnalitico({ empresaId, mes, operadorId: null });
    setOrfaos(data);
    setLoadingOrfaos(false);
  }, [empresaId, mes]);

  const carregarDestaques = useCallback(async (equipeId?: string | null, sId?: string | null) => {
    if (!empresaId || !mes) return;
    setLoadingDestaques(true);
    const { data, error } = await buscarDestaquesDoMes(empresaId, mes, equipeId, sId);
    if (error) toast.error(`Erro ao carregar destaques: ${error}`);
    setDestaques(data);
    setLoadingDestaques(false);
  }, [empresaId, mes]);

  useEffect(() => {
    void carregarResumos();
    void carregarSnapshot();
  }, [carregarResumos, carregarSnapshot]);

  useEffect(() => {
    if (abaAtiva === 'orfaos')    void carregarOrfaos();
    if (abaAtiva === 'destaques') void carregarDestaques(filtroEquipeId, setorId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva]);

  useEffect(() => {
    buscarEquipesComOperadores(empresaId).then(({ equipes: eq, operadorEquipeMap: oem }) => {
      setEquipes(eq);
      setOperadorEquipeMap(oem);
    });
  }, [empresaId]);

  // Quando o setor externo muda: reseta filtro de equipe interno e recarrega destaques
  useEffect(() => {
    setFiltroEquipeId(null);
    if (abaAtiva === 'destaques') void carregarDestaques(null, setorId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorId]);

  // ── Equipes filtradas pelo setor selecionado (para dropdowns internos) ────
  const equipesFiltradas = useMemo(() => {
    if (!setorId) return equipes;
    return equipes.filter(e => e.setor_id === setorId);
  }, [equipes, setorId]);

  // ── Filtro de equipe ──────────────────────────────────────────────────────
  function mudarFiltroEquipe(equipeId: string | null) {
    setFiltroEquipeId(equipeId);
    if (abaAtiva === 'destaques') void carregarDestaques(equipeId, setorId);
  }

  // ── Toggle card de operador ───────────────────────────────────────────────
  async function toggleExpandido(opId: string) {
    const jaAberto = expandidos.has(opId);
    setExpandidos(prev => {
      const next = new Set(prev);
      if (jaAberto) next.delete(opId);
      else next.add(opId);
      return next;
    });
    if (!jaAberto && !linhasMap.has(opId)) {
      setLoadingLinhas(prev => new Set(prev).add(opId));
      const { data } = await buscarAnalitico({ empresaId, mes, operadorId: opId });
      setLinhasMap(prev => new Map(prev).set(opId, data));
      setLoadingLinhas(prev => { const s = new Set(prev); s.delete(opId); return s; });
    }
  }

  function getLinhasOp(opId: string): AnaliticoRecebimento[] {
    const linhas = linhasMap.get(opId) ?? [];
    const f = filtrosDatas.get(opId);
    if (!f || (!f.inicio && !f.fim)) return linhas;
    return linhas.filter(l => {
      if (f.inicio && l.data_pagamento < f.inicio) return false;
      if (f.fim   && l.data_pagamento > f.fim)     return false;
      return true;
    });
  }

  function setFiltroData(opId: string, campo: 'inicio' | 'fim', valor: string) {
    setFiltrosDatas(prev => {
      const next  = new Map(prev);
      const atual = next.get(opId) ?? { inicio: '', fim: '' };
      next.set(opId, { ...atual, [campo]: valor });
      return next;
    });
  }

  function limparFiltroData(opId: string) {
    setFiltrosDatas(prev => { const next = new Map(prev); next.delete(opId); return next; });
  }

  // ── Órfãos ────────────────────────────────────────────────────────────────
  async function removerOrfao(id: string) {
    setRemovendoId(id);
    const { error } = await removerLinhaAnalitico(id);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else { toast.success('Linha removida.'); setOrfaos(prev => prev.filter(o => o.id !== id)); onRefetch(); }
    setRemovendoId(null);
  }

  async function removerTodosOrfaos() {
    setRemovendoTodos(true);
    const { error } = await removerOrfaosDoMes(empresaId, mes);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else { toast.success('Todos os registros sem operador foram removidos.'); setOrfaos([]); onRefetch(); }
    setRemovendoTodos(false);
  }

  async function limparMes() {
    setLimpando(true);
    const { error } = await limparDadosDoMes(empresaId, mes);
    if (error) {
      toast.error(`Erro ao limpar: ${error}`);
    } else {
      const mesLabel = new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      toast.success(`Dados de ${mesLabel} excluídos. Reimporte o relatório quando necessário.`);
      setConfirmandoLimpeza(false);
      void carregarResumos();
      void carregarSnapshot();
      if (abaAtiva === 'orfaos')    void carregarOrfaos();
      if (abaAtiva === 'destaques') void carregarDestaques(filtroEquipeId, setorId);
      onRefetch();
    }
    setLimpando(false);
  }

  function handlePosImport() {
    setModalImportar(false);
    if (importHook.estado === 'done') {
      void carregarResumos();
      void carregarSnapshot();
      if (abaAtiva === 'orfaos')    void carregarOrfaos();
      if (abaAtiva === 'destaques') void carregarDestaques(filtroEquipeId, setorId);
      onRefetch();
    }
  }

  // ── Resumos filtrados (ranking / métricas por setor ou equipe) ────────────
  const resumosFiltrados = useMemo(() => {
    let base = resumos;
    if (setorId) {
      base = base.filter(r => operadorEquipeMap[r.operador_id]?.setor_id === setorId);
    }
    if (filtroEquipeId) {
      base = base.filter(r => operadorEquipeMap[r.operador_id]?.equipe_id === filtroEquipeId);
    }
    return base;
  }, [resumos, operadorEquipeMap, setorId, filtroEquipeId]);

  // ── Agrupamento por equipe (Por operador) ─────────────────────────────────
  const resumosPorEquipe = useMemo(() => {
    const baseResumos = setorId
      ? resumos.filter(r => operadorEquipeMap[r.operador_id]?.setor_id === setorId)
      : resumos;
    const groups = new Map<string, {
      equipeId: string | null;
      equipeNome: string;
      items: ResumoOperadorAnalitico[];
    }>();
    for (const r of baseResumos) {
      const info = operadorEquipeMap[r.operador_id];
      const key  = info?.equipe_id ?? '__sem__';
      const nome = info?.equipe_nome ?? 'Sem equipe';
      if (!groups.has(key)) groups.set(key, { equipeId: info?.equipe_id ?? null, equipeNome: nome, items: [] });
      groups.get(key)!.items.push(r);
    }
    return Array.from(groups.values()).filter(g => g.items.length > 0);
  }, [resumos, operadorEquipeMap, setorId]);

  // ── Métricas dos cards ────────────────────────────────────────────────────
  const metricas = useMemo(() => {
    if (!setorId && !filtroEquipeId) {
      // Usa snapshot — reflete totais do relatório importado, sem ser afetado por deleções
      if (!snapshot) return null;
      return {
        totalRecebido:   snapshot.total_recebido,
        totalHo:         snapshot.total_ho,
        totalOperadores: snapshot.total_operadores,
        totalPagamentos: snapshot.total_pagamentos,
        periodoInicio:   snapshot.periodo_inicio,
        periodoFim:      snapshot.periodo_fim,
      };
    }
    // Computa a partir dos resumos filtrados (operadores com dados no período)
    return {
      totalRecebido:   resumosFiltrados.reduce((s, r) => s + r.total_recebido, 0),
      totalHo:         resumosFiltrados.reduce((s, r) => s + r.total_ho, 0),
      totalOperadores: resumosFiltrados.length,
      totalPagamentos: resumosFiltrados.reduce((s, r) => s + r.total_pagamentos, 0),
      periodoInicio:   snapshot?.periodo_inicio ?? null,
      periodoFim:      snapshot?.periodo_fim ?? null,
    };
  }, [setorId, filtroEquipeId, snapshot, resumosFiltrados]);

  // ── Helpers destaques ──────────────────────────────────────────────────────
  const [mesAnoStr, mesNumStr] = mes.split('-');
  const diasNoMes    = new Date(Number(mesAnoStr), Number(mesNumStr), 0).getDate();
  const hojeISO      = new Date().toISOString().split('T')[0];
  const destaquesMap = useMemo(() => new Map(destaques.map(d => [d.dia, d])), [destaques]);

  // ── Seletor de equipe reutilizável ────────────────────────────────────────
  const seletorEquipe = equipesFiltradas.length > 0 && (
    <div className="flex items-center gap-2">
      <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <select
        value={filtroEquipeId ?? ''}
        onChange={e => mudarFiltroEquipe(e.target.value || null)}
        className="h-7 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Todas as equipes</option>
        {equipesFiltradas.map(eq => (
          <option key={eq.id} value={eq.id}>{eq.nome}</option>
        ))}
      </select>
      {filtroEquipeId && (
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs text-muted-foreground"
          onClick={() => mudarFiltroEquipe(null)}>
          <X className="w-3 h-3" /> Limpar
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Cards de resumo mensal ─────────────────────────────────────────── */}
      <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-3', mostrarHO ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {loadingSnapshot ? (
          Array.from({ length: mostrarHO ? 5 : 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))
        ) : metricas ? (
          <>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total recebido</p>
                    <p className="text-base font-bold text-primary font-mono leading-tight mt-1 truncate">
                      {formatBRL(metricas.totalRecebido)}
                    </p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-primary/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
            {mostrarHO && (
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total HO</p>
                      <p className="text-base font-bold font-mono leading-tight mt-1 truncate">
                        {formatBRL(metricas.totalHo)}
                      </p>
                    </div>
                    <CreditCard className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Operadores</p>
                    <p className="text-xl font-bold leading-tight mt-1">{metricas.totalOperadores}</p>
                  </div>
                  <Users className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Acordos pagos</p>
                    <p className="text-xl font-bold leading-tight mt-1">
                      {metricas.totalPagamentos.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <BarChart3 className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Período</p>
                    {metricas.periodoInicio && metricas.periodoFim ? (
                      <p className="text-xs font-semibold leading-tight mt-1">
                        {new Date(metricas.periodoInicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                        <span className="text-muted-foreground"> a </span>
                        {new Date(metricas.periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">—</p>
                    )}
                  </div>
                  <Calendar className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="col-span-full text-center py-4 text-xs text-muted-foreground">
            Nenhum dado importado para este mês.
          </div>
        )}
      </div>

      {/* Tabs + botão importar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'operadores', label: 'Por operador',     Icon: Users },
            { key: 'ranking',    label: 'Ranking',          Icon: Trophy },
            { key: 'destaques',  label: 'Destaques do dia', Icon: Star },
            { key: 'orfaos',     label: 'Sem operador',     Icon: AlertCircle },
          ] as const).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setAbaAtiva(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                abaAtiva === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        {temPermissaoImportar && (
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmandoLimpeza(true)}
            >
              <Trash2 className="w-4 h-4" /> Limpar mês
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setModalImportar(true)}>
              <Upload className="w-4 h-4" /> Importar relatório
            </Button>
          </div>
        )}
      </div>

      {/* ── Aba: Por operador ─────────────────────────────────────────────── */}
      {abaAtiva === 'operadores' && (
        <div className="space-y-5">
          {loadingResumos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
          )}
          {!loadingResumos && resumosPorEquipe.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para este mês.</p>
            </div>
          )}
          {!loadingResumos && resumosPorEquipe.map(grupo => (
            <div key={grupo.equipeId ?? '__sem__'} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
                  {grupo.equipeNome}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {grupo.items.map(r => {
                const aberto      = expandidos.has(r.operador_id);
                const carregando  = loadingLinhas.has(r.operador_id);
                const linhas      = getLinhasOp(r.operador_id);
                const todasLinhas = linhasMap.get(r.operador_id) ?? [];
                const filtro      = filtrosDatas.get(r.operador_id);
                const temFiltro   = !!(filtro?.inicio || filtro?.fim);

                return (
                  <Card key={r.operador_id} className="border-border">
                    <CardHeader className="p-3 cursor-pointer select-none"
                      onClick={() => void toggleExpandido(r.operador_id)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {carregando
                            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                            : aberto
                              ? <ChevronDown  className="w-4 h-4 text-muted-foreground" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <CardTitle className="text-sm">{r.operador_nome ?? r.operador_usuario}</CardTitle>
                            <p className="text-xs text-muted-foreground font-mono">{r.operador_usuario}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-sm font-bold text-primary">{formatBRL(r.total_recebido)}</p>
                            <p className="text-xs text-muted-foreground">recebido</p>
                          </div>
                          {mostrarHO && (
                            <div>
                              <p className="text-sm font-semibold">{formatBRL(r.total_ho)}</p>
                              <p className="text-xs text-muted-foreground">HO</p>
                            </div>
                          )}
                          <Badge variant="outline" className="shrink-0">{r.total_pagamentos} pgto.</Badge>
                        </div>
                      </div>
                    </CardHeader>

                    {aberto && (
                      <CardContent className="p-0 border-t">
                        {carregando ? (
                          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 flex-wrap">
                              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">Filtrar:</span>
                              <input type="date" value={filtro?.inicio ?? ''}
                                onChange={e => setFiltroData(r.operador_id, 'inicio', e.target.value)}
                                className="h-6 px-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-xs text-muted-foreground">até</span>
                              <input type="date" value={filtro?.fim ?? ''}
                                onChange={e => setFiltroData(r.operador_id, 'fim', e.target.value)}
                                className="h-6 px-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              {temFiltro && (
                                <>
                                  <Button size="sm" variant="ghost"
                                    className="h-6 px-1.5 gap-1 text-xs text-muted-foreground"
                                    onClick={() => limparFiltroData(r.operador_id)}>
                                    <X className="w-3 h-3" /> Limpar
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    {linhas.length}/{todasLinhas.length}
                                  </span>
                                </>
                              )}
                              <Button size="sm" variant="outline"
                                className="h-6 px-2 gap-1 text-xs ml-auto"
                                disabled={linhas.length === 0}
                                onClick={() => void copiarTexto(
                                  montarTextoListaAnalitico(r.operador_nome ?? r.operador_usuario, linhas),
                                  'Lista de acordos copiada',
                                )}>
                                <Copy className="w-3 h-3" /> Copiar lista
                              </Button>
                            </div>

                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/30">
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                                  {mostrarHO && <th className="text-right px-3 py-2 font-semibold text-muted-foreground">HO</th>}
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">AÇÃO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {linhas.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">
                                      {temFiltro ? 'Nenhum registro no período.' : 'Sem registros.'}
                                    </td>
                                  </tr>
                                ) : linhas.flatMap(linha => {
                                  const pagamentos = linha.pagamentos_detalhados;
                                  const formaBadge = (
                                    <Badge variant="outline" className={
                                      linha.forma_pagamento === 'cartao'
                                        ? 'text-xs border-purple-300 text-purple-700'
                                        : 'text-xs border-blue-300 text-blue-700'
                                    }>
                                      {linha.forma_detalhe || (linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix')}
                                    </Badge>
                                  );

                                  if (!pagamentos || pagamentos.length <= 1) {
                                    return [
                                      <tr key={linha.id} className="hover:bg-muted/20">
                                        <td className="px-3 py-2">
                                          <span className="font-semibold">{linha.codigo}</span>
                                          {linha.nome_cliente && (
                                            <span className="block text-muted-foreground truncate max-w-[120px]">{linha.nome_cliente}</span>
                                          )}
                                          {linha.instituicao && (
                                            <span className="block text-[10px] text-muted-foreground/70 truncate max-w-[120px]">{linha.instituicao}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2">{formaBadge}</td>
                                        <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                                        {mostrarHO && <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>}
                                        <td className="px-3 py-2 tabular-nums">
                                          {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <TabulacaoCell
                                            linha={linha} empresaId={empresaId}
                                            operadorId={r.operador_id}
                                            operadorNome={r.operador_nome ?? r.operador_usuario}
                                            liderId={liderId}
                                            onAbrirNovoAcordo={onAbrirNovoAcordo}
                                            onVerAcordo={onVerAcordo}
                                            onRefetch={onRefetch}
                                          />
                                        </td>
                                      </tr>,
                                    ];
                                  }

                                  return pagamentos.map((p, idx) => (
                                    <tr key={`${linha.id}::${idx}`} className="hover:bg-muted/20">
                                      {idx === 0 && (
                                        <td rowSpan={pagamentos.length} className="px-3 py-2 align-top">
                                          <span className="font-semibold">{linha.codigo}</span>
                                          {linha.nome_cliente && (
                                            <span className="block text-muted-foreground truncate max-w-[120px]">{linha.nome_cliente}</span>
                                          )}
                                          {linha.instituicao && (
                                            <span className="block text-[10px] text-muted-foreground/70 truncate max-w-[120px]">{linha.instituicao}</span>
                                          )}
                                        </td>
                                      )}
                                      <td className="px-3 py-2">{formaBadge}</td>
                                      <td className="px-3 py-2 text-right font-mono">{formatBRL(p.valor)}</td>
                                      {mostrarHO && <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatBRL(p.total_ho)}</td>}
                                      <td className="px-3 py-2 tabular-nums">
                                        {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </td>
                                      {idx === 0 && (
                                        <td rowSpan={pagamentos.length} className="px-3 py-2 text-right align-top">
                                          <TabulacaoCell
                                            linha={linha} empresaId={empresaId}
                                            operadorId={r.operador_id}
                                            operadorNome={r.operador_nome ?? r.operador_usuario}
                                            liderId={liderId}
                                            onAbrirNovoAcordo={onAbrirNovoAcordo}
                                            onVerAcordo={onVerAcordo}
                                            onRefetch={onRefetch}
                                          />
                                        </td>
                                      )}
                                    </tr>
                                  ));
                                })}
                              </tbody>
                            </table>
                          </>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Aba: Ranking ──────────────────────────────────────────────────── */}
      {abaAtiva === 'ranking' && (
        <div className="space-y-4">
          {equipesFiltradas.length > 0 && (
            <div className="flex items-center gap-2">{seletorEquipe}</div>
          )}
          {loadingResumos ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
            </div>
          ) : resumosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para exibir.</p>
            </div>
          ) : (
            <RankingView resumos={resumosFiltrados} mostrarCopiar />
          )}
        </div>
      )}

      {/* ── Aba: Destaques do dia ─────────────────────────────────────────── */}
      {abaAtiva === 'destaques' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold">{MESES_PT[Number(mesNumStr) - 1]} de {mesAnoStr}</p>
              <p className="text-xs text-muted-foreground">Destaque de recebimento por dia</p>
            </div>
            {equipesFiltradas.length > 0 && seletorEquipe}
          </div>

          {loadingDestaques ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: diasNoMes }, (_, i) => {
                const d      = i + 1;
                const diaStr = `${mes}-${String(d).padStart(2, '0')}`;
                const dest   = destaquesMap.get(diaStr);
                const isHoje = diaStr === hojeISO;
                const isFut  = diaStr > hojeISO;

                return (
                  <div key={diaStr} className={cn(
                    'flex items-center gap-3 rounded-lg border px-4 py-3',
                    isHoje  && 'border-primary/40 bg-primary/5',
                    !isHoje && !isFut && dest && 'border-border bg-card',
                    isFut   && 'border-border/50 bg-muted/20 opacity-50',
                    !dest   && !isFut && 'border-border/50 bg-muted/10',
                  )}>
                    <div className="text-center shrink-0 w-10">
                      <p className={cn('text-lg font-bold leading-none', isHoje ? 'text-primary' : 'text-foreground')}>
                        {String(d).padStart(2, '0')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {DIAS_PT[new Date(diaStr + 'T12:00:00').getDay()]}
                      </p>
                    </div>
                    <div className={cn('w-px self-stretch', isHoje ? 'bg-primary/30' : 'bg-border')} />
                    {dest ? (
                      <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{dest.operador_nome ?? dest.operador_usuario}</p>
                            <p className="text-xs text-muted-foreground">destaque do dia</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-primary font-mono">{formatBRL(dest.total_recebido)}</p>
                          <p className="text-xs text-muted-foreground">
                            {dest.total_pagamentos} pgto{dest.total_pagamentos !== 1 ? 's' : ''}.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic flex-1">
                        {isFut ? '—' : 'Sem recebimentos'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Sem operador ─────────────────────────────────────────────── */}
      {abaAtiva === 'orfaos' && (
        <div className="space-y-3">
          {loadingOrfaos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded-lg" />)}
            </div>
          )}
          {!loadingOrfaos && orfaos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhuma linha sem operador. ✓</p>
            </div>
          )}
          {!loadingOrfaos && orfaos.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {orfaos.length} linha{orfaos.length !== 1 ? 's' : ''} não vinculada{orfaos.length !== 1 ? 's' : ''}.
                </p>
                <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs"
                  onClick={() => void removerTodosOrfaos()} disabled={removendoTodos}>
                  {removendoTodos
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />}
                  Remover todos
                </Button>
              </div>
              <Card className="border-border">
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">COBRADORA</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">REMOVER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orfaos.slice(0, orfaosVisiveis).map(linha => (
                        <tr key={linha.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-amber-600">{linha.operador_usuario}</td>
                          <td className="px-3 py-2 font-semibold">{linha.codigo}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={
                              linha.forma_pagamento === 'cartao'
                                ? 'text-xs border-purple-300 text-purple-700'
                                : 'text-xs border-blue-300 text-blue-700'
                            }>
                              {linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => void removerOrfao(linha.id)}
                              disabled={removendoId === linha.id}>
                              {removendoId === linha.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              {orfaosVisiveis < orfaos.length && (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => setOrfaosVisiveis(prev => prev + ORFAOS_PAGE)}>
                    Carregar mais ({orfaos.length - orfaosVisiveis} restantes)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <AlertDialog open={confirmandoLimpeza} onOpenChange={setConfirmandoLimpeza}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Limpar dados do mês
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>
                Todos os registros importados de{' '}
                <strong>
                  {new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </strong>{' '}
                serão excluídos permanentemente, incluindo todas as tabulações registradas no período.
              </p>
              <p className="text-xs text-muted-foreground">
                Esta ação não pode ser desfeita. Após a exclusão, reimporte o relatório para restaurar os dados.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limpando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void limparMes()}
              disabled={limpando}
              className="bg-destructive hover:bg-destructive/90 text-white gap-1.5"
            >
              {limpando && <Loader2 className="w-4 h-4 animate-spin" />}
              {limpando ? 'Excluindo…' : 'Confirmar exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportarModal aberto={modalImportar} onFechar={handlePosImport} hook={importHook} />
    </div>
  );
}

// ── Copiar lista (formato do protótipo HTML) ──────────────────────────────────

/** Formata 'yyyy-MM-dd' → 'dd/mm/yyyy'. */
function fmtDataAnalitico(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Monta o texto de "Copiar lista" dos acordos analíticos de um operador,
 * no mesmo formato do protótipo HTML:
 *   *Nome* — acordos pagos (período)
 *   CÓDIGO - Forma - Valor recebido - Total HO - Data
 *   Total: R$ x | HO: R$ y
 */
function montarTextoListaAnalitico(nome: string, linhas: AnaliticoRecebimento[]): string {
  const totRec = linhas.reduce((s, l) => s + l.valor_recebido, 0);
  const totHo  = linhas.reduce((s, l) => s + l.total_ho, 0);

  const datas = linhas.map(l => l.data_pagamento).filter(Boolean).sort();
  const ini = datas[0] ?? null;
  const fim = datas[datas.length - 1] ?? null;
  const periodo = !ini ? '' : (ini === fim ? fmtDataAnalitico(ini) : `${fmtDataAnalitico(ini)} a ${fmtDataAnalitico(fim)}`);

  const formaLabel = (f: AnaliticoRecebimento['forma_pagamento']) =>
    f === 'cartao' ? 'Cartão' : 'Boleto/Pix';

  const head = `*${nome}* — acordos pagos${periodo ? ` (${periodo})` : ''}`;
  const lines = linhas.map(l =>
    `${l.codigo} - ${formaLabel(l.forma_pagamento)} - ${formatBRL(l.valor_recebido)} - ${formatBRL(l.total_ho)} - ${fmtDataAnalitico(l.data_pagamento)}`,
  );

  return [head, '', ...lines, '', `Total: ${formatBRL(totRec)} | HO: ${formatBRL(totHo)}`].join('\n');
}
