import { useState, useEffect, useMemo, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Plus, MessageSquare, RefreshCw, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAcordos } from '@/hooks/useAcordos';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase, Acordo } from '@/lib/supabase';
import { ModalConfirmarPagamento } from '@/components/ModalConfirmarPagamento';
import { toast } from 'sonner';
import {
  ROUTE_PATHS, formatCurrency, formatDate, getTodayISO,
  isPerfilLider,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';
import { type ItemFila } from '@/components/ModalFilaWhatsApp';
import { liberarNrPorAcordoId }  from '@/services/nr_registros.service';
import { enviarParaLixeira }     from '@/services/lixeira.service';
import { tratarExclusaoVinculo } from '@/services/tratarExclusaoVinculo';
import { deduplicarVinculados, temVisaoAmpla, type AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import type { Perfil } from '@/lib/supabase';
import { buildMensagem, TableSkeleton, PER_PAGE, getPageNumbers, type VisaoFiltroAcordos } from './helpers';
import { AcordosFilters } from './AcordosFilters';
import { AcordosTableBody } from './AcordosTableBody';
import { AcordosModals } from './AcordosModals';

export default function Acordos() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const statusLabels = tenant.statusLabels;
  const tipoLabels   = tenant.tipoLabels;
  const [searchParams, setSearchParams] = useSearchParams();

  const [busca, setBusca]               = useState(searchParams.get('busca') || '');
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo, setFiltroTipo]     = useState(searchParams.get('tipo') || '');
  const [filtroData, setFiltroData]     = useState(searchParams.get('data') || '');
  const [filtroOperador, setFiltroOperador] = useState(searchParams.get('operador') || '');
  const [currentPage, setCurrentPage]   = useState(Number(searchParams.get('page')) || 1);

  const isLider = isPerfilLider(perfil?.perfil ?? '');
  const isElite = perfil?.perfil === 'elite';
  const [visaoFiltroAcordos, setVisaoFiltroAcordos] = useState<VisaoFiltroAcordos>('setor');
  const [equipesDoSetor, setEquipesDoSetor] = useState<{ id: string; nome: string }[]>([]);

  // Com 'ver_todos_setores' o líder vê equipes de toda a empresa no filtro
  const verTodosSetores = temPermissao('ver_todos_setores');

  useEffect(() => {
    if (!(isLider || isElite) || !empresa?.id) return;
    if (!perfil?.setor_id && !verTodosSetores) return;
    let q = supabase
      .from('equipes')
      .select('id, nome')
      .eq('empresa_id', empresa.id);
    if (!verTodosSetores && perfil?.setor_id) {
      q = q.eq('setor_id', perfil.setor_id);
    }
    q.order('nome')
      .then(({ data }) => {
        setEquipesDoSetor((data as { id: string; nome: string }[]) ?? []);
      });
  }, [isLider, isElite, perfil?.setor_id, empresa?.id, verTodosSetores]);

  const equipeFiltroAtivo  = visaoFiltroAcordos.startsWith('equipe:')
    ? visaoFiltroAcordos.replace('equipe:', '')
    : null;
  const isVisaoIndividual  = visaoFiltroAcordos === 'individual';
  const [activeTab, setActiveTab] = useState<'analitico' | 'todos' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'analitico' | 'todos' | 'pagos' | 'nao_pagos') || 'analitico',
  );

  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const usuarioTemLogicaDiretoExtra = isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );
  const [filtroVinculo, setFiltroVinculo] = useState<'todos' | 'direto' | 'extra'>(
    (searchParams.get('vinculo') as 'todos' | 'direto' | 'extra') || 'todos',
  );

  const [operadoresMap, setOperadoresMap] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados]   = useState<string[]>([]);
  const [atualizandoStatus, setAtualizandoStatus]         = useState<string | null>(null);
  const [confirmarPgtoAcordo, setConfirmarPgtoAcordo]     = useState<Acordo | null>(null);
  const [salvandoConfirmarPgto, setSalvandoConfirmarPgto] = useState(false);
  const [filaAberta, setFilaAberta]       = useState(false);
  const [filaWhatsApp, setFilaWhatsApp]   = useState<ItemFila[]>([]);
  const [excluindoId, setExcluindoId]     = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);
  const [editandoInlineId, setEditandoInlineId]   = useState<string | null>(null);
  const [detalheInlineId, setDetalheInlineId]     = useState<string | null>(null);
  const [novoInlineAberto, setNovoInlineAberto]   = useState(false);
  const novoInlineRef = useRef<HTMLDivElement>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const findingPageRef     = useRef(false);
  const highlightFoundRef  = useRef(false);
  const findAttemptsRef    = useRef(0);

  const [mesFiltro, setMesFiltro] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const highlightParam = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightParam) return;
    highlightFoundRef.current = false;
    findAttemptsRef.current   = 0;
    setHighlightedId(highlightParam);
    const params = new URLSearchParams(searchParams);
    params.delete('highlight');
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightParam]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (busca) params.set('busca', busca); else params.delete('busca');
      if (filtroStatus) params.set('status', filtroStatus); else params.delete('status');
      if (filtroTipo)   params.set('tipo',   filtroTipo);   else params.delete('tipo');
      if (filtroData)   params.set('data',   filtroData);   else params.delete('data');
      if (filtroOperador) params.set('operador', filtroOperador); else params.delete('operador');
      if (activeTab !== 'todos') params.set('tab', activeTab); else params.delete('tab');
      if (filtroVinculo !== 'todos') params.set('vinculo', filtroVinculo); else params.delete('vinculo');
      params.set('page', currentPage.toString());
      setSearchParams(params);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTipo, filtroData, filtroOperador, activeTab, filtroVinculo, currentPage, setSearchParams]);

  const statusFiltro = filtroStatus && filtroStatus !== 'all'
    ? filtroStatus
    : activeTab === 'analitico'
    ? undefined
    : activeTab === 'pagos'
    ? 'pago'
    : activeTab === 'nao_pagos'
    ? 'nao_pago'
    : filtroStatus || undefined;

  const bpMesInicio = (!isPP && mesFiltro) ? `${mesFiltro}-01` : undefined;
  const bpMesFim    = (!isPP && mesFiltro)
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
    operador_id:  (!temPermissao('ver_acordos_gerais') || isVisaoIndividual)
      ? perfil?.id
      : (filtroOperador && filtroOperador !== 'all' ? filtroOperador : undefined),
    equipe_id:    equipeFiltroAtivo ?? undefined,
    page:         currentPage,
    perPage:      PER_PAGE,
  });

  async function findAcordoPage(acordoId: string) {
    if (!empresa?.id) return;
    const { data: a } = await supabase
      .from('acordos')
      .select('id, vencimento, status')
      .eq('id', acordoId)
      .single();
    if (!a) return;
    const [ano, mes]  = (a.vencimento as string).split('-');
    const mesStr      = `${ano}-${mes}`;
    const { count }   = await supabase
      .from('acordos')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa.id)
      .eq('status', a.status)
      .gte('vencimento', `${mesStr}-01`)
      .lt('vencimento', a.vencimento);
    const page = Math.floor((count ?? 0) / PER_PAGE) + 1;
    setBusca(''); setFiltroStatus(''); setFiltroTipo('');
    setFiltroData(''); setFiltroOperador(''); setFiltroVinculo('todos');
    setMesFiltro(mesStr);
    if ((a.status as string) === 'nao_pago') setActiveTab('nao_pagos');
    else if ((a.status as string) === 'pago') setActiveTab('pagos');
    else                                       setActiveTab('todos');
    setCurrentPage(page);
  }

  useEffect(() => {
    if (!highlightedId || loading || highlightFoundRef.current) return;
    if (acordos.some(a => a.id === highlightedId)) {
      highlightFoundRef.current = true;
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 800);
    } else if (!findingPageRef.current && findAttemptsRef.current < 3) {
      findingPageRef.current = true;
      findAttemptsRef.current++;
      findAcordoPage(highlightedId).finally(() => { findingPageRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordos, loading, highlightedId]);

  useEffect(() => {
    if (novoInlineAberto) {
      novoInlineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [novoInlineAberto]);

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
  const hoje       = getTodayISO();
  const temFiltros = !!(busca || filtroStatus || filtroTipo || filtroData || filtroOperador);
  const filtrosAtivosCount = [
    busca,
    filtroStatus && filtroStatus !== 'all' ? filtroStatus : '',
    filtroTipo   && filtroTipo   !== 'all' ? filtroTipo   : '',
    filtroVinculo !== 'todos' ? filtroVinculo : '',
    filtroOperador && filtroOperador !== 'all' ? filtroOperador : '',
  ].filter(Boolean).length;


  function limparFiltros() {
    setBusca(''); setFiltroStatus(''); setFiltroTipo('');
    setFiltroData(''); setFiltroOperador(''); setCurrentPage(1);
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function selecionarTodos() {
    if (selecionados.length === acordos.length) setSelecionados([]);
    else setSelecionados(acordos.map(a => a.id));
  }

  function marcarComoPago(a: Acordo) {
    if (a.status === 'nao_pago') {
      setConfirmarPgtoAcordo(a);
    } else {
      // Pendente → pago sem caixa: mantém o vencimento tabulado do acordo
      void executarMarcarPago(a, a.vencimento);
    }
  }

  async function executarMarcarPago(a: Acordo, dataPagamento: string) {
    const id = a.id;
    const statusAnterior = a.status;
    const vencimentoAnterior = a.vencimento;
    setAtualizandoStatus(id);
    // Recebimento é atribuído ao vencimento → grava a data escolhida no vencimento
    patchAcordo(id, { status: 'pago', vencimento: dataPagamento });
    const updatePayload: Record<string, unknown> = {
      status: 'pago', data_pagamento: dataPagamento, vencimento: dataPagamento,
    };
    let { error } = await supabase.from('acordos').update(updatePayload).eq('id', id);
    if (error && (String(error.code) === '42703' || String(error.code) === '400' || error.message?.toLowerCase().includes('column'))) {
      ({ error } = await supabase.from('acordos').update({ status: 'pago', vencimento: dataPagamento }).eq('id', id));
    }
    if (error) {
      patchAcordo(id, { status: statusAnterior, vencimento: vencimentoAnterior });
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Acordo marcado como Pago!', {
        duration: 5000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            patchAcordo(id, { status: statusAnterior, vencimento: vencimentoAnterior });
            await supabase.from('acordos')
              .update({ status: statusAnterior, vencimento: vencimentoAnterior })
              .eq('id', id);
          },
        },
      });
    }
    setAtualizandoStatus(null);
  }

  function prepararFila(listaAcordos: Acordo[]) {
    const comWhats = listaAcordos.filter(a => a.whatsapp);
    const semWhats = listaAcordos.filter(a => !a.whatsapp);
    if (comWhats.length === 0) { toast.warning('Nenhum acordo selecionado possui WhatsApp cadastrado'); return; }
    if (semWhats.length > 0)   toast.info(`${semWhats.length} acordo(s) sem WhatsApp serão ignorados`);
    const fila: ItemFila[] = comWhats.map(a => ({
      id: a.id,
      nome_cliente:  a.nome_cliente,
      nr_cliente:    a.nr_cliente,
      whatsapp:      a.whatsapp!,
      valor:         a.valor,
      vencimento:    a.vencimento,
      mensagem:      buildMensagem(a),
      link:          `https://wa.me/55${a.whatsapp!.replace(/\D/g, '')}?text=${encodeURIComponent(buildMensagem(a))}`,
      enviado:       false,
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
    try {
      await tratarExclusaoVinculo({ acordo: a, isPaguePlay: isPP, operadorExecutorNome: perfil?.nome ?? perfil?.email ?? null });
    } catch (e) { console.warn('[excluirAcordo] tratarExclusaoVinculo falhou:', e); }
    await enviarParaLixeira({ acordo: a, motivo: 'exclusao_manual', operadorNome: perfil?.nome ?? perfil?.email ?? undefined });
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) {
      toast.error('Erro ao excluir acordo: ' + error.message);
    } else {
      liberarNrPorAcordoId(a.id);
      supabase.from('logs_sistema').insert({
        usuario_id: perfil?.id ?? null, acao: 'exclusao_acordo', tabela: 'acordos', registro_id: a.id,
        empresa_id: empresa?.id ?? null,
        detalhes: { nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente, excluido_por: perfil?.nome ?? perfil?.email ?? null, excluido_em: new Date().toISOString() },
      }).then(({ error: logError }) => { if (logError) console.warn('[excluirAcordo] log error:', logError.message); });
      toast.success(`Acordo #${a.nr_cliente} excluído!`);
      removeAcordo(a.id);
    }
    setExcluindoId(null);
  }

  async function excluirSelecionados() {
    setConfirmandoExclusaoLote(false);
    let deletedCount = 0;
    let failedCount  = 0;
    for (const id of selecionados) {
      setExcluindoId(id);
      const acordo = acordos.find(a => a.id === id);
      if (acordo) {
        try { await tratarExclusaoVinculo({ acordo, isPaguePlay: isPP, operadorExecutorNome: perfil?.nome ?? perfil?.email ?? null }); }
        catch (e) { console.warn('[excluirSelecionados] tratarExclusaoVinculo falhou:', e); }
        await enviarParaLixeira({ acordo, motivo: 'exclusao_manual', operadorNome: perfil?.nome ?? perfil?.email ?? undefined });
      }
      const { error } = await supabase.from('acordos').delete().eq('id', id);
      if (error) { failedCount++; console.error(`[excluirSelecionados] erro ao excluir ${id}:`, error.message); }
      else {
        deletedCount++;
        liberarNrPorAcordoId(id);
        removeAcordo(id);
        if (acordo) {
          supabase.from('logs_sistema').insert({
            usuario_id: perfil?.id ?? null, acao: 'exclusao_acordo', tabela: 'acordos', registro_id: id,
            empresa_id: empresa?.id ?? null,
            detalhes: { nome_cliente: acordo.nome_cliente, nr_cliente: acordo.nr_cliente, excluido_por: perfil?.nome ?? perfil?.email ?? null, excluido_em: new Date().toISOString(), modo: 'lote' },
          }).then(({ error: logError }) => { if (logError) console.warn('[excluirSelecionados] log error:', logError.message); });
        }
      }
    }
    setExcluindoId(null);
    setSelecionados([]);
    if (deletedCount > 0) toast.success(`${deletedCount} acordo(s) excluído(s) com sucesso!`);
    if (failedCount  > 0) toast.error(`${failedCount} acordo(s) não puderam ser excluídos`);
  }

  function enviarUmWhatsapp(a: Acordo) {
    if (!a.whatsapp) { toast.warning('WhatsApp não cadastrado'); return; }
    const mensagem = buildMensagem(a);
    window.open(`https://wa.me/55${a.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`, '_blank');
    if (perfil?.id) {
      supabase.from('logs_sistema').insert({
        usuario_id: perfil.id, acao: 'envio_lembrete_whatsapp', tabela: 'acordos', registro_id: a.id,
        empresa_id: empresa?.id ?? null,
        detalhes: { acordo_id: a.id, nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente, modo: 'individual' },
      }).then(({ error }) => { if (error) console.warn('[enviarUmWhatsapp] log error:', error.message); });
    }
  }

  const acordosHoje = useMemo(() => acordos.filter(a => a.vencimento === hoje), [acordos, hoje]);

  const STATUSES_ANALITICO_EXCLUIDOS = ['pago', 'nao_pago'];
  const visaoAmpla = temVisaoAmpla(perfil?.perfil);

  const acordosParaExibir = useMemo<AcordoComVinculo[]>(() => {
    let base: AcordoComVinculo[] = acordos;
    if (usuarioTemLogicaDiretoExtra && filtroVinculo !== 'todos') {
      base = base.filter(a => (a.tipo_vinculo ?? 'direto') === filtroVinculo);
    }
    if (visaoAmpla && filtroVinculo === 'todos') {
      base = deduplicarVinculados(base, isPP);
    }
    if (activeTab === 'analitico') {
      return base.filter(a => !STATUSES_ANALITICO_EXCLUIDOS.includes(a.status));
    }
    return [...base].sort((a, b) => {
      const aHoje = a.vencimento === hoje;
      const bHoje = b.vencimento === hoje;
      if (aHoje && bHoje) {
        const aPago = a.status === 'pago' ? 1 : 0;
        const bPago = b.status === 'pago' ? 1 : 0;
        return aPago - bPago;
      }
      if (aHoje && !bHoje) return -1;
      if (!aHoje && bHoje) return 1;
      return 0;
    });
  }, [acordos, activeTab, visaoAmpla, usuarioTemLogicaDiretoExtra, filtroVinculo, isPP, hoje]);

  if (isPP) return <Navigate to="/" replace />;

  const colSpanFull = isPP ? 11 : 10;

  return (
    <div className="p-6">
      <div className="max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Acordos</h1>
            {!isPP && (
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="outline" size="icon" className="h-6 w-6"
                  onClick={() => {
                    const [y, m] = mesFiltro.split('-').map(Number);
                    const prev   = new Date(y, m - 2, 1);
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
                    const next   = new Date(y, m, 1);
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
            {acordosHoje.length > 0 && selecionados.length === 0 && (
              <Button
                variant="outline" size="sm"
                className={cn('gap-1.5 border-success/40 text-success hover:bg-success/10', isPP && 'hidden')}
                onClick={enviarLembretesHoje}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Lembretes do dia ({acordosHoje.length})
              </Button>
            )}
            <Button
              variant="outline" size="icon" className="w-8 h-8 relative" onClick={refetch}
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
              size="sm"
              data-tour="novo-acordo"
              onClick={() => setNovoInlineAberto(v => !v)}
              className={cn(
                'gap-1.5 shadow-sm transition-all',
                novoInlineAberto
                  ? 'bg-muted text-foreground border border-border hover:bg-muted/80'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <Plus className={cn('w-4 h-4 transition-transform', novoInlineAberto && 'rotate-45')} />
              {novoInlineAberto ? 'Fechar' : 'Novo Acordo'}
            </Button>
          </div>
        </div>

        <AcordosFilters
          activeTab={activeTab} setActiveTab={setActiveTab}
          isLider={isLider} isElite={isElite}
          equipesDoSetor={equipesDoSetor}
          visaoFiltroAcordos={visaoFiltroAcordos} setVisaoFiltroAcordos={setVisaoFiltroAcordos}
          busca={busca} setBusca={setBusca}
          filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
          filtroTipo={filtroTipo} setFiltroTipo={setFiltroTipo}
          filtroData={filtroData} setFiltroData={setFiltroData}
          filtroOperador={filtroOperador} setFiltroOperador={setFiltroOperador}
          filtroVinculo={filtroVinculo} setFiltroVinculo={setFiltroVinculo}
          statusLabels={statusLabels} tipoLabels={tipoLabels} operadoresMap={operadoresMap}
          filtrosAtivosCount={filtrosAtivosCount} temFiltros={temFiltros}
          isPP={isPP} usuarioTemLogicaDiretoExtra={usuarioTemLogicaDiretoExtra}
          temPermissao={temPermissao}
          setCurrentPage={setCurrentPage} limparFiltros={limparFiltros}
        />

        {/* Âncora de scroll */}
        <div ref={novoInlineRef} />

        {/* Tabela */}
        <Card className="border-border" data-tour="tabela-acordos">
          <CardContent className="p-0">
            {loading ? <TableSkeleton /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <AcordosTableBody
                    acordosParaExibir={acordosParaExibir}
                    acordosCount={acordos.length}
                    isPP={isPP}
                    colSpanFull={colSpanFull}
                    novoInlineAberto={novoInlineAberto}
                    hoje={hoje}
                    highlightedId={highlightedId}
                    selecionados={selecionados}
                    editandoInlineId={editandoInlineId}
                    detalheInlineId={detalheInlineId}
                    atualizandoStatus={atualizandoStatus}
                    excluindoId={excluindoId}
                    operadoresMap={operadoresMap}
                    temFiltros={temFiltros}
                    selecionarTodos={selecionarTodos}
                    toggleSelecionado={toggleSelecionado}
                    setNovoInlineAberto={setNovoInlineAberto}
                    addAcordo={addAcordo}
                    removeAcordo={removeAcordo}
                    patchAcordo={patchAcordo}
                    setEditandoInlineId={setEditandoInlineId}
                    setDetalheInlineId={setDetalheInlineId}
                    marcarComoPago={marcarComoPago}
                    enviarUmWhatsapp={enviarUmWhatsapp}
                    setConfirmandoExclusao={setConfirmandoExclusao}
                    limparFiltros={limparFiltros}
                  />
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!loading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
            <p className="text-xs text-muted-foreground">
              Exibindo {((currentPage - 1) * PER_PAGE) + 1}–{Math.min(currentPage * PER_PAGE, totalCount)} de {totalCount} acordos
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} title="Primeira página">
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} title="Anterior">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {getPageNumbers(currentPage, totalPages).map((p, i) =>
                p === '...'
                  ? <span key={`e${i}`} className="px-1 text-xs text-muted-foreground select-none">…</span>
                  : <Button key={p} variant={p === currentPage ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => setCurrentPage(p as number)}>{p}</Button>,
              )}
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} title="Próxima">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} title="Última página">
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {confirmarPgtoAcordo && (
        <ModalConfirmarPagamento
          aberto={!!confirmarPgtoAcordo}
          salvando={salvandoConfirmarPgto}
          dataInicial={confirmarPgtoAcordo.vencimento}
          onConfirm={async (data) => {
            setSalvandoConfirmarPgto(true);
            await executarMarcarPago(confirmarPgtoAcordo, data);
            setSalvandoConfirmarPgto(false);
            setConfirmarPgtoAcordo(null);
          }}
          onClose={() => setConfirmarPgtoAcordo(null)}
        />
      )}

      <AcordosModals
        confirmandoExclusao={confirmandoExclusao} setConfirmandoExclusao={setConfirmandoExclusao}
        excluirAcordo={excluirAcordo}
        confirmandoExclusaoLote={confirmandoExclusaoLote} setConfirmandoExclusaoLote={setConfirmandoExclusaoLote}
        excluirSelecionados={excluirSelecionados}
        selecionados={selecionados} setSelecionados={setSelecionados}
        filaAberta={filaAberta} setFilaAberta={setFilaAberta}
        filaWhatsApp={filaWhatsApp}
        usuarioId={perfil?.id} empresaId={empresa?.id}
        temPermissao={temPermissao} prepararFila={prepararFila} acordos={acordos}
      />
    </div>
  );
}
