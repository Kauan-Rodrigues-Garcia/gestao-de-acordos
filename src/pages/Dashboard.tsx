import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, CheckCircle2,
  DollarSign, Users, CalendarDays,
  ArrowRight, MessageSquare, Plus, Building2,
  Search, Filter, RefreshCw, X,
  Edit, Eye, CheckCircle, Hash, MapPin, Link2,
  ChevronLeft, ChevronRight, Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useDashboardMetricas, useAcordos } from '@/hooks/useAcordos';
import {
  ROUTE_PATHS, formatCurrency, formatDate,
  STATUS_COLORS, STATUS_LABELS, TIPO_LABELS, TIPO_COLORS,
  getTodayISO, isPaguePlay, getTipoLabels, getStatusLabels,
  TIPO_OPTIONS_PAGUEPLAY, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo, isAtrasado,
} from '@/lib/index';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import { ModalFilaWhatsApp, type ItemFila } from '@/components/ModalFilaWhatsApp';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { criarNotificacao } from '@/services/notificacoes.service';

// ─── helpers ──────────────────────────────────────────────────────────────────

function saudacao(): string {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function buildMensagem(a: Acordo): string {
  if (a.status === 'nao_pago') {
    return `Olá *${a.nome_cliente}*, identificamos que o seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*, encontra-se em atraso. Por favor, entre em contato conosco o mais breve possível para regularizar sua situação. Estamos à disposição para ajudar.`;
  }
  return `Olá *${a.nome_cliente}*, passando para lembrar do seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*. Qualquer dúvida, estamos à disposição.`;
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const PIE_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];

const PER_PAGE = 20;

// ─── Table Skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);
  const statusLabels = getStatusLabels(tenantSlug);
  const tipoLabels   = getTipoLabels(tenantSlug);

  // ── métricas e acordos de hoje (usados sempre) ──────────────────────────────
  const { metricas, loading: loadingMetricas } = useDashboardMetricas();
  const { acordos: acordosHoje, loading: loadingHoje } = useAcordos({ apenas_hoje: true });
  const hoje = getTodayISO();
  const diaSemana    = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── estados da tabela completa (PaguePay only) ───────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca,        setBusca]        = useState(searchParams.get('busca')  || '');
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo,   setFiltroTipo]   = useState(searchParams.get('tipo')   || '');
  const [filtroData,   setFiltroData]   = useState(searchParams.get('data')   || '');
  const [currentPage,  setCurrentPage]  = useState(Number(searchParams.get('page')) || 1);
  const [activeTab, setActiveTab]       = useState<'todos' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'todos' | 'pagos' | 'nao_pagos') || 'todos',
  );

  const [selecionados,            setSelecionados]            = useState<string[]>([]);
  const [atualizandoStatus,       setAtualizandoStatus]       = useState<string | null>(null);
  const [filaAberta,              setFilaAberta]              = useState(false);
  const [filaWhatsApp,            setFilaWhatsApp]            = useState<ItemFila[]>([]);
  const [excluindoId,             setExcluindoId]             = useState<string | null>(null);
  const [confirmandoExclusao,     setConfirmandoExclusao]     = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);
  const [editandoInlineId,        setEditandoInlineId]        = useState<string | null>(null);

  // sync URL (apenas PaguePay)
  useEffect(() => {
    if (!isPP) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (busca)       params.set('busca',  busca);  else params.delete('busca');
      if (filtroStatus) params.set('status', filtroStatus); else params.delete('status');
      if (filtroTipo)  params.set('tipo',   filtroTipo);  else params.delete('tipo');
      if (filtroData)  params.set('data',   filtroData);  else params.delete('data');
      if (activeTab !== 'todos') params.set('tab', activeTab); else params.delete('tab');
      params.set('page', currentPage.toString());
      setSearchParams(params);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTipo, filtroData, activeTab, currentPage, isPP]);

  // tab → status filter
  const statusFiltro =
    filtroStatus && filtroStatus !== 'all' ? filtroStatus
    : activeTab === 'pagos'     ? 'pago'
    : activeTab === 'nao_pagos' ? 'nao_pago'
    : filtroStatus || undefined;

  const { acordos, totalCount, loading, refetch } = useAcordos(
    isPP ? {
      busca:        busca || undefined,
      status:       statusFiltro,
      tipo:         filtroTipo && filtroTipo !== 'all' ? filtroTipo : undefined,
      vencimento:   filtroData || undefined,
      operador_id:  perfil?.perfil === 'operador' ? perfil.id : undefined,
      page:         currentPage,
      perPage:      PER_PAGE,
    } : {},
  );

  // dados para gráficos (dashboard normal)
  const { acordos: todosAcordos } = useAcordos();
  const statusData = ['verificar_pendente', 'pago', 'nao_pago'].map(s => ({
    name:  statusLabels[s] || STATUS_LABELS[s],
    value: todosAcordos.filter(a => a.status === s).length,
  })).filter(d => d.value > 0);

  const tipoKeys = isPP
    ? [...TIPO_OPTIONS_PAGUEPLAY]
    : ['boleto', 'cartao_recorrente', 'pix_automatico', 'cartao', 'pix'];
  const tipoData = tipoKeys.map(t => ({
    name:    tipoLabels[t] || TIPO_LABELS[t],
    acordos: todosAcordos.filter(a => a.tipo === t).length,
    valor:   todosAcordos.filter(a => a.tipo === t).reduce((s, a) => s + Number(a.valor), 0),
  }));

  const totalPages   = Math.ceil(totalCount / PER_PAGE);
  const temFiltros   = !!(busca || filtroStatus || filtroTipo || filtroData);
  const nome         = perfil?.nome?.split(' ')[0] || 'Usuário';

  // ── mover atrasados → nao_pago ────────────────────────────────────────────
  useEffect(() => {
    if (!isPP || loading || acordos.length === 0) return;
    const atrasados = acordos.filter(a =>
      a.status === 'verificar_pendente' && a.vencimento < hoje,
    );
    if (atrasados.length === 0) return;
    Promise.all(
      atrasados.map(a =>
        supabase.from('acordos').update({ status: 'nao_pago' }).eq('id', a.id),
      ),
    ).then(() => {
      toast.info(`${atrasados.length} acordo(s) atrasado(s) movido(s) para "Não Pago"`);
      atrasados.forEach(a => {
        if (a.operador_id) {
          criarNotificacao({
            usuario_id: a.operador_id,
            titulo:     'Acordo movido para Não Pago',
            mensagem:   `O acordo NR ${a.nr_cliente} foi movido para "Não Pago" por atraso.`,
            empresa_id: empresa?.id,
          });
        }
      });
      refetch();
    }).catch(e => console.warn('[Dashboard] erro ao mover atrasados:', e));
  }, [acordos, loading, isPP]);

  // ── handlers ─────────────────────────────────────────────────────────────────
  function limparFiltros() {
    setBusca(''); setFiltroStatus(''); setFiltroTipo(''); setFiltroData(''); setCurrentPage(1);
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function selecionarTodos() {
    if (selecionados.length === acordos.length) setSelecionados([]);
    else setSelecionados(acordos.map(a => a.id));
  }

  async function marcarComoPago(id: string) {
    setAtualizandoStatus(id);
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', id);
    if (error) toast.error('Erro ao atualizar status');
    else { toast.success('Acordo marcado como Pago!'); refetch(); }
    setAtualizandoStatus(null);
  }

  function prepararFila(lista: Acordo[]) {
    const comWhats = lista.filter(a => a.whatsapp);
    const semWhats = lista.filter(a => !a.whatsapp);
    if (comWhats.length === 0) { toast.warning('Nenhum acordo selecionado possui WhatsApp cadastrado'); return; }
    if (semWhats.length > 0) toast.info(`${semWhats.length} acordo(s) sem WhatsApp serão ignorados`);
    const fila: ItemFila[] = comWhats.map(a => ({
      id: a.id,
      nome_cliente: a.nome_cliente,
      nr_cliente:   a.nr_cliente,
      whatsapp:     a.whatsapp!,
      valor:        a.valor,
      vencimento:   a.vencimento,
      mensagem:     buildMensagem(a),
      link:         `https://wa.me/55${a.whatsapp!.replace(/\D/g,'')}?text=${encodeURIComponent(buildMensagem(a))}`,
      enviado:      false,
    }));
    setFilaWhatsApp(fila);
    setFilaAberta(true);
  }

  function enviarLembretesHoje() {
    const lista = acordosHoje.filter(a => a.vencimento === hoje);
    if (lista.length === 0) { toast.info('Nenhum acordo vence hoje'); return; }
    prepararFila(lista);
  }

  function enviarUmWhatsapp(a: Acordo) {
    if (!a.whatsapp) { toast.warning('WhatsApp não cadastrado'); return; }
    const mensagem = buildMensagem(a);
    window.open(`https://wa.me/55${a.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(mensagem)}`, '_blank');
    if (perfil?.id) {
      supabase.from('logs_sistema').insert({
        usuario_id:  perfil.id,
        acao:        'envio_lembrete_whatsapp',
        tabela:      'acordos',
        registro_id: a.id,
        empresa_id:  empresa?.id ?? null,
        detalhes:    { acordo_id: a.id, nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente, modo: 'individual' },
      }).then(({ error }) => { if (error) console.warn('[enviarUmWhatsapp] log error:', error.message); });
    }
  }

  async function excluirAcordo(a: Acordo) {
    setConfirmandoExclusao(null);
    setExcluindoId(a.id);
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) toast.error('Erro ao excluir acordo: ' + error.message);
    else {
      supabase.from('logs_sistema').insert({
        usuario_id:  perfil?.id ?? null,
        acao:        'exclusao_acordo',
        tabela:      'acordos',
        registro_id: a.id,
        empresa_id:  empresa?.id ?? null,
        detalhes:    { nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente, excluido_por: perfil?.nome ?? perfil?.email ?? null, excluido_em: new Date().toISOString() },
      }).then(({ error: logError }) => { if (logError) console.warn('[excluirAcordo] log error:', logError.message); });
      toast.success(`Acordo #${a.nr_cliente} excluído!`);
      refetch();
    }
    setExcluindoId(null);
  }

  async function excluirSelecionados() {
    setConfirmandoExclusaoLote(false);
    let deletedCount = 0, failedCount = 0;
    for (const id of selecionados) {
      setExcluindoId(id);
      const acordo = acordos.find(a => a.id === id);
      const { error } = await supabase.from('acordos').delete().eq('id', id);
      if (error) {
        failedCount++;
      } else {
        deletedCount++;
        if (acordo) {
          supabase.from('logs_sistema').insert({
            usuario_id: perfil?.id ?? null, acao: 'exclusao_acordo', tabela: 'acordos',
            registro_id: id, empresa_id: empresa?.id ?? null,
            detalhes: { nome_cliente: acordo.nome_cliente, nr_cliente: acordo.nr_cliente,
              excluido_por: perfil?.nome ?? perfil?.email ?? null, excluido_em: new Date().toISOString(), modo: 'lote' },
          }).then(({ error: logError }) => { if (logError) console.warn('[excluirSelecionados] log error:', logError.message); });
        }
      }
    }
    setExcluindoId(null);
    setSelecionados([]);
    if (deletedCount > 0) toast.success(`${deletedCount} acordo(s) excluído(s) com sucesso!`);
    if (failedCount > 0) toast.error(`${failedCount} acordo(s) não puderam ser excluídos`);
    refetch();
  }

  // ── render helpers ────────────────────────────────────────────────────────────
  // Acordos de hoje para a seção de destaque
  const acordosDeHoje = useMemo(() =>
    acordosHoje.filter(a => a.vencimento === hoje),
    [acordosHoje, hoje],
  );

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {saudacao()}, {nome}! 👋
          </h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">
            {diaSemana}, {dataFormatada}
          </p>
          {empresa && (
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {empresa.nome}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isPP && acordosDeHoje.length > 0 && (
            <Button
              variant="outline" size="sm"
              className="hidden text-xs h-8 gap-1.5 text-success border-success/30 hover:bg-success/10"
              onClick={enviarLembretesHoje}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Lembretes do dia ({acordosDeHoje.length})
            </Button>
          )}
          <Button asChild size="sm">
            <Link to={ROUTE_PATHS.ACORDO_NOVO}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Acordo
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <motion.div
        variants={stagger} initial="hidden" animate="visible"
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
      >
        <StatCard title="Acordos Hoje"    value={metricas.acordos_hoje}
          icon={CalendarDays} color="bg-primary/10 text-primary" trend="neutral" loading={loadingMetricas} />
        <StatCard title="Pagos Hoje"      value={metricas.pagos_hoje}
          icon={CheckCircle2} color="bg-success/10 text-success" trend="up"      loading={loadingMetricas} />
        <StatCard title="Previsto Hoje"   value={formatCurrency(metricas.valor_previsto_hoje)}
          icon={DollarSign}   color="bg-info/10 text-info"        loading={loadingMetricas} />
        <StatCard title="Recebido Hoje"   value={formatCurrency(metricas.valor_recebido_hoje)}
          icon={TrendingUp}   color="bg-success/10 text-success"  trend="up"      loading={loadingMetricas} />
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          SEÇÃO EXCLUSIVA PAGUEPLAY — Acordos de Hoje em destaque + Tabela completa
          ════════════════════════════════════════════════════════════════════ */}
      {isPP && (
        <div className="space-y-6">

          {/* ── Seção 1: Acordos com vencimento HOJE ── */}
          <Card className="border-border border-warning/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-warning" />
                  Acordos com Vencimento Hoje
                  <Badge variant="secondary" className="text-xs bg-warning/15 text-warning border-warning/30">
                    {acordosDeHoje.length}
                  </Badge>
                </CardTitle>
                {acordosDeHoje.length > 0 && (
                  <Button
                    variant="outline" size="sm"
                    className="hidden text-xs h-7 gap-1.5 text-success border-success/30 hover:bg-success/10"
                    onClick={() => prepararFila(acordosDeHoje)}
                  >
                    <MessageSquare className="w-3 h-3" />
                    Enviar Lembretes
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHoje ? (
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-6 w-6 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : acordosDeHoje.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum acordo vence hoje</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-warning/5">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nome</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">CPF / Inscrição</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">WhatsApp</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Link</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pagamento</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acordosDeHoje.map((a, i) => {
                        const isEditingThis = editandoInlineId === a.id;
                        return (
                          <>
                            <tr
                              key={a.id}
                              className={cn(
                                'border-b border-border/50 hover:bg-accent/50 transition-colors',
                                i % 2 === 0 && 'bg-warning/3',
                                a.status === 'pago' && 'opacity-60',
                              )}
                            >
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded text-primary font-bold">
                                  <Hash className="w-2.5 h-2.5" />{a.nr_cliente}
                                </span>
                                {a.instituicao && (
                                  <p className="text-muted-foreground/70 mt-0.5 text-[11px]">{a.instituicao}</p>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-muted-foreground text-[11px]">
                                {a.whatsapp || '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {extractEstado(a.observacoes) ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                    <MapPin className="w-2.5 h-2.5" />{extractEstado(a.observacoes)}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2.5 max-w-[120px]">
                                {extractLinkAcordo(a.observacoes) ? (
                                  <a
                                    href={extractLinkAcordo(a.observacoes)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[100px]"
                                    title={extractLinkAcordo(a.observacoes)!}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Link2 className="w-2.5 h-2.5 flex-shrink-0" />
                                    <span className="truncate">ver link</span>
                                  </a>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                                  {TIPO_LABELS_PAGUEPLAY[a.tipo] || TIPO_LABELS[a.tipo]}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                                  {STATUS_LABELS_PAGUEPLAY[a.status] || STATUS_LABELS[a.status]}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {a.status !== 'pago' && a.status !== 'nao_pago' && (
                                    <Button
                                      variant="ghost" size="icon" className="w-6 h-6 text-success hover:bg-success/10"
                                      title="Marcar como Pago"
                                      disabled={atualizandoStatus === a.id}
                                      onClick={() => marcarComoPago(a.id)}
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost" size="icon"
                                    className={cn('w-6 h-6 hidden', a.whatsapp ? 'text-success hover:bg-success/10' : 'text-muted-foreground/30')}
                                    title={a.whatsapp ? 'Enviar WhatsApp' : 'Sem WhatsApp'}
                                    onClick={() => enviarUmWhatsapp(a)}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </Button>
                                  <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                                    <Link to={`/acordos/${a.id}`} title="Ver detalhe"><Eye className="w-3 h-3" /></Link>
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className={cn('w-6 h-6', isEditingThis && 'bg-primary/10 text-primary')}
                                    title={isEditingThis ? 'Fechar editor' : 'Editar'}
                                    onClick={() => setEditandoInlineId(isEditingThis ? null : a.id)}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isEditingThis && (
                              <AcordoEditInline
                                key={`inline-hoje-${a.id}`}
                                acordo={a}
                                onSaved={() => { setEditandoInlineId(null); refetch(); }}
                                onCancel={() => setEditandoInlineId(null)}
                              />
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Seção 2: Tabela completa de Acordos ── */}
          <div>
            {/* Cabeçalho da seção */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Acordos</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {loading ? 'Carregando...' : `${totalCount} acordo(s) no total`}
                  {selecionados.length > 0 && (
                    <span className="ml-2 text-primary font-medium">· {selecionados.length} selecionado(s)</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {selecionados.length > 0 && (
                  <>
                    <Button
                      variant="outline" size="sm"
                      className="hidden gap-1.5 border-success/40 text-success hover:bg-success/10 text-xs h-8"
                      onClick={() => prepararFila(acordos.filter(a => selecionados.includes(a.id)))}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      WhatsApp ({selecionados.length})
                    </Button>
                    {(perfil?.perfil === 'administrador' || perfil?.perfil === 'lider') && (
                      <Button
                        variant="outline" size="sm"
                        className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs h-8"
                        onClick={() => setConfirmandoExclusaoLote(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir ({selecionados.length})
                      </Button>
                    )}
                  </>
                )}
                <Button variant="outline" size="icon" className="w-8 h-8" onClick={refetch}>
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-border">
              {([
                { key: 'todos',     label: 'Todos' },
                { key: 'pagos',     label: 'Pagos / Quitados' },
                { key: 'nao_pagos', label: 'Não Pagos' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                    activeTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filtros */}
            <Card className="border-border mb-4">
              <CardContent className="p-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar NR, nome, WhatsApp..."
                      value={busca}
                      onChange={e => { setBusca(e.target.value); setCurrentPage(1); }}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <Select value={filtroStatus} onValueChange={v => { setFiltroStatus(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Status</SelectItem>
                      {Object.entries(statusLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Tipos</SelectItem>
                      {Object.entries(tipoLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <input
                    type="date"
                    value={filtroData}
                    onChange={e => { setFiltroData(e.target.value); setCurrentPage(1); }}
                    className="h-8 text-sm bg-background border border-input rounded-md px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {temFiltros && (
                    <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-8 text-xs gap-1">
                      <X className="w-3 h-3" /> Limpar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tabela completa */}
            <Card className="border-border">
              <CardContent className="p-0">
                {loading ? <TableSkeleton /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-3 py-3 w-8">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={selecionados.length === acordos.length && acordos.length > 0}
                              onChange={selecionarTodos}
                            />
                          </th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">NOME</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CPF</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">INSCRIÇÃO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">WHATSAPP</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">ESTADO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">PAGAMENTO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">LINK</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acordos.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Filter className="w-8 h-8 opacity-30" />
                                <p className="font-medium">Nenhum acordo encontrado</p>
                                <p className="text-xs">Ajuste os filtros ou cadastre um novo acordo</p>
                              </div>
                            </td>
                          </tr>
                        ) : acordos.map((a, i) => {
                          const atrasado   = isAtrasado(a.vencimento, a.status);
                          const venceHoje  = a.vencimento === hoje;
                          const sel        = selecionados.includes(a.id);
                          const isEditingThis = editandoInlineId === a.id;
                          return (
                            <>
                              <motion.tr
                                key={a.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: Math.min(i * 0.015, 0.3) }}
                                className={cn(
                                  'border-b border-border/50 hover:bg-accent/40 transition-colors',
                                  i % 2 === 0 && 'bg-muted/10',
                                  atrasado  && 'bg-destructive/5',
                                  venceHoje && a.status !== 'pago' && 'bg-warning/5',
                                  sel && 'bg-primary/5 border-primary/20',
                                  isEditingThis && 'bg-primary/5',
                                )}
                              >
                                <td className="px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    className="rounded border-border"
                                    checked={sel}
                                    onChange={() => toggleSelecionado(a.id)}
                                  />
                                </td>
                                {/* Nome */}
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                                </td>
                                {/* CPF / NR */}
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded text-primary font-bold">
                                    <Hash className="w-2.5 h-2.5" />{a.nr_cliente}
                                  </span>
                                </td>
                                {/* Inscrição */}
                                <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                                  {a.instituicao || '—'}
                                </td>
                                {/* WhatsApp */}
                                <td className="px-3 py-2.5 font-mono text-muted-foreground text-[11px]">
                                  {a.whatsapp || '—'}
                                </td>
                                {/* Estado */}
                                <td className="px-3 py-2.5">
                                  {extractEstado(a.observacoes) ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                      <MapPin className="w-2.5 h-2.5" />{extractEstado(a.observacoes)}
                                    </span>
                                  ) : '—'}
                                </td>
                                {/* Forma de pagamento */}
                                <td className="px-3 py-2.5">
                                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                                    {TIPO_LABELS_PAGUEPLAY[a.tipo] || TIPO_LABELS[a.tipo]}
                                  </span>
                                </td>
                                {/* Link do acordo */}
                                <td className="px-3 py-2.5 max-w-[120px]">
                                  {extractLinkAcordo(a.observacoes) ? (
                                    <a
                                      href={extractLinkAcordo(a.observacoes)!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[100px]"
                                      title={extractLinkAcordo(a.observacoes)!}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Link2 className="w-2.5 h-2.5 flex-shrink-0" />
                                      <span className="truncate">ver link</span>
                                    </a>
                                  ) : '—'}
                                </td>
                                {/* Status */}
                                <td className="px-3 py-2.5">
                                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                                    {STATUS_LABELS_PAGUEPLAY[a.status] || STATUS_LABELS[a.status]}
                                  </span>
                                </td>
                                {/* Ações */}
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center justify-end gap-0.5">
                                    {a.status !== 'pago' && a.status !== 'nao_pago' && (
                                      <Button
                                        variant="ghost" size="icon" className="w-6 h-6 text-success hover:bg-success/10"
                                        title="Marcar como Pago"
                                        disabled={atualizandoStatus === a.id}
                                        onClick={() => marcarComoPago(a.id)}
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost" size="icon"
                                      className={cn('w-6 h-6 hidden', a.whatsapp ? 'text-success hover:bg-success/10' : 'text-muted-foreground/30')}
                                      title={a.whatsapp ? 'Enviar WhatsApp' : 'Sem WhatsApp'}
                                      onClick={() => enviarUmWhatsapp(a)}
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                    </Button>
                                    <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                                      <Link to={`/acordos/${a.id}`} title="Ver detalhe"><Eye className="w-3 h-3" /></Link>
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon"
                                      className={cn('w-6 h-6', isEditingThis && 'bg-primary/10 text-primary')}
                                      title={isEditingThis ? 'Fechar editor' : 'Editar'}
                                      onClick={() => setEditandoInlineId(isEditingThis ? null : a.id)}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    {(perfil?.perfil === 'administrador' || perfil?.perfil === 'lider') && (
                                      <Button
                                        variant="ghost" size="icon"
                                        className="w-6 h-6 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                                        title="Excluir acordo"
                                        disabled={excluindoId === a.id}
                                        onClick={() => setConfirmandoExclusao(a)}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </motion.tr>
                              {/* Inline edit row */}
                              {isEditingThis && (
                                <AcordoEditInline
                                  key={`inline-${a.id}`}
                                  acordo={a}
                                  onSaved={() => { setEditandoInlineId(null); refetch(); }}
                                  onCancel={() => setEditandoInlineId(null)}
                                />
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Paginação */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    Próximo <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Modal fila WhatsApp */}
          {filaAberta && (
            <ModalFilaWhatsApp
              fila={filaWhatsApp}
              onClose={() => setFilaAberta(false)}
            />
          )}

          {/* Modal confirmar exclusão individual */}
          {confirmandoExclusao && (
            <Dialog open onOpenChange={() => setConfirmandoExclusao(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <Trash2 className="w-5 h-5" /> Confirmar exclusão
                  </DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-4">
                  <div className="text-sm text-foreground">
                    <p>Tem certeza que deseja excluir o acordo abaixo?</p>
                    <p>Esta ação não pode ser desfeita.</p>
                  </div>
                  <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">NR: <span className="text-primary font-mono font-bold">#{confirmandoExclusao.nr_cliente}</span></span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cliente: <span className="text-foreground font-bold">{confirmandoExclusao.nome_cliente.toUpperCase()}</span></span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor: <span className="text-foreground font-bold">{formatCurrency(confirmandoExclusao.valor)}</span></span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vencimento: <span className="text-foreground">{formatDate(confirmandoExclusao.vencimento)}</span></span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-4">
                  <Button variant="outline" onClick={() => setConfirmandoExclusao(null)}>Cancelar</Button>
                  <Button
                    variant="destructive"
                    className="bg-destructive hover:bg-destructive/90 text-white gap-2"
                    onClick={() => excluirAcordo(confirmandoExclusao)}
                  >
                    <Trash2 className="w-4 h-4" /> Excluir definitivamente
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Modal confirmar exclusão lote */}
          {confirmandoExclusaoLote && (
            <Dialog open onOpenChange={() => setConfirmandoExclusaoLote(false)}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <Trash2 className="w-4 h-4" /> Excluir {selecionados.length} acordos
                  </DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-2">
                  <p className="text-sm text-foreground">
                    Tem certeza que deseja excluir os <strong>{selecionados.length}</strong> acordos selecionados? Esta ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusaoLote(false)}>Cancelar</Button>
                  <Button variant="destructive" size="sm" className="gap-1.5" onClick={excluirSelecionados}>
                    <Trash2 className="w-3.5 h-3.5" /> Excluir todos
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SEÇÃO PADRÃO (Bookplay e outros tenants) — layout original
          ════════════════════════════════════════════════════════════════════ */}
      {!isPP && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Acordos do dia */}
          <div className="lg:col-span-2">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    Acordos de Hoje
                    <Badge variant="secondary" className="text-xs">{acordosHoje.length}</Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline" size="sm"
                      className="text-xs h-7 gap-1.5 text-success border-success/30 hover:bg-success/10"
                      onClick={() => {
                        acordosHoje.forEach(a => {
                          if (a.whatsapp) {
                            const msg = `Olá, ${a.nome_cliente}, passando para lembrar do seu acordo NR ${a.nr_cliente}, no valor de ${formatCurrency(a.valor)}, com vencimento em ${formatDate(a.vencimento)}. Qualquer dúvida, estamos à disposição.`;
                            window.open(`https://wa.me/55${a.whatsapp!.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
                          }
                        });
                      }}
                    >
                      <MessageSquare className="w-3 h-3" />
                      Enviar Lembretes
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                      <Link to={`${ROUTE_PATHS.ACORDOS}?data=${hoje}`}>
                        Ver todos <ArrowRight className="w-3 h-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingHoje ? (
                  <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-6 w-6 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : acordosHoje.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum acordo para hoje</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Cliente / NR</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Valor</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tipo</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acordosHoje.slice(0, 8).map((a, i) => (
                          <tr key={a.id} className={cn('border-b border-border/50 hover:bg-accent/50 transition-colors', i % 2 === 0 && 'bg-muted/10')}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-foreground">{a.nome_cliente}</p>
                              {a.instituicao && (
                                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{a.instituicao}</p>
                              )}
                              <p className="text-muted-foreground font-mono">{a.nr_cliente}</p>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{formatCurrency(a.valor)}</td>
                            <td className="px-4 py-2.5">
                              <span className="capitalize text-muted-foreground">{tipoLabels[a.tipo] || TIPO_LABELS[a.tipo]}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[a.status])}>
                                {statusLabels[a.status] || STATUS_LABELS[a.status]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {a.whatsapp && (
                                  <Button
                                    variant="ghost" size="icon" className="w-6 h-6 text-success hover:bg-success/10"
                                    onClick={() => {
                                      const msg = `Olá, ${a.nome_cliente}, passando para lembrar do seu acordo NR ${a.nr_cliente}, no valor de ${formatCurrency(a.valor)}, com vencimento em ${formatDate(a.vencimento)}. Qualquer dúvida, estamos à disposição.`;
                                      window.open(`https://wa.me/55${a.whatsapp!.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
                                    }}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                                  <Link to={`/acordos/${a.id}`}><ArrowRight className="w-3 h-3" /></Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {acordosHoje.length > 8 && (
                      <div className="px-4 py-3 text-center border-t border-border">
                        <Button asChild variant="ghost" size="sm" className="text-xs">
                          <Link to={`${ROUTE_PATHS.ACORDOS}?data=${hoje}`}>
                            Ver mais {acordosHoje.length - 8} acordos
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="space-y-4">
            {/* Pie - por status */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Por Status</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                        paddingAngle={3} dataKey="value">
                        {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'Acordos']} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>
                )}
              </CardContent>
            </Card>

            {/* Bar - por tipo */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Por Tipo de Acordo</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={tipoData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip />
                    <Bar dataKey="acordos" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Separator />

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>Total de acordos: <strong className="text-foreground font-mono">{todosAcordos.length}</strong></span>
              </div>
              <Button asChild variant="link" size="sm" className="text-xs h-auto p-0">
                <Link to={ROUTE_PATHS.ACORDOS}>Ver todos ↗</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
