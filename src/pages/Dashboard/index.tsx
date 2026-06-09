import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Layers, MessageSquare, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAcordos } from '@/hooks/useAcordos';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  ROUTE_PATHS, formatCurrency, formatDate, getTodayISO,
  isPerfilAdmin, isPerfilLider,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';
import { supabase, type Acordo } from '@/lib/supabase';
import type { Perfil } from '@/lib/supabase';
import { deduplicarVinculados, temVisaoAmpla, type AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { toast } from 'sonner';
import type { ItemFila } from '@/components/ModalFilaWhatsApp';
import { criarNotificacao } from '@/services/notificacoes.service';
import { liberarNrPorAcordoId } from '@/services/nr_registros.service';
import { enviarParaLixeira } from '@/services/lixeira.service';
import { tratarExclusaoVinculo } from '@/services/tratarExclusaoVinculo';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { useAnalytics } from '@/hooks/useAnalytics';
import type { ReagendarParams } from '@/components/ModalReagendar';
import {
  PER_PAGE, TIPOS_PARCELADOS_PP, VisaoFiltro,
  addMesesDash, buildMensagem, saudacao, getPageNumbers, TableSkeleton,
} from './helpers';
import { PPTableFilters } from './PPTableFilters';
import { PPTableBody } from './PPTableBody';
import { PPModals } from './PPModals';

export default function Dashboard() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const statusLabels = tenant.statusLabels;
  const tipoLabels   = tenant.tipoLabels;

  const { setores: setoresList, setorFiltro, setSetorFiltro, equipesDoSetor } = useAnalytics();
  const isAdmin = isPerfilAdmin(perfil?.perfil ?? '');
  const isLiderOuElite = isPerfilLider(perfil?.perfil ?? '');
  const isElite = perfil?.perfil === 'elite';
  const isLider = perfil?.perfil === 'lider';

  const [visaoFiltro, setVisaoFiltro] = useState<VisaoFiltro>('setor');
  const equipeFiltroAtivo = visaoFiltro.startsWith('equipe:') ? visaoFiltro.replace('equipe:', '') : null;
  const operadorFiltroAtivo = visaoFiltro === 'individual' ? (perfil?.id ?? null) : null;
  const eliteVisaoGeral = visaoFiltro !== 'individual';

  const { acordos: acordosHoje, loading: loadingHoje } = useAcordos({ apenas_hoje: true });
  const hoje = getTodayISO();
  const diaSemana    = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const [hojeMinimizado, setHojeMinimizado] = useState(false);

  const [mesFiltro, setMesFiltro] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [busca,        setBusca]        = useState(searchParams.get('busca')  || '');
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo,   setFiltroTipo]   = useState(searchParams.get('tipo')   || '');
  const [filtroData,   setFiltroData]   = useState(searchParams.get('data')   || '');
  const [currentPage,  setCurrentPage]  = useState(Number(searchParams.get('page')) || 1);
  const [colFiltroEstado,    setColFiltroEstado]    = useState('');
  const [estadoDropdown,     setEstadoDropdown]     = useState(false);

  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const usuarioTemLogicaDiretoExtra = isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );
  const [filtroVinculo, setFiltroVinculo] = useState<'todos' | 'direto' | 'extra'>(
    (searchParams.get('vinculo') as 'todos' | 'direto' | 'extra') || 'todos'
  );
  const visaoAmpla = temVisaoAmpla(perfil?.perfil);
  const { tags: empresaTags } = useEmpresaTags();

  const [activeTab, setActiveTab] = useState<'todos' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'todos' | 'pagos' | 'nao_pagos') || 'todos',
  );

  const [selecionados,            setSelecionados]            = useState<string[]>([]);
  useEffect(() => { setSelecionados([]); }, [currentPage, filtroStatus, filtroTipo, activeTab]);
  const [atualizandoStatus,       setAtualizandoStatus]       = useState<string | null>(null);
  const [filaAberta,              setFilaAberta]              = useState(false);
  const [filaWhatsApp,            setFilaWhatsApp]            = useState<ItemFila[]>([]);
  const [excluindoId,             setExcluindoId]             = useState<string | null>(null);
  const [confirmandoExclusao,     setConfirmandoExclusao]     = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);
  const [reagendarAcordo,    setReagendarAcordo]    = useState<AcordoComVinculo | null>(null);
  const [salvandoReagendar,  setSalvandoReagendar]  = useState(false);
  const [gruposReagendadosBD, setGruposReagendadosBD] = useState<Set<string>>(new Set());
  const [editandoInlineIdHoje,    setEditandoInlineIdHoje]    = useState<string | null>(null);
  const [editandoInlineIdTabela,  setEditandoInlineIdTabela]  = useState<string | null>(null);
  const [detalheInlineIdTabela,   setDetalheInlineIdTabela]   = useState<string | null>(null);
  const [novoInlineAbertoTabela,  setNovoInlineAbertoTabela]  = useState(false);
  const novoInlineRef = useRef<HTMLDivElement>(null);
  const [operadoresMap,           setOperadoresMap]           = useState<Record<string, string>>({});
  const [highlightedId,   setHighlightedId]   = useState<string | null>(null);
  const highlightTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const findingPageRef     = useRef(false);
  const highlightFoundRef  = useRef(false);
  const findAttemptsRef    = useRef(0);

  const statusFiltroComputed =
    filtroStatus && filtroStatus !== 'all' ? filtroStatus
    : activeTab === 'pagos'     ? 'pago'
    : activeTab === 'nao_pagos' ? 'nao_pago'
    : filtroStatus || undefined;

  const mesFiltroInicio = mesFiltro ? `${mesFiltro}-01` : undefined;
  const mesFiltroFim = mesFiltro
    ? (() => {
        const [y, m] = mesFiltro.split('-').map(Number);
        const ultimo = new Date(y, m, 0).getDate();
        return `${mesFiltro}-${String(ultimo).padStart(2, '0')}`;
      })()
    : undefined;

  const nextMonthRange = useMemo(() => {
    if (!mesFiltro) return null;
    const [y, m] = mesFiltro.split('-').map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const start = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    const end   = new Date(nextY, nextM, 0).toISOString().split('T')[0];
    return { start, end };
  }, [mesFiltro]);

  useEffect(() => {
    if (!isPP || !nextMonthRange || !empresa?.id) { setGruposReagendadosBD(new Set()); return; }
    supabase
      .from('acordos')
      .select('acordo_grupo_id')
      .eq('empresa_id', empresa.id)
      .gte('vencimento', nextMonthRange.start)
      .lte('vencimento', nextMonthRange.end)
      .gt('numero_parcela', 1)
      .then(({ data }) => {
        if (data) setGruposReagendadosBD(new Set(
          (data as { acordo_grupo_id: string | null }[])
            .map(d => d.acordo_grupo_id)
            .filter((v): v is string => !!v),
        ));
      });
  }, [isPP, nextMonthRange, empresa?.id]);

  useEffect(() => { setCurrentPage(1); }, [colFiltroEstado]);

  useEffect(() => {
    if (novoInlineAbertoTabela) {
      novoInlineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [novoInlineAbertoTabela]);

  const { acordos, totalCount, loading, refetch, patchAcordo, removeAcordo, addAcordo, realtimeStatus } = useAcordos(
    isPP ? {
      busca:        busca || undefined,
      status:       statusFiltroComputed,
      tipo:         filtroTipo && filtroTipo !== 'all' ? filtroTipo : undefined,
      vencimento:   filtroData || undefined,
      data_inicio:  filtroData ? undefined : mesFiltroInicio,
      data_fim:     filtroData ? undefined : mesFiltroFim,
      estado_uf:    colFiltroEstado || undefined,
      operador_id:  (!temPermissao('ver_acordos_gerais') || visaoFiltro === 'individual') ? perfil?.id : undefined,
      equipe_id:    equipeFiltroAtivo ?? undefined,
      page:         currentPage,
      perPage:      PER_PAGE,
      prioritize_today: true,
    } : {},
  );

  const { acordos: todosAcordos } = useAcordos();

  const acordosDeHoje = useMemo(() =>
    acordosHoje.filter(a => a.vencimento === hoje),
    [acordosHoje, hoje],
  );

  const gruposComProximaParcela = useMemo(() => {
    const s = new Set<string>();
    for (const a of acordos) {
      if ((a.numero_parcela ?? 1) > 1 && a.acordo_grupo_id) s.add(a.acordo_grupo_id);
    }
    return s;
  }, [acordos]);

  const gruposJaReagendados = useMemo(
    () => new Set([...gruposComProximaParcela, ...gruposReagendadosBD]),
    [gruposComProximaParcela, gruposReagendadosBD],
  );

  const acordosOrdenados = useMemo<AcordoComVinculo[]>(() => {
    let base: AcordoComVinculo[] = acordos;
    if (usuarioTemLogicaDiretoExtra && filtroVinculo !== 'todos') {
      base = base.filter(a => (a.tipo_vinculo ?? 'direto') === filtroVinculo);
    }
    if (visaoAmpla && filtroVinculo === 'todos') {
      base = deduplicarVinculados(base, true);
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
  }, [acordos, usuarioTemLogicaDiretoExtra, filtroVinculo, visaoAmpla, hoje]);

  useEffect(() => {
    if (!isPP) return;
    if (!temPermissao('ver_acordos_gerais')) return;
    const ids = [...new Set([...acordosDeHoje, ...acordos].map(a => a.operador_id).filter(Boolean))];
    if (ids.length === 0) return;
    supabase.from('perfis').select('id, nome').in('id', ids as string[]).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => { map[p.id] = p.nome; });
        setOperadoresMap(prev => ({ ...prev, ...map }));
      }
    });
  }, [acordosDeHoje, acordos, isPP, temPermissao]);

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

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isPP) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (busca)        params.set('busca',  busca);        else params.delete('busca');
      if (filtroStatus) params.set('status', filtroStatus); else params.delete('status');
      if (filtroTipo)   params.set('tipo',   filtroTipo);   else params.delete('tipo');
      if (filtroData)   params.set('data',   filtroData);   else params.delete('data');
      if (activeTab !== 'todos') params.set('tab', activeTab); else params.delete('tab');
      if (filtroVinculo !== 'todos') params.set('vinculo', filtroVinculo); else params.delete('vinculo');
      params.set('page', currentPage.toString());
      setSearchParams(params);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTipo, filtroData, activeTab, filtroVinculo, currentPage, isPP]);

  const atrasadosProcessadosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isPP || loading || acordos.length === 0) return;
    const atrasados = acordos.filter(a =>
      a.status === 'verificar_pendente' &&
      a.vencimento < hoje &&
      !atrasadosProcessadosRef.current.has(a.id),
    );
    if (atrasados.length === 0) return;
    atrasados.forEach(a => atrasadosProcessadosRef.current.add(a.id));
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
            mensagem:   `Acordo Código ${a.instituicao || '—'} foi movido para "Não Pago" por atraso de pagamento.\nValor: ${formatCurrency(a.valor)}\nVencimento: ${formatDate(a.vencimento)}`,
            empresa_id: empresa?.id,
            acordo_id:  a.id,
          });
        }
        patchAcordo(a.id, { status: 'nao_pago' });
      });
    }).catch(e => console.warn('[Dashboard] erro ao mover atrasados:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordos, loading, isPP]);

  useEffect(() => {
    if (!isPP) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setNovoInlineAbertoTabela(v => !v); }
      if (e.key === 'Escape') {
        setEditandoInlineIdTabela(null);
        setDetalheInlineIdTabela(null);
        setNovoInlineAbertoTabela(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPP]);

  async function findAcordoPage(acordoId: string) {
    if (!empresa?.id) return;
    const { data: a } = await supabase.from('acordos').select('id, vencimento, status').eq('id', acordoId).single();
    if (!a) return;
    const [ano, mes] = (a.vencimento as string).split('-');
    const mesStr = `${ano}-${mes}`;
    const { count } = await supabase
      .from('acordos').select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa.id).eq('status', a.status)
      .gte('vencimento', `${mesStr}-01`).lt('vencimento', a.vencimento);
    const page = Math.floor((count ?? 0) / PER_PAGE) + 1;
    setBusca(''); setFiltroStatus(''); setFiltroTipo(''); setFiltroData('');
    setFiltroVinculo('todos'); setColFiltroEstado(''); setMesFiltro(mesStr);
    if ((a.status as string) === 'nao_pago')     setActiveTab('nao_pagos');
    else if ((a.status as string) === 'pago')    setActiveTab('pagos');
    else                                          setActiveTab('todos');
    setCurrentPage(page);
  }

  function limparFiltros() {
    setBusca(''); setFiltroStatus(''); setFiltroTipo(''); setFiltroData('');
    setColFiltroEstado(''); setCurrentPage(1);
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function selecionarTodos() {
    if (selecionados.length === acordos.length) setSelecionados([]);
    else setSelecionados(acordos.map(a => a.id));
  }

  async function marcarComoPago(id: string) {
    const statusAnterior = (acordos.find(a => a.id === id) ?? acordosOrdenados.find(a => a.id === id))?.status ?? 'verificar_pendente';
    setAtualizandoStatus(id);
    patchAcordo(id, { status: 'pago' });
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', id);
    if (error) {
      patchAcordo(id, { status: statusAnterior });
      toast.error('Erro ao atualizar status');
    } else {
      const acordoObj = acordos.find(a => a.id === id) ?? acordosOrdenados.find(a => a.id === id);
      if (acordoObj && (acordoObj.vinculo_operador_id || acordoObj.tipo_vinculo === 'extra')) {
        supabase.rpc('fn_sync_par_vinculo', {
          p_acordo_id: id, p_valor: acordoObj.valor, p_vencimento: acordoObj.vencimento,
          p_nome_cliente: acordoObj.nome_cliente, p_tipo: acordoObj.tipo,
          p_whatsapp: acordoObj.whatsapp ?? null, p_parcelas: acordoObj.parcelas, p_status: 'pago',
        }).then(({ error: rpcErr }) => {
          if (rpcErr) console.warn('[marcarComoPago] sync par falhou:', rpcErr.message);
        });
      }
      const numParcela = acordoObj?.numero_parcela ?? 1;
      const deveReagendar = isPP && acordoObj && (acordoObj.parcelas ?? 1) > 1 && TIPOS_PARCELADOS_PP.includes(acordoObj.tipo) && numParcela < (acordoObj.parcelas ?? 1);
      if (deveReagendar && acordoObj) {
        setReagendarAcordo(acordoObj);
      } else {
        toast.success('Acordo marcado como Pago!', {
          duration: 5000,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              patchAcordo(id, { status: statusAnterior });
              await supabase.from('acordos').update({ status: statusAnterior }).eq('id', id);
            },
          },
        });
      }
    }
    setAtualizandoStatus(null);
  }

  async function handleReagendarDashboard(params: ReagendarParams) {
    if (!reagendarAcordo || !empresa?.id) return;
    setSalvandoReagendar(true);
    try {
      const parcelaAtual  = reagendarAcordo;
      const proximaNumero = (parcelaAtual.numero_parcela ?? 1) + 1;
      const totalParcelas = parcelaAtual.parcelas ?? 1;
      const quantToCreate = params.aplicarTodas ? totalParcelas - (parcelaAtual.numero_parcela ?? 1) : 1;

      if (parcelaAtual.acordo_grupo_id) {
        const { data: jaExiste } = await supabase
          .from('acordos').select('id')
          .eq('empresa_id', empresa.id).eq('acordo_grupo_id', parcelaAtual.acordo_grupo_id)
          .eq('numero_parcela', proximaNumero).maybeSingle();
        if (jaExiste) {
          toast.info(`Parcela ${proximaNumero}/${totalParcelas} já foi reagendada.`);
          setReagendarAcordo(null); return;
        }
      }

      const basePayload = {
        nome_cliente:          parcelaAtual.nome_cliente,
        nr_cliente:            parcelaAtual.nr_cliente,
        tipo:                  parcelaAtual.tipo,
        parcelas:              parcelaAtual.parcelas,
        whatsapp:              parcelaAtual.whatsapp ?? null,
        instituicao:           parcelaAtual.instituicao ?? null,
        observacoes:           parcelaAtual.observacoes ?? null,
        operador_id:           parcelaAtual.operador_id,
        empresa_id:            parcelaAtual.empresa_id,
        setor_id:              parcelaAtual.setor_id ?? null,
        data_cadastro:         new Date().toISOString().split('T')[0],
        acordo_grupo_id:       parcelaAtual.acordo_grupo_id ?? null,
        tipo_vinculo:          parcelaAtual.tipo_vinculo ?? null,
        vinculo_operador_id:   parcelaAtual.vinculo_operador_id ?? null,
        vinculo_operador_nome: parcelaAtual.vinculo_operador_nome ?? null,
        status:                'verificar_pendente',
        valor:                 params.novoValor,
      };

      let ultimoInserido: Acordo | null = null;
      for (let i = 0; i < quantToCreate; i++) {
        const numero   = proximaNumero + i;
        const vencCalc = i === 0 ? params.novoVencimento : addMesesDash(params.novoVencimento, i);
        const { data, error: errIns } = await supabase
          .from('acordos')
          .insert({ ...basePayload, numero_parcela: numero, vencimento: vencCalc })
          .select('*, perfis(id, nome, email, perfil, setor_id)')
          .single();
        if (errIns) { toast.error(`Erro ao criar parcela ${numero}: ${errIns.message}`); return; }
        ultimoInserido = data as Acordo;
      }

      if (parcelaAtual.vinculo_operador_id && parcelaAtual.acordo_grupo_id) {
        const valorChave = parcelaAtual.instituicao;
        if (valorChave) {
          const { data: parInstall } = await supabase
            .from('acordos').select('*')
            .eq('empresa_id', empresa.id).eq('operador_id', parcelaAtual.vinculo_operador_id)
            .eq('instituicao', valorChave).eq('numero_parcela', parcelaAtual.numero_parcela ?? 1)
            .maybeSingle();

          if (parInstall) {
            for (let i = 0; i < quantToCreate; i++) {
              const numero   = proximaNumero + i;
              const vencCalc = i === 0 ? params.novoVencimento : addMesesDash(params.novoVencimento, i);
              await supabase.from('acordos').insert({
                nome_cliente:          (parInstall as Acordo).nome_cliente,
                nr_cliente:            (parInstall as Acordo).nr_cliente,
                tipo:                  (parInstall as Acordo).tipo,
                parcelas:              (parInstall as Acordo).parcelas,
                whatsapp:              (parInstall as Acordo).whatsapp ?? null,
                instituicao:           (parInstall as Acordo).instituicao ?? null,
                observacoes:           (parInstall as Acordo).observacoes ?? null,
                operador_id:           (parInstall as Acordo).operador_id,
                empresa_id:            (parInstall as Acordo).empresa_id,
                setor_id:              (parInstall as Acordo).setor_id ?? null,
                data_cadastro:         new Date().toISOString().split('T')[0],
                acordo_grupo_id:       (parInstall as Acordo).acordo_grupo_id ?? null,
                tipo_vinculo:          (parInstall as Acordo).tipo_vinculo ?? null,
                vinculo_operador_id:   (parInstall as Acordo).vinculo_operador_id ?? null,
                vinculo_operador_nome: (parInstall as Acordo).vinculo_operador_nome ?? null,
                status:                'verificar_pendente',
                valor:                 params.novoValor,
                numero_parcela:        numero,
                vencimento:            vencCalc,
              });
            }
          }
        }
      }

      if (ultimoInserido) addAcordo(ultimoInserido);
      setReagendarAcordo(null);
      const msg = quantToCreate > 1
        ? `${quantToCreate} parcelas agendadas a partir de ${formatDate(params.novoVencimento)}!`
        : `Parcela ${proximaNumero}/${totalParcelas} reagendada para ${formatDate(params.novoVencimento)}!`;
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reagendar parcela');
    } finally {
      setSalvandoReagendar(false);
    }
  }

  function prepararFila(lista: Acordo[]) {
    const comWhats = lista.filter(a => a.whatsapp);
    const semWhats = lista.filter(a => !a.whatsapp);
    if (comWhats.length === 0) { toast.warning('Nenhum acordo selecionado possui WhatsApp cadastrado'); return; }
    if (semWhats.length > 0) toast.info(`${semWhats.length} acordo(s) sem WhatsApp serão ignorados`);
    const fila: ItemFila[] = comWhats.map(a => ({
      id: a.id, nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente,
      whatsapp: a.whatsapp!, valor: a.valor, vencimento: a.vencimento,
      mensagem: buildMensagem(a),
      link: `https://wa.me/55${a.whatsapp!.replace(/\D/g, '')}?text=${encodeURIComponent(buildMensagem(a))}`,
      enviado: false,
    }));
    setFilaWhatsApp(fila); setFilaAberta(true);
  }

  function enviarLembretesHoje() {
    const lista = acordosDeHoje.filter(a => a.vencimento === hoje);
    if (lista.length === 0) { toast.info('Nenhum acordo vence hoje'); return; }
    prepararFila(lista);
  }

  async function excluirAcordo(a: Acordo) {
    setConfirmandoExclusao(null);
    setExcluindoId(a.id);
    try {
      await tratarExclusaoVinculo({ acordo: a, isPaguePlay: isPP, operadorExecutorNome: perfil?.nome ?? perfil?.email ?? null });
    } catch (e) { console.warn('[Dashboard.excluirAcordo] tratarExclusaoVinculo falhou:', e); }
    await enviarParaLixeira({ acordo: a, motivo: 'exclusao_manual', operadorNome: perfil?.nome ?? perfil?.email ?? undefined });
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) { toast.error('Erro ao excluir acordo: ' + error.message); }
    else {
      liberarNrPorAcordoId(a.id);
      supabase.from('logs_sistema').insert({
        usuario_id: perfil?.id ?? null, acao: 'exclusao_acordo', tabela: 'acordos',
        registro_id: a.id, empresa_id: empresa?.id ?? null,
        detalhes: { nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente, excluido_por: perfil?.nome ?? perfil?.email ?? null, excluido_em: new Date().toISOString() },
      }).then(({ error: logError }) => { if (logError) console.warn('[excluirAcordo] log error:', logError.message); });
      removeAcordo(a.id);
      toast.success(`Acordo #${a.nr_cliente} excluído!`);
    }
    setExcluindoId(null);
  }

  async function excluirSelecionados() {
    setConfirmandoExclusaoLote(false);
    const ids = [...selecionados];
    const acordosParaExcluir = acordos.filter(a => ids.includes(a.id));
    setExcluindoId('__lote__');
    try {
      await Promise.allSettled(acordosParaExcluir.map(acordo =>
        tratarExclusaoVinculo({ acordo, isPaguePlay: isPP, operadorExecutorNome: perfil?.nome ?? perfil?.email ?? null }),
      ));
      await Promise.allSettled(acordosParaExcluir.map(acordo =>
        enviarParaLixeira({ acordo, motivo: 'exclusao_manual', operadorNome: perfil?.nome ?? perfil?.email ?? undefined }),
      ));
      const { error } = await supabase.from('acordos').delete().in('id', ids);
      if (error) { toast.error(`Erro ao excluir acordos: ${error.message}`); return; }
      ids.forEach(id => liberarNrPorAcordoId(id));
      ids.forEach(id => removeAcordo(id));
      const agora = new Date().toISOString();
      acordosParaExcluir.forEach(acordo => {
        supabase.from('logs_sistema').insert({
          usuario_id: perfil?.id ?? null, acao: 'exclusao_acordo', tabela: 'acordos',
          registro_id: acordo.id, empresa_id: empresa?.id ?? null,
          detalhes: { nome_cliente: acordo.nome_cliente, nr_cliente: acordo.nr_cliente, excluido_por: perfil?.nome ?? perfil?.email ?? null, excluido_em: agora, modo: 'lote' },
        }).then(({ error: logError }) => { if (logError) console.warn('[excluirSelecionados] log error:', logError.message); });
      });
      setSelecionados([]);
      toast.success(`${ids.length} acordo(s) excluído(s) com sucesso!`);
    } finally {
      setExcluindoId(null);
    }
  }

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const temFiltros = !!(busca || filtroStatus || filtroTipo || filtroData);
  const nome = perfil?.nome?.split(' ')[0] || 'Usuário';

  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {saudacao()}, {nome}! 👋
          </h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{diaSemana}, {dataFormatada}</p>
          {empresa && (
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {empresa.nome}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {(isLider || isElite) && equipesDoSetor.length > 0 && (
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-1.5">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Visualizar:</span>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setVisaoFiltro('setor')}
                  className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                    visaoFiltro === 'setor' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground')}
                  title="Ver dados e acordos de todo o setor"
                ><Building2 className="w-3 h-3" /> Setor geral</button>
                {equipesDoSetor.map(eq => (
                  <button key={eq.id}
                    onClick={() => setVisaoFiltro(`equipe:${eq.id}` as VisaoFiltro)}
                    className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      visaoFiltro === `equipe:${eq.id}` ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground')}
                    title={`Ver dados e acordos da equipe ${eq.nome}`}
                  ><Layers className="w-3 h-3" /> {eq.nome}</button>
                ))}
                {isElite && (
                  <button onClick={() => setVisaoFiltro('individual')}
                    className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      visaoFiltro === 'individual' ? 'bg-role-elite text-white border-role-elite' : 'bg-background text-muted-foreground border-border hover:border-role-elite/40 hover:text-foreground')}
                    title="Ver apenas seus próprios acordos"
                  ><Users className="w-3 h-3" /> Individual</button>
                )}
              </div>
            </div>
          )}
          {(isLider || isElite) && equipesDoSetor.length === 0 && (
            <span className="text-xs text-muted-foreground bg-muted/40 border border-border px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Setor geral
            </span>
          )}
          {isPP && acordosDeHoje.length > 0 && (
            <Button variant="outline" size="sm" className="hidden text-xs h-8 gap-1.5 text-success border-success/30 hover:bg-success/10" onClick={enviarLembretesHoje}>
              <MessageSquare className="w-3.5 h-3.5" /> Lembretes do dia ({acordosDeHoje.length})
            </Button>
          )}
        </div>
      </div>

      {/* Analytics + setor filter */}
      <div className="mb-6 space-y-2" data-tour="metricas">
        {isAdmin && setoresList.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Filtrar setor:</span>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSetorFiltro(null)} className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors', !setorFiltro ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                Todos
              </button>
              {setoresList.map(s => (
                <button key={s.id} onClick={() => setSetorFiltro(setorFiltro === s.id ? null : s.id)} className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors', setorFiltro === s.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                  {s.nome}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnalyticsPanel
          setorFiltro={setorFiltro}
          equipeFiltroExterno={equipeFiltroAtivo}
          operadorFiltroExterno={operadorFiltroAtivo}
          temLogicaDiretoExtra={isPP && usuarioTemLogicaDiretoExtra}
        />
      </div>

      {/* PaguePLAY section */}
      {isPP && (
        <div className="space-y-6">
          <div>
            {/* Cabeçalho da seção */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Acordos</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {loading ? 'Carregando...' : `${totalCount} acordo(s) no total`}
                  {selecionados.length > 0 && <span className="ml-2 text-primary font-medium">· {selecionados.length} selecionado(s)</span>}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {selecionados.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" className="hidden gap-1.5 border-success/40 text-success hover:bg-success/10 text-xs h-8" onClick={() => prepararFila(acordos.filter(a => selecionados.includes(a.id)))}>
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp ({selecionados.length})
                    </Button>
                    {temPermissao('excluir_em_lote') && (
                      <Button variant="outline" size="sm" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs h-8" onClick={() => setConfirmandoExclusaoLote(true)}>
                        <Trash2 className="w-3.5 h-3.5" /> Excluir ({selecionados.length})
                      </Button>
                    )}
                  </>
                )}
                <Button size="sm" className="gap-1.5" data-tour="novo-acordo" onClick={() => setNovoInlineAbertoTabela(v => !v)}>
                  <Plus className="w-4 h-4" /> Novo Acordo
                </Button>
                <Button variant="outline" size="icon" className="w-8 h-8 relative" onClick={refetch}
                  title={realtimeStatus === 'connected' ? 'Realtime ativo' : realtimeStatus === 'connecting' ? 'Conectando...' : realtimeStatus === 'error' ? 'Erro no Realtime' : 'Sem Realtime'}
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                  <span className={cn('absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
                    realtimeStatus === 'connected'  && 'bg-green-500',
                    realtimeStatus === 'connecting' && 'bg-yellow-400 animate-pulse',
                    realtimeStatus === 'error'      && 'bg-red-500',
                    realtimeStatus === 'off'        && 'bg-muted-foreground/40',
                  )} />
                </Button>
              </div>
            </div>

            <PPTableFilters
              activeTab={activeTab} setActiveTab={setActiveTab}
              mesFiltro={mesFiltro} setMesFiltro={setMesFiltro}
              busca={busca} setBusca={setBusca}
              filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
              filtroTipo={filtroTipo} setFiltroTipo={setFiltroTipo}
              filtroData={filtroData} setFiltroData={setFiltroData}
              filtroVinculo={filtroVinculo} setFiltroVinculo={setFiltroVinculo}
              colFiltroEstado={colFiltroEstado} setColFiltroEstado={setColFiltroEstado}
              estadoDropdown={estadoDropdown} setEstadoDropdown={setEstadoDropdown}
              setCurrentPage={setCurrentPage}
              statusLabels={statusLabels} tipoLabels={tipoLabels}
              isPP={isPP} usuarioTemLogicaDiretoExtra={usuarioTemLogicaDiretoExtra}
              temFiltros={temFiltros} limparFiltros={limparFiltros}
            />

            <div ref={novoInlineRef} />

            <Card className="border-border" data-tour="tabela-acordos">
              <CardContent className="p-0">
                {loading ? <TableSkeleton /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-3 py-3 w-8">
                            <input type="checkbox" className="rounded border-border"
                              checked={selecionados.length === acordos.length && acordos.length > 0}
                              onChange={selecionarTodos}
                            />
                          </th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CÓDIGO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">ESTADO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">VENCIMENTO</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">TIPO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">LINK</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
                          {visaoAmpla && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>}
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÕES</th>
                        </tr>
                      </thead>
                      <PPTableBody
                        acordos={acordos}
                        acordosOrdenados={acordosOrdenados}
                        novoInlineAbertoTabela={novoInlineAbertoTabela}
                        setNovoInlineAbertoTabela={setNovoInlineAbertoTabela}
                        isPP={isPP}
                        visaoAmpla={visaoAmpla}
                        addAcordo={addAcordo}
                        patchAcordo={patchAcordo}
                        editandoInlineIdTabela={editandoInlineIdTabela}
                        setEditandoInlineIdTabela={setEditandoInlineIdTabela}
                        detalheInlineIdTabela={detalheInlineIdTabela}
                        setDetalheInlineIdTabela={setDetalheInlineIdTabela}
                        highlightedId={highlightedId}
                        hoje={hoje}
                        selecionados={selecionados}
                        toggleSelecionado={toggleSelecionado}
                        atualizandoStatus={atualizandoStatus}
                        marcarComoPago={marcarComoPago}
                        gruposJaReagendados={gruposJaReagendados}
                        setReagendarAcordo={setReagendarAcordo}
                        excluindoId={excluindoId}
                        setConfirmandoExclusao={setConfirmandoExclusao}
                        empresaTags={empresaTags}
                        operadoresMap={operadoresMap}
                        temFiltros={temFiltros}
                        limparFiltros={limparFiltros}
                      />
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Paginação */}
            {!loading && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <p className="text-xs text-muted-foreground order-2 sm:order-1">
                  Exibindo {((currentPage - 1) * PER_PAGE) + 1}–{Math.min(currentPage * PER_PAGE, totalCount)} de {totalCount} acordos
                </p>
                <div className="flex items-center gap-1 order-1 sm:order-2">
                  {getPageNumbers(currentPage, totalPages).map((pg, i) =>
                    pg === '...'
                      ? <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
                      : <Button key={pg} variant={pg === currentPage ? 'default' : 'outline'} size="icon" className="w-8 h-8 text-xs" onClick={() => setCurrentPage(pg as number)}>{pg}</Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <PPModals
            filaAberta={filaAberta}
            filaWhatsApp={filaWhatsApp}
            onCloseFilaWhatsApp={() => { setFilaAberta(false); setSelecionados([]); }}
            usuarioId={perfil?.id}
            empresaId={empresa?.id}
            confirmandoExclusao={confirmandoExclusao}
            onCancelExclusao={() => setConfirmandoExclusao(null)}
            onConfirmExclusao={excluirAcordo}
            confirmandoExclusaoLote={confirmandoExclusaoLote}
            selecionados={selecionados}
            onCancelExclusaoLote={() => setConfirmandoExclusaoLote(false)}
            onConfirmExclusaoLote={excluirSelecionados}
            reagendarAcordo={reagendarAcordo}
            salvandoReagendar={salvandoReagendar}
            onConfirmReagendar={handleReagendarDashboard}
            onCloseReagendar={() => setReagendarAcordo(null)}
            temPermissaoExcluirLote={temPermissao('excluir_em_lote')}
            onAbrirExclusaoLote={() => setConfirmandoExclusaoLote(true)}
            onLimparSelecao={() => setSelecionados([])}
            isPP={isPP}
          />
        </div>
      )}

      {/* Bookplay — link para acordos */}
      {!isPP && (
        <div className="flex items-center justify-end text-xs">
          <Button asChild variant="link" size="sm" className="text-xs h-auto p-0">
            <Link to={ROUTE_PATHS.ACORDOS}>Ver todos os acordos ↗</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
