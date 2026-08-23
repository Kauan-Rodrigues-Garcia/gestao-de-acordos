import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, MessageSquare, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { celebrarPetAcordoPago } from '@/components/pet/petEvents';
import { useAcordos } from '@/hooks/useAcordos';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  ROUTE_PATHS, formatCurrency, formatDate, getTodayISO,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { acordoTemCpf } from '@/lib/cpf';
import {
  deslocarMes, mesAtual, primeiroDiaDoMes, ultimoDiaDoMes,
} from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import { supabase, type Acordo } from '@/lib/supabase';
import type { Perfil } from '@/lib/supabase';
import { deduplicarVinculados, temVisaoAmpla, type AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { toast } from 'sonner';
import type { ItemFila } from '@/components/ModalFilaWhatsApp';
import { liberarNrPorAcordoId } from '@/services/nr_registros.service';
import { enviarParaLixeira } from '@/services/lixeira.service';
import { tratarExclusaoVinculo } from '@/services/tratarExclusaoVinculo';
import { registrarLog } from '@/services/logs.service';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { useSetoresEquipes } from '@/hooks/useSetoresEquipes';
import { FiltroEscopo } from './FiltroEscopo';
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

  // Só as LISTAS de setor/equipe. Antes isto vinha de `useAnalytics()`, que
  // varre todos os acordos do mês — e o `AnalyticsPanel` logo abaixo monta o
  // mesmo hook, então a tela fazia a varredura duas vezes. Pior: esta instância
  // rodava sem mês, presa ao corrente, enquanto o painel usa o mês do seletor.
  const { setores: setoresList, setorFiltro, setSetorFiltro, equipesDoSetor, niveis } = useSetoresEquipes();
  // Os quatro testes por cargo que moravam aqui (`isAdmin`, `isLiderOuElite`,
  // `isElite`, `isLider`) decidiam quem via cada filtro. Quem decide agora sao
  // os niveis da aba, resolvidos em `useSetoresEquipes` e lidos por
  // <FiltroEscopo />.

  const [visaoFiltro, setVisaoFiltro] = useState<VisaoFiltro>('setor');
  const equipeFiltroAtivo = visaoFiltro.startsWith('equipe:') ? visaoFiltro.replace('equipe:', '') : null;
  const operadorFiltroAtivo = visaoFiltro === 'individual' ? (perfil?.id ?? null) : null;
  const eliteVisaoGeral = visaoFiltro !== 'individual';

  const { acordos: acordosHoje, loading: loadingHoje } = useAcordos({ apenas_hoje: true });
  const hoje = getTodayISO();
  const diaSemana    = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const [hojeMinimizado, setHojeMinimizado] = useState(false);

  const [mesFiltro, setMesFiltro] = useState<string>(() => mesAtual());

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

  const [activeTab, setActiveTab] = useState<'todos' | 'pendentes' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'todos' | 'pendentes' | 'pagos' | 'nao_pagos') || 'todos',
  );

  const [selecionados,            setSelecionados]            = useState<string[]>([]);
  useEffect(() => { setSelecionados([]); }, [currentPage, filtroStatus, filtroTipo, activeTab]);
  const [atualizandoStatus,       setAtualizandoStatus]       = useState<string | null>(null);
  const [filaAberta,              setFilaAberta]              = useState(false);
  const [filaWhatsApp,            setFilaWhatsApp]            = useState<ItemFila[]>([]);
  const [excluindoId,             setExcluindoId]             = useState<string | null>(null);
  const [confirmandoExclusao,     setConfirmandoExclusao]     = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);
  const [reagendarAcordo,         setReagendarAcordo]         = useState<AcordoComVinculo | null>(null);
  const [salvandoReagendar,       setSalvandoReagendar]       = useState(false);
  const [confirmarPgtoAcordo,     setConfirmarPgtoAcordo]     = useState<AcordoComVinculo | null>(null);
  const [salvandoConfirmarPgto,   setSalvandoConfirmarPgto]   = useState(false);
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
    : activeTab === 'pendentes' ? 'verificar_pendente'
    : activeTab === 'pagos'     ? 'pago'
    : activeTab === 'nao_pagos' ? 'nao_pago'
    : filtroStatus || undefined;

  const mesFiltroInicio = mesFiltro ? primeiroDiaDoMes(mesFiltro) : undefined;
  const mesFiltroFim    = mesFiltro ? ultimoDiaDoMes(mesFiltro)   : undefined;

  const nextMonthRange = useMemo(() => {
    if (!mesFiltro) return null;
    // `deslocarMes` já cuida da virada de ano — a conta manual de mês 12 → 1
    // que morava aqui era a quarta cópia da mesma aritmética no projeto.
    const proximo = deslocarMes(mesFiltro, 1);
    return { start: primeiroDiaDoMes(proximo), end: ultimoDiaDoMes(proximo) };
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

  const { acordos, totalCount, loading, atualizando, refetch, patchAcordo, removeAcordo, addAcordo, realtimeStatus } = useAcordos(
    isPP ? {
      busca:        busca || undefined,
      status:       statusFiltroComputed,
      tipo:         filtroTipo && filtroTipo !== 'all' ? filtroTipo : undefined,
      vencimento:   filtroData || undefined,
      data_inicio:  filtroData ? undefined : mesFiltroInicio,
      data_fim:     filtroData ? undefined : mesFiltroFim,
      estado_uf:    colFiltroEstado || undefined,
      operador_id:  (!niveis.includes('setor') || visaoFiltro === 'individual') ? perfil?.id : undefined,
      equipe_id:    equipeFiltroAtivo ?? undefined,
      page:         currentPage,
      perPage:      PER_PAGE,
      prioritize_today: true,
    } : {
      // BookPlay não renderiza esta tabela (é PP-only, ver `{isPP && ...}`
      // abaixo). Ainda assim o hook roda: limita a 1 página para NÃO disparar
      // um fetch da empresa inteira em acordos_deduplicados (causa de 500/timeout).
      page: 1, perPage: PER_PAGE, enableRealtime: false,
    },
  );

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
      base = deduplicarVinculados(base, isPP);
    }
    return [...base].sort((a, b) => {
      // Acordo com CPF vem SEMPRE primeiro, acima até dos que vencem hoje: é
      // dado pessoal que precisa sair do sistema, e enterrado na página 7
      // ninguém corrige (migrations 20260803a/b).
      const aCpf = acordoTemCpf(a) ? 1 : 0;
      const bCpf = acordoTemCpf(b) ? 1 : 0;
      if (aCpf !== bCpf) return bCpf - aCpf;

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
    if (!niveis.includes('setor')) return;
    const ids = [...new Set([...acordosDeHoje, ...acordos].map(a => a.operador_id).filter(Boolean))];
    if (ids.length === 0) return;
    supabase.from('perfis').select('id, nome').in('id', ids as string[]).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => { map[p.id] = p.nome; });
        setOperadoresMap(prev => ({ ...prev, ...map }));
      }
    });
  }, [acordosDeHoje, acordos, isPP, niveis]);

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

  // Abre o formulário inline quando navegado a partir da aba Analítico
  const novoInlineParam = searchParams.get('novoInline');
  useEffect(() => {
    if (!novoInlineParam) return;
    setNovoInlineAbertoTabela(true);
    const params = new URLSearchParams(searchParams);
    params.delete('novoInline');
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novoInlineParam]);

  // Abre o detalhe inline e cola o código na busca (vindo do Analítico)
  const verAcordoParam = searchParams.get('verAcordo');
  useEffect(() => {
    if (!verAcordoParam) return;
    setDetalheInlineIdTabela(verAcordoParam);
    // Cola o código na caixa de busca para filtrar a lista sem mudar de aba
    const codigoBusca = searchParams.get('busca');
    if (codigoBusca) setBusca(codigoBusca);
    const params = new URLSearchParams(searchParams);
    params.delete('verAcordo');
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verAcordoParam]);

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
    if ((a.status as string) === 'nao_pago')             setActiveTab('nao_pagos');
    else if ((a.status as string) === 'pago')            setActiveTab('pagos');
    else if ((a.status as string) === 'verificar_pendente') setActiveTab('pendentes');
    else                                                  setActiveTab('todos');
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

  function marcarComoPago(acordo: AcordoComVinculo) {
    if (acordo.status === 'nao_pago') {
      setConfirmarPgtoAcordo(acordo);
    } else {
      // Pendente → pago sem caixa: mantém o vencimento tabulado do acordo
      void executarMarcarPago(acordo, acordo.vencimento);
    }
  }

  async function executarMarcarPago(acordo: AcordoComVinculo, dataPagamento: string) {
    const id = acordo.id;
    const statusAnterior = acordo.status;
    const vencimentoAnterior = acordo.vencimento;
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
      celebrarPetAcordoPago();
      if (acordo.vinculo_operador_id || acordo.tipo_vinculo === 'extra') {
        supabase.rpc('fn_sync_par_vinculo', {
          p_acordo_id: id, p_valor: acordo.valor, p_vencimento: dataPagamento,
          p_nome_cliente: acordo.nome_cliente, p_tipo: acordo.tipo,
          p_whatsapp: acordo.whatsapp ?? null, p_parcelas: acordo.parcelas, p_status: 'pago',
        }).then(({ error: rpcErr }) => {
          if (rpcErr) console.warn('[marcarComoPago] sync par falhou:', rpcErr.message);
        });
      }
      const numParcela = acordo.numero_parcela ?? 1;
      const deveReagendar = isPP && (acordo.parcelas ?? 1) > 1 && TIPOS_PARCELADOS_PP.includes(acordo.tipo) && numParcela < (acordo.parcelas ?? 1);
      if (deveReagendar) {
        setReagendarAcordo(acordo);
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
      const quantToCreate = 1;

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
        // A UF viaja explicitamente. Antes só o prefixo [ESTADO:XX] dentro de
        // `observacoes` a carregava — e a fase 2 da migration 20260506 prevê
        // remover esse prefixo, o que faria a parcela reagendada nascer sem
        // estado (agora recusada pelo gatilho da 20260802c).
        estado_uf:             parcelaAtual.estado_uf ?? null,
        operador_id:           parcelaAtual.operador_id,
        empresa_id:            parcelaAtual.empresa_id,
        setor_id:              parcelaAtual.setor_id ?? null,
        data_cadastro:         getTodayISO(),
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
          .insert({ ...basePayload, numero_parcela: numero, vencimento: vencCalc } as never)
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
                // Ver nota em basePayload: a UF viaja explicitamente.
                estado_uf:             (parInstall as Acordo).estado_uf ?? null,
                operador_id:           (parInstall as Acordo).operador_id,
                empresa_id:            (parInstall as Acordo).empresa_id,
                setor_id:              (parInstall as Acordo).setor_id ?? null,
                data_cadastro:         getTodayISO(),
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
      toast.success(`Parcela ${proximaNumero}/${totalParcelas} reagendada para ${formatDate(params.novoVencimento)}!`);
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
      // Auditada pela trigger `trg_log_acordos` (migration 20260812a), que grava
      // a linha inteira e registra se o acordo foi para a lixeira.
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
      // Cada acordo tem seu log pela trigger. O que falta é o fato de terem
      // saído juntos, num único clique — um log de lote em vez de N iguais.
      void registrarLog({
        acao: 'acordo_excluido_em_lote',
        categoria: 'acordo',
        severidade: 'aviso',
        descricao: `Excluiu ${ids.length} acordo(s) em uma única ação`,
        empresaId: empresa?.id ?? null,
        tabela: 'acordos',
        alvoTipo: 'acordo',
        detalhes: {
          quantidade: ids.length,
          acordos: acordosParaExcluir
            .slice(0, 50)
            .map(a => `NR ${a.nr_cliente} — ${a.nome_cliente}`),
          truncado: acordosParaExcluir.length > 50,
          origem_tela: 'dashboard',
        },
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
          {/*
           * Aqui ficavam a barra da meta do mês, a posição no ranking e o
           * quartil (o componente `MetaProgressoHeader`). Removidos em
           * 16/08/2026 a pedido: a saudação é a porta de entrada e essas três
           * barras empurravam o resto da tela para baixo, repetindo o que o
           * Painel de Metas já mostra com mais espaço e melhor recorte.
           */}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* O recorte de setor/equipe/pessoa mora num controle so, logo acima
              do painel — ver <FiltroEscopo />. Ficava aqui, partido em dois
              filtros que nao conversavam. */}
          {isPP && acordosDeHoje.length > 0 && (
            <Button variant="outline" size="sm" className="hidden text-xs h-8 gap-1.5 text-success border-success/30 hover:bg-success/10" onClick={enviarLembretesHoje}>
              <MessageSquare className="w-3.5 h-3.5" /> Lembretes do dia ({acordosDeHoje.length})
            </Button>
          )}
        </div>
      </div>

      {/* Analytics + setor filter */}
      <div className="mb-6 space-y-2" data-tour="metricas">
        <FiltroEscopo
          niveis={niveis}
          setores={setoresList}
          setorFiltro={setorFiltro}
          onSetor={setSetorFiltro}
          equipes={equipesDoSetor}
          visao={visaoFiltro}
          onVisao={setVisaoFiltro}
          setorDoPerfil={perfil?.setor_id ?? null}
        />
        <AnalyticsPanel
          setorFiltro={setorFiltro}
          equipeFiltroExterno={equipeFiltroAtivo}
          operadorFiltroExterno={operadorFiltroAtivo}
          temLogicaDiretoExtra={usuarioTemLogicaDiretoExtra}
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
                  {/* `atualizando` junto: a releitura silenciosa não liga
                      `loading`, e sem isto o botão ficava parado enquanto a
                      busca acontecia — parecia que o clique não pegou. */}
                  <RefreshCw className={cn('w-3.5 h-3.5', (loading || atualizando) && 'animate-spin')} />
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
                        podeEditar={temPermissao('editar_acordos')}
                        podeExcluir={temPermissao('excluir_acordos')}
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
            confirmarPgtoAcordo={confirmarPgtoAcordo}
            salvandoConfirmarPgto={salvandoConfirmarPgto}
            onConfirmarPgto={async (data) => {
              if (!confirmarPgtoAcordo) return;
              setSalvandoConfirmarPgto(true);
              await executarMarcarPago(confirmarPgtoAcordo, data);
              setSalvandoConfirmarPgto(false);
              setConfirmarPgtoAcordo(null);
            }}
            onCancelarConfirmarPgto={() => setConfirmarPgtoAcordo(null)}
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
