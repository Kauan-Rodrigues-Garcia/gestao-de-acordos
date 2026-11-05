/**
 * A mesa de acordos da regra Cofen — a aba Acordos para quem é Cofen.
 *
 * Até 05/11/2026 ela morava DENTRO do Dashboard (a seção «Acordos» abaixo dos
 * indicadores), e a regra Cofen não tinha a aba Acordos. Veio para cá a pedido
 * do Cleber («deixar a aba separada tanto nosso produto quanto cofen»): as duas
 * regras com a mesma estrutura, Dashboard para os indicadores e Acordos para a
 * mesa. O código é o mesmo que estava no Dashboard, movido sem reescrever —
 * os filtros (`PPTableFilters`), a tabela (`PPTableBody`) e os modais
 * (`PPModals`) são os de sempre, com as colunas da regra Cofen (código,
 * estado, link). O que mudou:
 *
 *   - o ALCANCE (de quem são os acordos) era o recorte do Dashboard; agora é o
 *     da aba Acordos (`useAlcanceAcordos`, o mesmo da mesa de Nosso produto), e
 *     quem decide é o painel de permissões;
 *   - os links que abriam um acordo no Dashboard (`?acordo=`, `?verAcordo=`,
 *     `?novoInline=`, `?highlight=`) abrem aqui.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useLugarNoMes } from '@/hooks/useLugarNoMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAcordos } from '@/hooks/useAcordos';
import { useValorComEspera } from '@/hooks/useValorComEspera';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { formatDate, getTodayISO } from '@/lib/index';
import {
  desfazerPagoNoBanco, esquecerPagoDesfazivel, guardarPagoDesfazivel, pagoDesfazivel,
} from '@/lib/desfazerPago';
import { useTenant } from '@/lib/tenant-config';
import { acordoTemCpf } from '@/lib/cpf';
import { alternarSelecaoDoDia } from '@/lib/acordosPorDia';
import { primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import { useMesGlobal } from '@/providers/MesProvider';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { cn } from '@/lib/utils';
import { supabase, type Acordo } from '@/lib/supabase';
import { deduplicarVinculados, temVisaoAmpla, type AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { toast } from 'sonner';
import type { ItemFila } from '@/components/ModalFilaWhatsApp';
import { liberarNrPorAcordoId } from '@/services/nr_registros.service';
import { enviarParaLixeira } from '@/services/lixeira.service';
import { registrarLog } from '@/services/logs.service';
import type { ReagendarParams } from '@/components/ModalReagendar';
import { useParcelasExistentes } from '@/hooks/useParcelasExistentes';
import { podeReagendar, avisoParcelaJaAgendada } from '@/services/reagendamento/reagendamento';
import { agendarProximaParcela } from '@/services/reagendamento/agendarProximaParcela';
import { PER_PAGE, buildMensagem, getPageNumbers } from '@/pages/Dashboard/helpers';
import { TableSkeleton } from './TableSkeleton';
import { useAlcanceAcordos } from './useAlcanceAcordos';
import { SeletorAlcance } from './SeletorAlcance';
import { PPTableFilters } from './cofen/PPTableFilters';
import { PPTableBody, PPColunas } from './cofen/PPTableBody';
import { PPModals } from './cofen/PPModals';

export function AcordosCofen() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  // Esta mesa só existe na regra Cofen (`Acordos`, em `index.tsx`, escolhe).
  const isPP = tenant.isPaguePlay;
  const statusLabels = tenant.statusLabels;
  const tipoLabels   = tenant.tipoLabels;

  // O mês é o do sistema (`MesProvider`): escolher agosto no Dashboard e vir para cá continua em agosto.
  const { mes: mesFiltro, setMes: setMesFiltro } = useMesGlobal();
  // Meu setor e minha equipe NO MÊS olhado (o retrato, no mês fechado) — para o Direto/Extra.
  const lugar = useLugarNoMes(mesFiltro);

  // De quem são os acordos: o alcance da aba Acordos, pelo painel de permissões.
  const {
    niveis, podeVerSetor,
    visao, setVisao, isVisaoIndividual, equipeFiltroAtivo,
    filtroSetor, setFiltroSetor, equipesDoSetor, setoresDoFiltro,
  } = useAlcanceAcordos(mesFiltro);

  // Os lembretes do dia (o botão está escondido, como estava no Dashboard).
  const { acordos: acordosHoje } = useAcordos({ apenas_hoje: true });
  const hoje = getTodayISO();

  const [searchParams, setSearchParams] = useSearchParams();
  const [busca,        setBusca]        = useState(searchParams.get('busca')  || '');
  const buscaConsulta = useValorComEspera(busca);
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo,   setFiltroTipo]   = useState(searchParams.get('tipo')   || '');
  const [filtroData,   setFiltroData]   = useState(searchParams.get('data')   || '');
  const [currentPage,  setCurrentPage]  = useState(Number(searchParams.get('page')) || 1);
  const [colFiltroEstado,    setColFiltroEstado]    = useState('');
  const [estadoDropdown,     setEstadoDropdown]     = useState(false);

  // Mês fechado: o Direto/Extra que valia NAQUELE mês (retrato).
  const { isAtivoParaUsuario } = useDiretoExtraConfig(mesFiltro);
  const usuarioTemLogicaDiretoExtra = isAtivoParaUsuario(perfil?.id ?? '', lugar.setorId, lugar.principal);
  const [filtroVinculo, setFiltroVinculo] = useState<'todos' | 'direto' | 'extra'>(
    (searchParams.get('vinculo') as 'todos' | 'direto' | 'extra') || 'todos'
  );
  const visaoAmpla = temVisaoAmpla(perfil?.perfil);
  const { tags: empresaTags } = useEmpresaTags();

  const [activeTab, setActiveTab] = useState<'todos' | 'pendentes' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'todos' | 'pendentes' | 'pagos' | 'nao_pagos') || 'todos',
  );
  // Monitoramento de uso: a sub-aba, como na mesa de Nosso produto.
  useSubAbaUso(activeTab);

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

  useEffect(() => { setCurrentPage(1); }, [colFiltroEstado]);

  useEffect(() => {
    if (novoInlineAbertoTabela) {
      novoInlineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [novoInlineAbertoTabela]);

  /** `?acordo=<id>` (card do chat, notificação): a lista mostra só este acordo. */
  const acordoFoco = searchParams.get('acordo');
  function sairDoAcordoFoco() {
    setSearchParams(atual => {
      const params = new URLSearchParams(atual);
      params.delete('acordo');
      return params;
    }, { replace: true });
  }

  const { acordos, totalCount, loading, atualizando, refetch, patchAcordo, removeAcordo, addAcordo, realtimeStatus } = useAcordos(
    acordoFoco ? {
      // Os filtros da tela (mês, aba, visão) esconderiam o acordo de outro mês.
      ids: [acordoFoco], page: 1, perPage: PER_PAGE,
    } : {
      busca:        buscaConsulta || undefined,
      status:       statusFiltroComputed,
      tipo:         filtroTipo && filtroTipo !== 'all' ? filtroTipo : undefined,
      vencimento:   filtroData || undefined,
      data_inicio:  filtroData ? undefined : mesFiltroInicio,
      data_fim:     filtroData ? undefined : mesFiltroFim,
      estado_uf:    colFiltroEstado || undefined,
      // Sem o nível de setor (ou em «Individual»), só os próprios — como na mesa de Nosso produto.
      operador_id:  (!podeVerSetor || isVisaoIndividual) ? perfil?.id : undefined,
      setor_id:     filtroSetor ?? undefined,
      equipe_id:    equipeFiltroAtivo ?? undefined,
      page:         currentPage,
      perPage:      PER_PAGE,
      prioritize_today: true,
    },
  );

  const acordosDeHoje = useMemo(() =>
    acordosHoje.filter(a => a.vencimento === hoje),
    [acordosHoje, hoje],
  );

  // Quais parcelas já existem, por grupo. Ver `hooks/useParcelasExistentes`.
  const parcelasExistentes = useParcelasExistentes(acordos, empresa?.id);

  const acordosOrdenados = useMemo<AcordoComVinculo[]>(() => {
    // O acordo pedido aparece como é, sem filtro de vínculo nem dedução do par.
    if (acordoFoco) return acordos;
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
  // `isPP` escolhe a chave com que `deduplicarVinculados` agrupa (`instituicao` na regra Cofen).
  }, [acordos, acordoFoco, usuarioTemLogicaDiretoExtra, filtroVinculo, visaoAmpla, hoje, isPP]);

  useEffect(() => {
    if (!podeVerSetor) return;
    const ids = [...new Set([...acordosDeHoje, ...acordos].map(a => a.operador_id).filter(Boolean))];
    if (ids.length === 0) return;
    supabase.from('perfis').select('id, nome').in('id', ids as string[]).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => { map[p.id] = p.nome; });
        setOperadoresMap(prev => ({ ...prev, ...map }));
      }
    });
  }, [acordosDeHoje, acordos, podeVerSetor]);

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

  // Ref + updater: pôr `setSearchParams` nas dependências faria a escrita na
  // URL reagendar o próprio efeito e empilhar a mesma URL duas vezes no histórico.
  const setSearchParamsRef = useRef(setSearchParams);
  useEffect(() => { setSearchParamsRef.current = setSearchParams; });

  useEffect(() => {
    const timer = setTimeout(() => setSearchParamsRef.current(atual => {
      const params = new URLSearchParams(atual);
      if (busca)        params.set('busca',  busca);        else params.delete('busca');
      if (filtroStatus) params.set('status', filtroStatus); else params.delete('status');
      if (filtroTipo)   params.set('tipo',   filtroTipo);   else params.delete('tipo');
      if (filtroData)   params.set('data',   filtroData);   else params.delete('data');
      if (activeTab !== 'todos') params.set('tab', activeTab); else params.delete('tab');
      if (filtroVinculo !== 'todos') params.set('vinculo', filtroVinculo); else params.delete('vinculo');
      params.set('page', currentPage.toString());
      return params;
    }), 400);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTipo, filtroData, activeTab, filtroVinculo, currentPage]);

  // Atalhos: «N» abre/fecha o novo acordo; Esc fecha o que estiver aberto.
  useEffect(() => {
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
  }, []);

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

  function alternarDia(idsDoDia: string[]) {
    setSelecionados(prev => alternarSelecaoDoDia(prev, idsDoDia));
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
      // Por 5 min o botão de pago da linha vira «Desfazer» (08/10/2026).
      guardarPagoDesfazivel(id, {
        statusAnterior, vencimentoAnterior, dataPagamentoAnterior: acordo.data_pagamento ?? null,
      });
      // O par Direto↔Extra acompanha no banco (`trg_vinculo_par_upd`).
      // `acordo` é o de antes do update; a regra exige a parcela paga.
      if (podeReagendar({ ...acordo, status: 'pago' }, isPP, parcelasExistentes).pode) {
        setReagendarAcordo(acordo);
      } else {
        toast.success('Acordo marcado como Pago!', {
          description: 'Errou? O botão «Desfazer» fica na linha por 5 minutos.',
          duration: 5000,
          action: { label: 'Desfazer', onClick: () => { void desfazerPago(acordo); } },
        });
      }
    }
    setAtualizandoStatus(null);
  }

  /** «Desfazer» da linha (ou do aviso): o acordo volta ao status de antes do pago. */
  async function desfazerPago(acordo: AcordoComVinculo) {
    const antes = pagoDesfazivel(acordo.id);
    if (!antes) { toast.info('Passou o tempo de desfazer. Edite o acordo para mudar o status.'); return; }
    setAtualizandoStatus(acordo.id);
    const erro = await desfazerPagoNoBanco(acordo.id, antes);
    setAtualizandoStatus(null);
    if (erro) { toast.error(`Não foi possível desfazer: ${erro}`); return; }
    esquecerPagoDesfazivel(acordo.id);
    patchAcordo(acordo.id, {
      status: antes.statusAnterior as Acordo['status'],
      vencimento: antes.vencimentoAnterior,
      data_pagamento: antes.dataPagamentoAnterior,
    });
    // O par Direto↔Extra volta junto no banco, como foi junto no «pago».
    toast.success('Pagamento desfeito: o acordo voltou ao status de antes.');
  }

  async function handleReagendar(params: ReagendarParams) {
    if (!reagendarAcordo || !empresa?.id) return;
    setSalvandoReagendar(true);
    try {
      // A parcela nasce do DONO do acordo, pelo servidor — inclusive quando
      // quem clica é o líder, que a RLS de insert barrava. O par Direto/Extra
      // vem junto, na mesma transação. Ver agendarProximaParcela.
      const r = await agendarProximaParcela(reagendarAcordo, {
        vencimento: params.novoVencimento,
        valor:      params.novoValor,
      });
      if ('erro' in r) { toast.error(r.erro); return; }
      setReagendarAcordo(null);
      if (r.jaExistia) { toast.info(avisoParcelaJaAgendada(r.numero, r.total)); return; }
      if (r.parcela) addAcordo(r.parcela);
      toast.success(`Parcela ${r.numero}/${r.total} reagendada para ${formatDate(params.novoVencimento)}!`);
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
    // O par Direto/Extra é tratado no banco, no próprio DELETE
    // (`trg_vinculo_par_del`, migration 20261030235500).
    await enviarParaLixeira({ acordo: a, motivo: 'exclusao_manual', operadorNome: perfil?.nome ?? perfil?.email ?? undefined });
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) { toast.error('Erro ao excluir acordo: ' + error.message); }
    else {
      liberarNrPorAcordoId(a.id);
      // Auditada pela trigger `trg_log_acordos` (migration 20260812a).
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
          origem_tela: 'acordos',
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

  return (
    <div className="p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div>
          {/* Cabeçalho */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Acordos</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? 'Carregando...' : `${totalCount} acordo(s) no total`}
                {selecionados.length > 0 && <span className="ml-2 text-primary font-medium">· {selecionados.length} selecionado(s)</span>}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {acordosDeHoje.length > 0 && (
                <Button variant="outline" size="sm" className="hidden text-xs h-8 gap-1.5 text-success border-success/30 hover:bg-success/10" onClick={enviarLembretesHoje}>
                  <MessageSquare className="w-3.5 h-3.5" /> Lembretes do dia ({acordosDeHoje.length})
                </Button>
              )}
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
                {/* `atualizando` junto: a releitura silenciosa não liga `loading`. */}
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

          {/* De quem são os acordos: setor, equipe, Individual — o alcance da aba. */}
          <SeletorAlcance
            niveis={niveis} equipesDoSetor={equipesDoSetor} setoresDisponiveis={setoresDoFiltro}
            filtroSetor={filtroSetor} setFiltroSetor={setFiltroSetor}
            visao={visao} setVisao={setVisao}
            aoMudar={() => setCurrentPage(1)}
          />

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

          {acordoFoco && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <span>Mostrando só o acordo que você abriu pelo aviso.</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={sairDoAcordoFoco}>
                Ver todos os acordos
              </Button>
            </div>
          )}

          <Card className="border-border" data-tour="tabela-acordos">
            <CardContent className="p-0">
              {loading ? <TableSkeleton /> : (
                <div className="overflow-x-auto">
                  {/* `table-fixed` + `PPColunas`: toda linha com a mesma largura de
                      coluna. Abaixo da largura mínima, rola para o lado. */}
                  <table className="w-full min-w-[1000px] table-fixed text-xs">
                    <PPColunas visaoAmpla={visaoAmpla} />
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-3">
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
                      alternarDia={alternarDia}
                      atualizandoStatus={atualizandoStatus}
                      marcarComoPago={marcarComoPago}
                      desfazerPago={desfazerPago}
                      parcelasExistentes={parcelasExistentes}
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
          onConfirmReagendar={handleReagendar}
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
    </div>
  );
}
