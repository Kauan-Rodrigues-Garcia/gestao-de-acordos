import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MessageSquare, Edit,
  Filter, RefreshCw, X,
  Trash2, ChevronLeft, ChevronRight, CheckCircle, Hash, MapPin, Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAcordos } from '@/hooks/useAcordos';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  ROUTE_PATHS, STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_COLORS,
  formatCurrency, formatDate, getTodayISO, isAtrasado,
  isPaguePlay, getStatusLabels, getTipoLabels,
  STATUS_LABELS_PAGUEPLAY, TIPO_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo,
} from '@/lib/index';
import { cn } from '@/lib/utils';
import { ModalFilaWhatsApp, type ItemFila } from '@/components/ModalFilaWhatsApp';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { AcordoDetalheInline } from '@/components/AcordoDetalheInline';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import { criarNotificacao }         from '@/services/notificacoes.service';
import { liberarNrPorAcordoId }     from '@/services/nr_registros.service';

function buildMensagem(a: Acordo): string {
  if (a.status === 'nao_pago') {
    return `Olá *${a.nome_cliente}*, identificamos que o seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*, encontra-se em atraso. Por favor, entre em contato conosco o mais breve possível para regularizar sua situação. Estamos à disposição para ajudar.`;
  }
  return `Olá *${a.nome_cliente}*, passando para lembrar do seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*. Qualquer dúvida, estamos à disposição.`;
}

// ─── Tabela Skeleton ────────────────────────────────────────────────────────
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

const PER_PAGE = 20;

export default function Acordos() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);
  const statusLabels = getStatusLabels(tenantSlug);
  const tipoLabels   = getTipoLabels(tenantSlug);
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados locais sincronizados com URL
  const [busca, setBusca]           = useState(searchParams.get('busca') || '');
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo, setFiltroTipo] = useState(searchParams.get('tipo') || '');
  const [filtroData, setFiltroData] = useState(searchParams.get('data') || '');
  const [filtroOperador, setFiltroOperador] = useState(searchParams.get('operador') || '');
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
  const [activeTab, setActiveTab] = useState<'analitico' | 'todos' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'analitico' | 'todos' | 'pagos' | 'nao_pagos') || 'analitico'
  );

  // Mapa operadorId → nome
  const [operadoresMap, setOperadoresMap] = useState<Record<string, string>>({});

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [atualizandoStatus, setAtualizandoStatus] = useState<string | null>(null);
  const [filaAberta, setFilaAberta] = useState(false);
  const [filaWhatsApp, setFilaWhatsApp] = useState<ItemFila[]>([]);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);
  // Inline edit in the list, for both Bookplay and PaguePlay
  const [editandoInlineId, setEditandoInlineId] = useState<string | null>(null);
  // Inline detail view
  const [detalheInlineId, setDetalheInlineId] = useState<string | null>(null);
  // Novo acordo inline
  const [novoInlineAberto, setNovoInlineAberto] = useState(false);

  // Filtro de mês — ativo para Bookplay
  const [mesFiltro, setMesFiltro] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Debounce para busca
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (busca) params.set('busca', busca); else params.delete('busca');
      if (filtroStatus) params.set('status', filtroStatus); else params.delete('status');
      if (filtroTipo) params.set('tipo', filtroTipo); else params.delete('tipo');
      if (filtroData) params.set('data', filtroData); else params.delete('data');
      if (filtroOperador) params.set('operador', filtroOperador); else params.delete('operador');
      if (activeTab !== 'todos') params.set('tab', activeTab); else params.delete('tab');
      params.set('page', currentPage.toString());
      setSearchParams(params);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTipo, filtroData, filtroOperador, activeTab, currentPage, setSearchParams]);

  // Calcular status baseado na tab ativa e filtro manual
  // Analítico = apenas acordos ativos (excluindo pago e nao_pago)
  const statusFiltro = filtroStatus && filtroStatus !== 'all'
    ? filtroStatus
    : activeTab === 'analitico'
    ? undefined  // sem filtro de status fixo — o filtro extra é feito no front
    : activeTab === 'pagos'
    ? 'pago'
    : activeTab === 'nao_pagos'
    ? 'nao_pago'
    : filtroStatus || undefined;

  // Mês filtrado: início/fim para Bookplay
  const bpMesInicio = (!isPP && mesFiltro) ? `${mesFiltro}-01` : undefined;
  const bpMesFim = (!isPP && mesFiltro)
    ? (() => {
        const [y, m] = mesFiltro.split('-').map(Number);
        return `${mesFiltro}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      })()
    : undefined;

  const { acordos, totalCount, loading, refetch, patchAcordo, removeAcordo, addAcordo, realtimeStatus } = useAcordos({
    busca:        busca || undefined,
    status:       statusFiltro,
    tipo:         filtroTipo && filtroTipo !== 'all' ? filtroTipo : undefined,
    vencimento:   filtroData || undefined,
    data_inicio:  filtroData ? undefined : bpMesInicio,
    data_fim:     filtroData ? undefined : bpMesFim,
    operador_id:  perfil?.perfil === 'operador'
      ? perfil.id
      : (filtroOperador && filtroOperador !== 'all' ? filtroOperador : undefined),
    page:         currentPage,
    perPage:      PER_PAGE,
  });

  // Buscar nomes dos operadores após carregar acordos
  useEffect(() => {
    const ids = [...new Set(acordos.map(a => a.operador_id).filter(Boolean))] as string[];
    if (ids.length === 0) return;
    supabase.from('perfis').select('id, nome').in('id', ids).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => { map[p.id] = p.nome; });
        setOperadoresMap(prev => ({ ...prev, ...map }));
      }
    });
  }, [acordos]);

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const hoje = getTodayISO();
  const temFiltros = !!(busca || filtroStatus || filtroTipo || filtroData || filtroOperador);

  // ── Mover acordos atrasados (verificar_pendente + vencimento passado) para nao_pago ──
  useEffect(() => {
    if (loading || acordos.length === 0) return;
    const atrasados = acordos.filter(a =>
      a.status === 'verificar_pendente' && a.vencimento < hoje
    );
    if (atrasados.length === 0) return;
    Promise.all(
      atrasados.map(a =>
        supabase.from('acordos').update({ status: 'nao_pago' }).eq('id', a.id)
      )
    ).then(() => {
      toast.info(`${atrasados.length} acordo(s) atrasado(s) movido(s) para "Não Pago"`);
      atrasados.forEach(a => {
        if (a.operador_id) {
          criarNotificacao({
            usuario_id: a.operador_id,
            titulo: 'Acordo movido para Não Pago',
            mensagem: `O acordo NR ${a.nr_cliente} foi movido para "Não Pago" por atraso.`,
            empresa_id: empresa?.id,
          });
        }
      });
     refetch();
   }).catch(e => {
     console.warn('[Acordos] erro ao mover atrasados:', e);
   });
  }, [acordos, loading]); // refetch aqui é necessário: operação em lote

  function limparFiltros() {
    setBusca(''); setFiltroStatus(''); setFiltroTipo(''); setFiltroData(''); setFiltroOperador(''); setCurrentPage(1);
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
    patchAcordo(id, { status: 'pago' }); // Optimistic update
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', id);
    if (error) {
      patchAcordo(id, { status: acordos.find(a => a.id === id)?.status ?? 'verificar_pendente' }); // rollback
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Acordo marcado como Pago!');
    }
    setAtualizandoStatus(null);
  }

  // ── Preparar fila de lembretes ─────────────────────────────────────────
  function prepararFila(listaAcordos: Acordo[]) {
    const comWhats = listaAcordos.filter(a => a.whatsapp);
    const semWhats = listaAcordos.filter(a => !a.whatsapp);

    if (comWhats.length === 0) {
      toast.warning('Nenhum acordo selecionado possui WhatsApp cadastrado');
      return;
    }
    if (semWhats.length > 0) {
      toast.info(`${semWhats.length} acordo(s) sem WhatsApp serão ignorados`);
    }

    const fila: ItemFila[] = comWhats.map(a => ({
      id: a.id,
      nome_cliente: a.nome_cliente,
      nr_cliente: a.nr_cliente,
      whatsapp: a.whatsapp!,
      valor: a.valor,
      vencimento: a.vencimento,
      mensagem: buildMensagem(a),
      link: `https://wa.me/55${a.whatsapp!.replace(/\D/g,'')}?text=${encodeURIComponent(buildMensagem(a))}`,
      enviado: false,
    }));

    setFilaWhatsApp(fila);
    setFilaAberta(true);
  }

  function enviarLembretesHoje() {
    const lista = acordos.filter(a => a.vencimento === hoje);
    if (lista.length === 0) { toast.info('Nenhum acordo vence hoje'); return; }
    prepararFila(lista);
  }

  async function excluirAcordo(a: Acordo) {
    setConfirmandoExclusao(null);
    setExcluindoId(a.id);
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) toast.error('Erro ao excluir acordo: ' + error.message);
    else {
      // Liberar NR na tabela nr_registros (best-effort)
      liberarNrPorAcordoId(a.id);
      // Registrar log de exclusão (best-effort — não bloqueia em caso de falha)
      supabase.from('logs_sistema').insert({
        usuario_id: perfil?.id ?? null,
        acao: 'exclusao_acordo',
        tabela: 'acordos',
        registro_id: a.id,
        empresa_id: empresa?.id ?? null,
        detalhes: {
          nome_cliente: a.nome_cliente,
          nr_cliente: a.nr_cliente,
          excluido_por: perfil?.nome ?? perfil?.email ?? null,
          excluido_em: new Date().toISOString(),
        },
      }).then(({ error: logError }) => {
        if (logError) console.warn('[excluirAcordo] log error:', logError.message);
      });
     toast.success(`Acordo #${a.nr_cliente} excluído!`);
      removeAcordo(a.id); // Optimistic: remove sem refetch
    }
    setExcluindoId(null);
  }

  async function excluirSelecionados() {
    setConfirmandoExclusaoLote(false);
    let deletedCount = 0;
    let failedCount = 0;

    for (const id of selecionados) {
      setExcluindoId(id);
      const acordo = acordos.find(a => a.id === id);
      const { error } = await supabase.from('acordos').delete().eq('id', id);
      if (error) {
        failedCount++;
        console.error(`[excluirSelecionados] erro ao excluir ${id}:`, error.message);
      } else {
        deletedCount++;
        liberarNrPorAcordoId(id); // Liberar NR (best-effort)
        removeAcordo(id); // Optimistic: remove sem refetch
        if (acordo) {
          supabase.from('logs_sistema').insert({
            usuario_id: perfil?.id ?? null,
            acao: 'exclusao_acordo',
            tabela: 'acordos',
            registro_id: id,
            empresa_id: empresa?.id ?? null,
            detalhes: {
              nome_cliente: acordo.nome_cliente,
              nr_cliente: acordo.nr_cliente,
              excluido_por: perfil?.nome ?? perfil?.email ?? null,
              excluido_em: new Date().toISOString(),
              modo: 'lote',
            },
          }).then(({ error: logError }) => {
            if (logError) console.warn('[excluirSelecionados] log error:', logError.message);
          });
        }
      }
    }

    setExcluindoId(null);
    setSelecionados([]);

    if (deletedCount > 0) {
      toast.success(`${deletedCount} acordo(s) excluído(s) com sucesso!`);
    }
   if (failedCount > 0) {
     toast.error(`${failedCount} acordo(s) não puderam ser excluídos`);
   }
  }

  function enviarUmWhatsapp(a: Acordo) {
    if (!a.whatsapp) { toast.warning('WhatsApp não cadastrado'); return; }
    const mensagem = buildMensagem(a);
    window.open(`https://wa.me/55${a.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(mensagem)}`, '_blank');
    // Registrar log (best-effort)
    if (perfil?.id) {
      supabase.from('logs_sistema').insert({
        usuario_id: perfil.id,
        acao: 'envio_lembrete_whatsapp',
        tabela: 'acordos',
        registro_id: a.id,
        empresa_id: empresa?.id ?? null,
        detalhes: {
          acordo_id:    a.id,
          nome_cliente: a.nome_cliente,
          nr_cliente:   a.nr_cliente,
          modo:         'individual',
        },
      }).then(({ error }) => {
        if (error) console.warn('[enviarUmWhatsapp] log error:', error.message);
      });
    }
  }

  const acordosHoje = useMemo(() => acordos.filter(a => a.vencimento === hoje), [acordos, hoje]);

  // Analítico: apenas acordos que NÃO são pago nem nao_pago
  const STATUSES_ANALITICO_EXCLUIDOS = ['pago', 'nao_pago'];
  const acordosParaExibir = useMemo(() => {
    if (activeTab === 'analitico') {
      return acordos.filter(a => !STATUSES_ANALITICO_EXCLUIDOS.includes(a.status));
    }
    return acordos;
  }, [acordos, activeTab]);

  return (
    <div className="p-6">
      <div className="max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Acordos</h1>
            {/* Seletor de mês — Bookplay only */}
            {!isPP && (
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="outline" size="icon" className="h-6 w-6"
                  onClick={() => {
                    const [y, m] = mesFiltro.split('-').map(Number);
                    const prev = new Date(y, m - 2, 1);
                    setMesFiltro(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                    setCurrentPage(1);
                  }}
                >
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <span className="text-xs font-semibold min-w-[100px] text-center text-muted-foreground">
                  {new Date(mesFiltro + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </span>
                <Button
                  variant="outline" size="icon" className="h-6 w-6"
                  onClick={() => {
                    const [y, m] = mesFiltro.split('-').map(Number);
                    const next = new Date(y, m, 1);
                    setMesFiltro(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                    setCurrentPage(1);
                  }}
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground px-2"
                  onClick={() => {
                    const d = new Date();
                    setMesFiltro(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    setCurrentPage(1);
                  }}
                >
                  Mês atual
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Carregando...' : `${totalCount} acordo(s) no total`}
              {selecionados.length > 0 && (
                <span className="ml-2 text-primary font-medium">· {selecionados.length} selecionado(s)</span>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Lembretes do dia — oculto para PaguePay */}
            {acordosHoje.length > 0 && selecionados.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'gap-1.5 border-success/40 text-success hover:bg-success/10',
                  isPP && 'hidden'
                )}
                onClick={enviarLembretesHoje}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Lembretes do dia ({acordosHoje.length})
              </Button>
            )}
            <Button variant="outline" size="icon" className="w-8 h-8 relative" onClick={refetch}
              title={realtimeStatus === 'connected' ? 'Realtime ativo' : realtimeStatus === 'connecting' ? 'Conectando...' : realtimeStatus === 'error' ? 'Erro no Realtime' : 'Sem Realtime'}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              <span className={cn(
                'absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
                realtimeStatus === 'connected'  && 'bg-green-500',
                realtimeStatus === 'connecting' && 'bg-yellow-400 animate-pulse',
                realtimeStatus === 'error'      && 'bg-red-500',
                realtimeStatus === 'off'        && 'bg-muted-foreground/40',
              )} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNovoInlineAberto(v => !v)}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> Novo Acordo
            </Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 mb-4 border-b border-border">
          {([
            { key: 'analitico',  label: 'Analítico' },
            { key: 'todos',      label: 'Todos' },
            { key: 'pagos',      label: 'Pagos / Quitados' },
            { key: 'nao_pagos',  label: 'Não Pagos' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Filtros ── */}
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
              <Select value={filtroStatus} onValueChange={(v) => { setFiltroStatus(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  {Object.entries(statusLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v); setCurrentPage(1); }}>
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
              {isPP && (perfil?.perfil === 'administrador' || perfil?.perfil === 'lider') && (
                <Select value={filtroOperador} onValueChange={v => { setFiltroOperador(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Operador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Operadores</SelectItem>
                    {Object.entries(operadoresMap).map(([id, nome]) => (
                      <SelectItem key={id} value={id}>{nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {temFiltros && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-8 text-xs gap-1">
                  <X className="w-3 h-3" /> Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Tabela ── */}
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
                      {isPP ? (
                        <>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">NOME</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CPF</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">INSCRIÇÃO</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">ESTADO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">PAGAMENTO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">LINK</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">NR</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CLIENTE</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">VENCIMENTO</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">TIPO</th>
                          <th className="text-center px-3 py-3 font-semibold text-muted-foreground">PARCELAS</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>
                        </>
                      )}
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {novoInlineAberto && (
                      <AcordoNovoInline
                        isPaguePlay={isPP}
                        colSpan={isPP ? 11 : 10}
                        onSaved={(inserido) => { setNovoInlineAberto(false); addAcordo(inserido); }}
                        onCancel={() => setNovoInlineAberto(false)}
                        onAcordoRemovido={(id) => removeAcordo(id)}
                      />
                    )}
                    {acordosParaExibir.length === 0 ? (
                      <tr>
                        <td colSpan={isPP ? 11 : 10} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Filter className="w-8 h-8 opacity-30" />
                            <p className="font-medium">Nenhum acordo encontrado</p>
                            <p className="text-xs">Ajuste os filtros ou cadastre um novo acordo</p>
                          </div>
                        </td>
                      </tr>
                    ) : acordosParaExibir.map((a, i) => {
                      const atrasado  = isAtrasado(a.vencimento, a.status);
                      const venceHoje = a.vencimento === hoje;
                      const sel       = selecionados.includes(a.id);
                      const isEditingThis = editandoInlineId === a.id;
                      const isDetailThis = detalheInlineId === a.id;
                      return (
                        <>
                        <motion.tr
                          key={a.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.015, 0.3) }}
                          className={cn(
                            'border-b border-border/50 hover:bg-accent/40 transition-colors cursor-pointer',
                            i % 2 === 0 && 'bg-muted/10',
                            atrasado  && 'bg-destructive/5',
                            venceHoje && a.status !== 'pago' && 'bg-warning/5',
                            sel && 'bg-primary/5 border-primary/20',
                            isEditingThis && 'bg-primary/5',
                            isDetailThis && 'bg-accent/50'
                          )}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('button') || target.closest('a') || target.closest('input')) return;
                            if (!isEditingThis) setDetalheInlineId(detalheInlineId === a.id ? null : a.id);
                          }}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={sel}
                              onChange={() => toggleSelecionado(a.id)}
                            />
                          </td>
                          {isPP ? (
                            <>
                              {/* Nome do profissional */}
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                              </td>
                              {/* CPF — clica APENAS copia, não abre detalhe */}
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  title="Clique para copiar o CPF"
                                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(a.nr_cliente); toast.success(`CPF ${a.nr_cliente} copiado!`); }}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded text-primary font-bold hover:bg-primary/15 hover:border-primary/40 transition-colors cursor-pointer"
                                >
                                  <Hash className="w-2.5 h-2.5" />{a.nr_cliente}
                                </button>
                              </td>
                              {/* Inscrição */}
                              <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                                {a.instituicao || '—'}
                              </td>
                              {/* Valor */}
                              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                                {formatCurrency(a.valor)}
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
                              {/* Link do acordo — clicável em nova aba */}
                              <td className="px-3 py-2.5 max-w-[120px]">
                                {extractLinkAcordo(a.observacoes) ? (
                                  <a
                                    href={extractLinkAcordo(a.observacoes)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[100px]"
                                    title={extractLinkAcordo(a.observacoes)!}
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
                              {/* Operador */}
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                {a.operador_id ? (operadoresMap[a.operador_id] || '...') : '—'}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  title="Clique para copiar o NR"
                                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(a.nr_cliente); toast.success(`NR ${a.nr_cliente} copiado!`); }}
                                  className="inline-flex items-center gap-1 font-mono font-bold text-primary text-[11px] bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded hover:bg-primary/15 hover:border-primary/40 transition-colors cursor-pointer"
                                >
                                  <Hash className="w-2.5 h-2.5" />{a.nr_cliente}
                                </button>
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                                {a.instituicao && (
                                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{a.instituicao}</p>
                                )}
                                {a.whatsapp && (
                                  <p className="font-mono text-muted-foreground/70 text-[10px] mt-0.5">{a.whatsapp}</p>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={cn('font-mono', atrasado && 'text-destructive font-semibold', venceHoje && 'text-warning font-semibold')}>
                                  {formatDate(a.vencimento)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                                {formatCurrency(a.valor)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                                  {TIPO_LABELS[a.tipo]}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                                {['boleto', 'cartao_recorrente', 'pix_automatico'].includes(a.tipo) ? a.parcelas : '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                                  {STATUS_LABELS[a.status]}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                                {(a.perfis as { nome?: string } | undefined)?.nome?.split(' ')[0] || '—'}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
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
                              {/* Botão WhatsApp individual — oculto para PaguePay */}
                              <Button
                                variant="ghost" size="icon"
                                className={cn(
                                  'w-6 h-6',
                                  a.whatsapp ? 'text-success hover:bg-success/10' : 'text-muted-foreground/30',
                                  isPP && 'hidden'
                                )}
                                title={a.whatsapp ? 'Enviar WhatsApp' : 'Sem WhatsApp'}
                                onClick={() => enviarUmWhatsapp(a)}
                              >
                                <MessageSquare className="w-3 h-3" />
                              </Button>

                              <Button
                                variant="ghost" size="icon" className={cn('w-6 h-6', isEditingThis && 'bg-primary/10 text-primary')}
                                title={isEditingThis ? 'Fechar editor' : 'Editar'}
                                onClick={() => setEditandoInlineId(isEditingThis ? null : a.id)}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="w-6 h-6 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                                title="Excluir acordo"
                                disabled={excluindoId === a.id}
                                onClick={() => setConfirmandoExclusao(a)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                        {/* Inline edit row */}
                        {isEditingThis && (
                          <AcordoEditInline
                            key={`inline-${a.id}`}
                            acordo={a}
                            isPaguePlay={isPP}
                            onSaved={(atualizado) => {
                              setEditandoInlineId(null);
                              patchAcordo(atualizado.id, atualizado); // Optimistic update
                            }}
                            onCancel={() => setEditandoInlineId(null)}
                          />
                        )}
                        {/* Inline detail row */}
                        {isDetailThis && !isEditingThis && (
                          <AcordoDetalheInline
                            key={`detalhe-${a.id}`}
                            acordo={a}
                            isPaguePlay={isPP}
                            colSpan={isPP ? 11 : 10}
                            onClose={() => setDetalheInlineId(null)}
                            onSaved={(atualizado) => {
                              patchAcordo(atualizado.id, atualizado);
                            }}
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
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Anterior</Button>
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Próximo <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal confirmação exclusão ── */}
      {confirmandoExclusao && (
        <Dialog open onOpenChange={() => setConfirmandoExclusao(null)}>
          <DialogContent className="max-w-md" aria-describedby="dlg-excl-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Confirmar exclusão
              </DialogTitle>
              <DialogDescription id="dlg-excl-desc" className="sr-only">Confirmar exclusão do acordo selecionado</DialogDescription>
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
              <Button variant="outline" onClick={() => setConfirmandoExclusao(null)}>
                Cancelar
              </Button>
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

      {/* ── Modal confirmação exclusão lote ── */}
      {confirmandoExclusaoLote && (
        <Dialog open onOpenChange={() => setConfirmandoExclusaoLote(false)}>
          <DialogContent className="max-w-sm" aria-describedby="dlg-excl-lote-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> Excluir {selecionados.length} acordos
              </DialogTitle>
              <DialogDescription id="dlg-excl-lote-desc" className="sr-only">Confirmar exclusão em lote dos acordos selecionados</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-sm text-foreground">
                Tem certeza que deseja excluir os <strong>{selecionados.length}</strong> acordos selecionados? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusaoLote(false)}>Cancelar</Button>
              <Button
                variant="destructive" size="sm"
                className="gap-1.5"
                onClick={excluirSelecionados}
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Tudo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modal fila WhatsApp ── */}
      {filaAberta && (
        <ModalFilaWhatsApp
          fila={filaWhatsApp}
          usuarioId={perfil?.id}
          empresaId={empresa?.id}
          modo="lote"
          onClose={() => { setFilaAberta(false); setSelecionados([]); }}
        />
      )}

      {/* ── Floating Action Bar (seleção múltipla) ── */}
      <AnimatePresence>
        {selecionados.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-white/10 bg-gray-900/95 backdrop-blur-md text-white">
              <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                {selecionados.length} selecionado(s)
              </span>
              <div className="w-px h-5 bg-white/20" />
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-green-400 hover:text-green-300 hover:bg-white/10 text-xs h-8 px-3"
                onClick={() => {
                  const lista = acordos.filter(a => selecionados.includes(a.id));
                  prepararFila(lista);
                }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Enviar Lembretes
              </Button>
              {(perfil?.perfil === 'administrador' || perfil?.perfil === 'lider') && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-white/10 text-xs h-8 px-3"
                  onClick={() => setConfirmandoExclusaoLote(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Selecionados
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-white/60 hover:text-white hover:bg-white/10 text-xs h-8 px-2"
                onClick={() => setSelecionados([])}
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
