import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  ArrowRight, MessageSquare, Plus, Building2,
  Search, Filter, RefreshCw, X,
  Edit, Eye, CheckCircle, CheckCircle2, Hash, MapPin, Link2,
  ChevronLeft, ChevronRight, ChevronDown, Trash2,
  ToggleLeft, ToggleRight, Layers, Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAcordos } from '@/hooks/useAcordos';
import {
  ROUTE_PATHS, formatCurrency, formatDate,
  STATUS_COLORS, STATUS_LABELS, TIPO_LABELS, TIPO_COLORS,
  getTodayISO, isPaguePlay, getTipoLabels, getStatusLabels,
  TIPO_OPTIONS_PAGUEPLAY, STATUS_LABELS_PAGUEPLAY, TIPO_LABELS_PAGUEPLAY,
  extractEstado, extractLinkAcordo, isAtrasado, ESTADOS_BRASIL,
  isPerfilAdmin, isPerfilLider,
} from '@/lib/index';
import { cn } from '@/lib/utils';
import { supabase, Acordo } from '@/lib/supabase';
import type { Perfil } from '@/lib/supabase';
import { deduplicarVinculados, temVisaoAmpla, type AcordoComVinculo } from '@/lib/deduplicarVinculados';
import { VinculoTag } from '@/components/VinculoTag';
import { OperadorCell } from '@/components/OperadorCell';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { toast } from 'sonner';
import { ModalFilaWhatsApp, type ItemFila } from '@/components/ModalFilaWhatsApp';
import { AcordoEditInline } from '@/components/AcordoEditInline';
import { AcordoDetalheInline } from '@/components/AcordoDetalheInline';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import { criarNotificacao }         from '@/services/notificacoes.service';
import { liberarNrPorAcordoId }     from '@/services/nr_registros.service';
import { enviarParaLixeira }        from '@/services/lixeira.service';
import { tratarExclusaoVinculo }    from '@/services/tratarExclusaoVinculo';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { useAnalytics } from '@/hooks/useAnalytics';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Garante que a URL seja absoluta (com esquema http/https). */
function ensureAbsoluteUrl(url: string): string {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

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
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6',
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

// ─── Types ────────────────────────────────────────────────────────────────────
type VisaoFiltro = 'setor' | `equipe:${string}` | 'individual';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);
  const statusLabels = getStatusLabels(tenantSlug);
  const tipoLabels   = getTipoLabels(tenantSlug);

  // ── filtro de setor para admin (via useAnalytics) ───────────────────────────
  const { setores: setoresList, setorFiltro, setSetorFiltro, equipesDoSetor } = useAnalytics();
  const isAdmin = isPerfilAdmin(perfil?.perfil ?? '');
  const isLiderOuElite = isPerfilLider(perfil?.perfil ?? '');
  const isElite = perfil?.perfil === 'elite';
  const isLider = perfil?.perfil === 'lider';

  // ── Filtro de visão Líder/Elite ─────────────────────────────────────────────
  // 'setor'    = visão geral do setor (padrão para Líder e Elite)
  // 'equipe:<id>' = visão de equipe específica
  // 'individual'  = visão individual (só Elite)
  const [visaoFiltro, setVisaoFiltro] = useState<VisaoFiltro>('setor');

  // Derivar equipeFiltro e operadorFiltro a partir do visaoFiltro
  const equipeFiltroAtivo = visaoFiltro.startsWith('equipe:')
    ? visaoFiltro.replace('equipe:', '')
    : null;
  const operadorFiltroAtivo = visaoFiltro === 'individual' ? (perfil?.id ?? null) : null;

  // Legado — mantido para compatibilidade com código existente que usa eliteVisaoGeral
  const eliteVisaoGeral = visaoFiltro !== 'individual';

  // ── acordos de hoje ──────────────────────────────────────────────────────────
  const { acordos: acordosHoje, loading: loadingHoje } = useAcordos({ apenas_hoje: true });
  const hoje = getTodayISO();
  const diaSemana    = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── minimizar seção acordos de hoje ───────────────────────────────────────────
  const [hojeMinimizado, setHojeMinimizado] = useState(false);

  // ── filtro de mês (PaguePay — tabela completa e seção hoje) ────────────────────
  const [mesFiltro, setMesFiltro] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // ── estados da tabela completa (PaguePay only) ───────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca,        setBusca]        = useState(searchParams.get('busca')  || '');
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo,   setFiltroTipo]   = useState(searchParams.get('tipo')   || '');
  const [filtroData,   setFiltroData]   = useState(searchParams.get('data')   || '');
  const [currentPage,  setCurrentPage]  = useState(Number(searchParams.get('page')) || 1);
  // Filtros de coluna (client-side, PaguePay)
  const [colFiltroEstado,  setColFiltroEstado]  = useState('');
  const [colFiltroDia,     setColFiltroDia]     = useState(''); // dia dentro do mesFiltro
  const [estadoDropdown,   setEstadoDropdown]   = useState(false);
  // ── Filtro Direto / Extra ─────────────────────────────────────────────────
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

  const [activeTab, setActiveTab]       = useState<'todos' | 'pagos' | 'nao_pagos'>(
    (searchParams.get('tab') as 'todos' | 'pagos' | 'nao_pagos') || 'todos',
  );

  const [selecionados,            setSelecionados]            = useState<string[]>([]);
  // Limpar seleção quando filtros ou página mudam
  useEffect(() => { setSelecionados([]); }, [currentPage, filtroStatus, filtroTipo, activeTab]);
  const [atualizandoStatus,       setAtualizandoStatus]       = useState<string | null>(null);
  const [filaAberta,              setFilaAberta]              = useState(false);
  const [filaWhatsApp,            setFilaWhatsApp]            = useState<ItemFila[]>([]);
  const [excluindoId,             setExcluindoId]             = useState<string | null>(null);
  const [confirmandoExclusao,     setConfirmandoExclusao]     = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);
  // Inline edit — estados separados por seção para evitar abertura dupla
  const [editandoInlineIdHoje,    setEditandoInlineIdHoje]    = useState<string | null>(null);
  const [editandoInlineIdTabela,  setEditandoInlineIdTabela]  = useState<string | null>(null);
  const [detalheInlineIdTabela,   setDetalheInlineIdTabela]   = useState<string | null>(null);
  // Novo acordo inline (tabela completa)
  const [novoInlineAbertoTabela,  setNovoInlineAbertoTabela]  = useState(false);
  // Mapa de nomes de operadores (carregado apenas para PaguePay + admin/lider)
  const [operadoresMap,           setOperadoresMap]           = useState<Record<string, string>>({});

  // ── hooks dependentes dos filtros (declarados ANTES dos useEffects para evitar TDZ) ─
  const statusFiltroComputed =
    filtroStatus && filtroStatus !== 'all' ? filtroStatus
    : activeTab === 'pagos'     ? 'pago'
    : activeTab === 'nao_pagos' ? 'nao_pago'
    : filtroStatus || undefined;

  // Calcular início/fim do mês filtrado para PaguePay
  const mesFiltroInicio = mesFiltro ? `${mesFiltro}-01` : undefined;
  const mesFiltroFim = mesFiltro
    ? (() => {
        const [y, m] = mesFiltro.split('-').map(Number);
        const ultimo = new Date(y, m, 0).getDate();
        return `${mesFiltro}-${String(ultimo).padStart(2, '0')}`;
      })()
    : undefined;

  const { acordos, totalCount, loading, refetch, patchAcordo, removeAcordo, addAcordo, realtimeStatus } = useAcordos(
    isPP ? {
      busca:        busca || undefined,
      status:       statusFiltroComputed,
      tipo:         filtroTipo && filtroTipo !== 'all' ? filtroTipo : undefined,
      vencimento:   filtroData || undefined,
      data_inicio:  filtroData ? undefined : mesFiltroInicio,
      data_fim:     filtroData ? undefined : mesFiltroFim,
      // Filtro de operador: operador normal OU Elite em modo individual
      operador_id:  (perfil?.perfil === 'operador' || visaoFiltro === 'individual')
        ? perfil?.id
        : undefined,
      // Filtro de equipe: Líder/Elite em modo equipe
      equipe_id:    equipeFiltroAtivo ?? undefined,
      page:         currentPage,
      perPage:      PER_PAGE,
    } : {},
  );

  // dados para gráficos (dashboard normal / Bookplay)
  const { acordos: todosAcordos } = useAcordos();

  // Acordos de hoje para a seção de destaque
  const acordosDeHoje = useMemo(() =>
    acordosHoje.filter(a => a.vencimento === hoje),
    [acordosHoje, hoje],
  );

  // PaguePlay: aplicar dedup Direto+Extra e filtros de coluna
  const acordosOrdenados = useMemo<AcordoComVinculo[]>(() => {
    // 1) Base para dedup/filtro de vínculo
    let base: AcordoComVinculo[] = acordos;
    if (usuarioTemLogicaDiretoExtra && filtroVinculo !== 'todos') {
      base = base.filter(a => (a.tipo_vinculo ?? 'direto') === filtroVinculo);
    }
    if (visaoAmpla && filtroVinculo === 'todos') {
      base = deduplicarVinculados(base, true); // Dashboard é sempre PP
    }

    // 2) Reordenar (PP)
    if (!isPP) return base;
    const hoje_ = hoje;
    let lista = [...base].sort((a, b) => {
      const aHoje = a.vencimento === hoje_ && a.status !== 'pago' ? 0 : 1;
      const bHoje = b.vencimento === hoje_ && b.status !== 'pago' ? 0 : 1;
      return aHoje - bHoje;
    });
    // Filtros de coluna client-side
    if (colFiltroEstado)  lista = lista.filter(a => extractEstado(a.observacoes) === colFiltroEstado);
    if (colFiltroDia)     lista = lista.filter(a => a.vencimento === `${mesFiltro}-${colFiltroDia.padStart(2,'0')}`);
    return lista;
  }, [acordos, hoje, isPP, colFiltroEstado, colFiltroDia, mesFiltro, usuarioTemLogicaDiretoExtra, filtroVinculo, visaoAmpla]);

  // NOTA: O Realtime cirúrgico (patch/add/remove) já está no useAcordos — não duplicar aqui.

  // Carrega nomes dos operadores (PaguePay + admin/lider)
  useEffect(() => {
    if (!isPP) return;
    const perfilAtual = perfil?.perfil;
    if (perfilAtual !== 'administrador' && perfilAtual !== 'lider' && perfilAtual !== 'super_admin') return;
    const ids = [...new Set([...acordosDeHoje, ...acordos].map(a => a.operador_id).filter(Boolean))];
    if (ids.length === 0) return;
    supabase.from('perfis').select('id, nome').in('id', ids as string[]).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => { map[p.id] = p.nome; });
        setOperadoresMap(prev => ({ ...prev, ...map }));
      }
    });
  }, [acordosDeHoje, acordos, isPP, perfil?.perfil]);

  // sync URL (apenas PaguePay)
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

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const temFiltros = !!(busca || filtroStatus || filtroTipo || filtroData);
  const nome       = perfil?.nome?.split(' ')[0] || 'Usuário';

  // ── mover atrasados → nao_pago ─────────────────────────────────────────────
  // Guard: evita loop infinito (useEffect depende de `acordos`, que muda após refetch).
  // Só executa quando `acordos` muda; o guard de IDs garante que cada lote só roda 1×.
  const atrasadosProcessadosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isPP || loading || acordos.length === 0) return;
    const atrasados = acordos.filter(a =>
      a.status === 'verificar_pendente' &&
      a.vencimento < hoje &&
      !atrasadosProcessadosRef.current.has(a.id),
    );
    if (atrasados.length === 0) return;
    // Marcar como processados ANTES do async para evitar re-entrada
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
            mensagem:   `O acordo NR ${a.nr_cliente} foi movido para "Não Pago" por atraso.`,
            empresa_id: empresa?.id,
          });
        }
        // Optimistic: atualiza localmente sem refetch
        patchAcordo(a.id, { status: 'nao_pago' });
      });
      // NÃO chama refetch() aqui — patchAcordo já atualizou os itens
    }).catch(e => console.warn('[Dashboard] erro ao mover atrasados:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Optimistic: atualiza o status visualmente antes da resposta do banco
    patchAcordo(id, { status: 'pago' });
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', id);
    if (error) {
      // Rollback: reverte o status se houve erro
      patchAcordo(id, { status: acordos.find(a => a.id === id)?.status ?? 'verificar_pendente' });
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Acordo marcado como Pago!');
    }
    setAtualizandoStatus(null);
  }

  function prepararFila(lista: Acordo[]) {
    const comWhats = lista.filter(a => a.whatsapp);
    const semWhats = lista.filter(a => !a.whatsapp);
    if (comWhats.length === 0) { toast.warning('Nenhum acordo selecionado possui WhatsApp cadastrado'); return; }
    if (semWhats.length > 0) toast.info(`${semWhats.length} acordo(s) sem WhatsApp serão ignorados`);
    const fila: ItemFila[] = comWhats.map(a => ({
      id:           a.id,
      nome_cliente: a.nome_cliente,
      nr_cliente:   a.nr_cliente,
      whatsapp:     a.whatsapp!,
      valor:        a.valor,
      vencimento:   a.vencimento,
      mensagem:     buildMensagem(a),
      link:         `https://wa.me/55${a.whatsapp!.replace(/\D/g, '')}?text=${encodeURIComponent(buildMensagem(a))}`,
      enviado:      false,
    }));
    setFilaWhatsApp(fila);
    setFilaAberta(true);
  }

  function enviarLembretesHoje() {
    const lista = acordosDeHoje.filter(a => a.vencimento === hoje);
    if (lista.length === 0) { toast.info('Nenhum acordo vence hoje'); return; }
    prepararFila(lista);
  }

  function enviarUmWhatsapp(a: Acordo) {
    if (!a.whatsapp) { toast.warning('WhatsApp não cadastrado'); return; }
    const mensagem = buildMensagem(a);
    window.open(`https://wa.me/55${a.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`, '_blank');
    if (perfil?.id) {
      supabase.from('logs_sistema').insert({
        usuario_id:  perfil.id,
        acao:        'envio_lembrete_whatsapp',
        tabela:      'acordos',
        registro_id: a.id,
        empresa_id:  empresa?.id ?? null,
        detalhes: { acordo_id: a.id, nome_cliente: a.nome_cliente, nr_cliente: a.nr_cliente, modo: 'individual' },
      }).then(({ error }) => { if (error) console.warn('[enviarUmWhatsapp] log error:', error.message); });
    }
  }

  async function excluirAcordo(a: Acordo) {
    setConfirmandoExclusao(null);
    setExcluindoId(a.id);

    // Tratar outro lado do vínculo ANTES do delete (se houver).
    try {
      await tratarExclusaoVinculo({
        acordo: a,
        isPaguePlay: isPP,
        operadorExecutorNome: perfil?.nome ?? perfil?.email ?? null,
      });
    } catch (e) {
      console.warn('[Dashboard.excluirAcordo] tratarExclusaoVinculo falhou:', e);
    }

    // Salvar na lixeira antes de excluir
    await enviarParaLixeira({
      acordo: a,
      motivo: 'exclusao_manual',
      operadorNome: perfil?.nome ?? perfil?.email ?? undefined,
    });
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) toast.error('Erro ao excluir acordo: ' + error.message);
    else {
      liberarNrPorAcordoId(a.id); // Liberar NR (best-effort)
      supabase.from('logs_sistema').insert({
        usuario_id:  perfil?.id ?? null,
        acao:        'exclusao_acordo',
        tabela:      'acordos',
        registro_id: a.id,
        empresa_id:  empresa?.id ?? null,
        detalhes: {
          nome_cliente: a.nome_cliente,
          nr_cliente:   a.nr_cliente,
          excluido_por: perfil?.nome ?? perfil?.email ?? null,
          excluido_em:  new Date().toISOString(),
        },
      }).then(({ error: logError }) => { if (logError) console.warn('[excluirAcordo] log error:', logError.message); });
      // Optimistic: remove o acordo da lista local imediatamente
      removeAcordo(a.id);
      toast.success(`Acordo #${a.nr_cliente} excluído!`);
    }
    setExcluindoId(null);
  }

  async function excluirSelecionados() {
    setConfirmandoExclusaoLote(false);
    let deletedCount = 0, failedCount = 0;
    for (const id of selecionados) {
      setExcluindoId(id);
      const acordo = acordos.find(a => a.id === id);
      // Tratar outro lado do vínculo ANTES do delete.
      if (acordo) {
        try {
          await tratarExclusaoVinculo({
            acordo,
            isPaguePlay: isPP,
            operadorExecutorNome: perfil?.nome ?? perfil?.email ?? null,
          });
        } catch (e) {
          console.warn('[Dashboard.excluirSelecionados] tratarExclusaoVinculo falhou:', e);
        }
      }
      // Salvar na lixeira antes de excluir
      if (acordo) {
        await enviarParaLixeira({
          acordo,
          motivo: 'exclusao_manual',
          operadorNome: perfil?.nome ?? perfil?.email ?? undefined,
        });
      }
      const { error } = await supabase.from('acordos').delete().eq('id', id);
      if (error) {
        failedCount++;
        console.error(`[excluirSelecionados] erro ao excluir ${id}:`, error.message);
      } else {
        deletedCount++;
        liberarNrPorAcordoId(id); // Liberar NR (best-effort)
        removeAcordo(id); // Optimistic: remove da lista local imediatamente
        if (acordo) {
          supabase.from('logs_sistema').insert({
            usuario_id:  perfil?.id ?? null,
            acao:        'exclusao_acordo',
            tabela:      'acordos',
            registro_id: id,
            empresa_id:  empresa?.id ?? null,
            detalhes: {
              nome_cliente: acordo.nome_cliente,
              nr_cliente:   acordo.nr_cliente,
              excluido_por: perfil?.nome ?? perfil?.email ?? null,
              excluido_em:  new Date().toISOString(),
              modo:         'lote',
            },
          }).then(({ error: logError }) => { if (logError) console.warn('[excluirSelecionados] log error:', logError.message); });
        }
      }
    }
    setExcluindoId(null);
    setSelecionados([]);
    if (deletedCount > 0) toast.success(`${deletedCount} acordo(s) excluído(s) com sucesso!`);
    if (failedCount > 0) toast.error(`${failedCount} acordo(s) não puderam ser excluídos`);
    // Realtime / refetch desnecessário — removeAcordo já foi chamado por item acima
  }


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
        <div className="flex gap-2 flex-wrap items-center">

          {/* ── Seletor de visão: Líder e Elite ──────────────────────────────── */}
          {(isLider || isElite) && equipesDoSetor.length > 0 && (
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-1.5">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Visualizar:</span>
              <div className="flex flex-wrap gap-1">

                {/* Botão: Todo o setor */}
                <button
                  onClick={() => setVisaoFiltro('setor')}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                    visaoFiltro === 'setor'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
                  )}
                  title="Ver dados e acordos de todo o setor"
                >
                  <Building2 className="w-3 h-3" />
                  Setor geral
                </button>

                {/* Botões: por equipe */}
                {equipesDoSetor.map(eq => (
                  <button
                    key={eq.id}
                    onClick={() => setVisaoFiltro(`equipe:${eq.id}` as VisaoFiltro)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      visaoFiltro === `equipe:${eq.id}`
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
                    )}
                    title={`Ver dados e acordos da equipe ${eq.nome}`}
                  >
                    <Layers className="w-3 h-3" />
                    {eq.nome}
                  </button>
                ))}

                {/* Botão: individual — apenas Elite */}
                {isElite && (
                  <button
                    onClick={() => setVisaoFiltro('individual')}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      visaoFiltro === 'individual'
                        ? 'bg-role-elite text-white border-role-elite'
                        : 'bg-background text-muted-foreground border-border hover:border-role-elite/40 hover:text-foreground',
                    )}
                    title="Ver apenas seus próprios acordos"
                  >
                    <Users className="w-3 h-3" />
                    Individual
                  </button>
                )}

              </div>
            </div>
          )}

          {/* Fallback: Líder/Elite sem equipes no setor — mostra indicador simples */}
          {(isLider || isElite) && equipesDoSetor.length === 0 && (
            <span className="text-xs text-muted-foreground bg-muted/40 border border-border px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Setor geral
            </span>
          )}

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

        </div>
      </div>

      {/* Painel analítico — filtro de setor para admin + Analytics */}
      <div className="mb-6 space-y-2">
        {isAdmin && setoresList.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Filtrar setor:</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSetorFiltro(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  !setorFiltro
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                )}
              >
                Todos
              </button>
              {setoresList.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSetorFiltro(setorFiltro === s.id ? null : s.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    setorFiltro === s.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  )}
                >
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
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SEÇÃO EXCLUSIVA PAGUEPLAY
          ════════════════════════════════════════════════════════════════════ */}
      {isPP && (
        <div className="space-y-6">

          {/* ── Tabela completa de Acordos ── */}
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
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setNovoInlineAbertoTabela(v => !v)}
                >
                  <Plus className="w-4 h-4" /> Novo Acordo
                </Button>
                <Button variant="outline" size="icon" className="w-8 h-8 relative" onClick={refetch}
                  title={realtimeStatus === 'connected' ? 'Realtime ativo' : realtimeStatus === 'connecting' ? 'Conectando...' : realtimeStatus === 'error' ? 'Erro no Realtime' : 'Sem Realtime'}
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                  {/* Indicador de status Realtime */}
                  <span className={cn(
                    'absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
                    realtimeStatus === 'connected'  && 'bg-green-500',
                    realtimeStatus === 'connecting' && 'bg-yellow-400 animate-pulse',
                    realtimeStatus === 'error'      && 'bg-red-500',
                    realtimeStatus === 'off'        && 'bg-muted-foreground/40',
                  )} />
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

            {/* Seletor de mês */}
            <div className="flex items-center gap-2 mb-4 px-1">
              <span className="text-xs text-muted-foreground font-medium shrink-0">Mês:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => {
                    const [y, m] = mesFiltro.split('-').map(Number);
                    const prev = new Date(y, m - 2, 1);
                    setMesFiltro(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                    setCurrentPage(1);
                  }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-sm font-semibold min-w-[110px] text-center">
                  {new Date(mesFiltro + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </span>
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => {
                    const [y, m] = mesFiltro.split('-').map(Number);
                    const next = new Date(y, m, 1);
                    setMesFiltro(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                    setCurrentPage(1);
                  }}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={() => {
                    const d = new Date();
                    setMesFiltro(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    setCurrentPage(1);
                  }}
                >
                  Mês atual
                </Button>
              </div>
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
                      {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Tipos</SelectItem>
                      {isPP
                        ? [
                            <SelectItem key="boleto" value="boleto">Boleto / PIX</SelectItem>,
                            <SelectItem key="cartao" value="cartao">Cartão de Crédito</SelectItem>,
                          ]
                        : Object.entries(tipoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                  {usuarioTemLogicaDiretoExtra && (
                    <Select
                      value={filtroVinculo}
                      onValueChange={(v) => { setFiltroVinculo(v as 'todos' | 'direto' | 'extra'); setCurrentPage(1); }}
                    >
                      <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Direto/Extra" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Direto e Extra</SelectItem>
                        <SelectItem value="direto">Apenas Direto</SelectItem>
                        <SelectItem value="extra">Apenas Extra</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
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
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">INSCRIÇÃO</th>
                          {/* ── ESTADO: dropdown de siglas ── */}
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                            <div className="flex flex-col gap-1">
                              <span>ESTADO</span>
                              <div className="relative" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setEstadoDropdown(v => !v)}
                                  className={cn(
                                    'w-full h-6 text-[10px] bg-muted/40 border border-border/50 rounded px-1.5 font-normal text-left flex items-center justify-between gap-1',
                                    colFiltroEstado ? 'border-primary/50 bg-primary/10 text-primary' : 'text-muted-foreground/70'
                                  )}
                                >
                                  <span>{colFiltroEstado || 'UF…'}</span>
                                  {colFiltroEstado && (
                                    <span
                                      className="text-[9px] text-muted-foreground hover:text-destructive cursor-pointer"
                                      onClick={e => { e.stopPropagation(); setColFiltroEstado(''); setEstadoDropdown(false); }}
                                    >✕</span>
                                  )}
                                </button>
                                {estadoDropdown && (
                                  <div className="absolute top-7 left-0 z-50 bg-background border border-border rounded-lg shadow-xl p-1.5 grid grid-cols-4 gap-0.5 min-w-[140px]">
                                    {(ESTADOS_BRASIL as readonly string[]).map(uf => (
                                      <button
                                        key={uf} type="button"
                                        onClick={() => { setColFiltroEstado(uf); setEstadoDropdown(false); }}
                                        className={cn(
                                          'text-[10px] font-mono px-1 py-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors',
                                          colFiltroEstado === uf && 'bg-primary/15 text-primary font-semibold'
                                        )}
                                      >
                                        {uf}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </th>
                          {/* ── VENCIMENTO: calendário de dia dentro do mês selecionado ── */}
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                            <div className="flex flex-col gap-1">
                              <span>VENCIMENTO</span>
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min={1} max={31}
                                  value={colFiltroDia}
                                  onChange={e => setColFiltroDia(e.target.value)}
                                  placeholder="dia"
                                  className={cn(
                                    'w-full h-6 text-[10px] bg-muted/40 border border-border/50 rounded px-1.5 font-mono font-normal text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring',
                                    colFiltroDia ? 'border-primary/50 bg-primary/10' : ''
                                  )}
                                />
                                {colFiltroDia && (
                                  <button
                                    type="button"
                                    onClick={() => setColFiltroDia('')}
                                    className="text-[9px] text-muted-foreground hover:text-destructive flex-shrink-0"
                                    title="Limpar filtro de dia"
                                  >✕</button>
                                )}
                              </div>
                            </div>
                          </th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">TIPO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">LINK</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
                          {visaoAmpla && (
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>
                          )}
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {novoInlineAbertoTabela && (
                          <AcordoNovoInline
                            isPaguePlay={isPP}
                            colSpan={visaoAmpla ? 11 : 10}
                            onSaved={(inserido) => {
                              setNovoInlineAbertoTabela(false);
                              addAcordo(inserido); // Optimistic: adiciona sem refetch
                            }}
                            onCancel={() => setNovoInlineAbertoTabela(false)}
                          />
                        )}
                        {acordos.length === 0 ? (
                          <tr>
                            <td colSpan={visaoAmpla ? 11 : 10} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Filter className="w-8 h-8 opacity-30" />
                                <p className="font-medium">Nenhum acordo encontrado</p>
                                <p className="text-xs">Ajuste os filtros ou cadastre um novo acordo</p>
                              </div>
                            </td>
                          </tr>
                        ) : acordosOrdenados.map((a, i) => {
                          const atrasado  = isAtrasado(a.vencimento, a.status);
                          const venceHoje = a.vencimento === hoje;
                          const sel       = selecionados.includes(a.id);
                          const isEditingThis = editandoInlineIdTabela === a.id;
                          const isDetailThis = detalheInlineIdTabela === a.id;
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
                                  venceHoje && a.status !== 'pago' && 'bg-warning/10 border-l-2 border-l-warning',
                                  sel && 'bg-primary/5 border-primary/20',
                                  isEditingThis && 'bg-primary/5',
                                  isDetailThis && 'bg-accent/50',
                                )}
                                onClick={(e) => {
                                  const t = e.target as HTMLElement;
                                  if (t.closest('button') || t.closest('a') || t.closest('input')) return;
                                  if (!isEditingThis) setDetalheInlineIdTabela(detalheInlineIdTabela === a.id ? null : a.id);
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
                                {/* Inscrição */}
                                <td className="px-3 py-2.5">
                                  <div>
                                    <p className="font-medium text-foreground text-[12px] leading-none hover:text-primary transition-colors">{a.instituicao || '—'}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <p className="font-medium text-foreground leading-none text-[10px] text-muted-foreground font-mono">{a.nome_cliente}</p>
                                      <VinculoTag acordo={a} />
                                    </div>
                                  </div>
                                </td>
                                {/* Estado */}
                                <td className="px-3 py-2.5">
                                  {extractEstado(a.observacoes) ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                      <MapPin className="w-2.5 h-2.5" />{extractEstado(a.observacoes)}
                                    </span>
                                  ) : '—'}
                                </td>
                                {/* Vencimento */}
                                <td className="px-3 py-2.5">
                                  <span className={cn('font-mono text-[11px]', atrasado && 'text-destructive font-semibold', venceHoje && a.status !== 'pago' && 'text-warning font-semibold')}>
                                    {formatDate(a.vencimento)}
                                  </span>
                                </td>
                                {/* Valor */}
                                <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                                  {formatCurrency(a.valor)}
                                </td>
                                {/* Estado — removido (já exibido acima) */}
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
                                      href={ensureAbsoluteUrl(extractLinkAcordo(a.observacoes)!)}
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
                                {/* Operador — apenas PaguePay admin/lider */}
                                {visaoAmpla && (
                                  <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[140px]">
                                    <OperadorCell acordo={a} operadoresMap={operadoresMap} />
                                  </td>
                                )}
                                {/* Ações */}
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
                                    {/* WhatsApp — oculto para PaguePay */}
                                    <Button
                                      variant="ghost" size="icon"
                                      className={cn(
                                        'w-6 h-6 hidden',
                                        a.whatsapp ? 'text-success hover:bg-success/10' : 'text-muted-foreground/30',
                                      )}
                                      title={a.whatsapp ? 'Enviar WhatsApp' : 'Sem WhatsApp'}
                                      onClick={() => enviarUmWhatsapp(a)}
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon"
                                      className={cn('w-6 h-6', isEditingThis && 'bg-primary/10 text-primary')}
                                      title={isEditingThis ? 'Fechar editor' : 'Editar'}
                                      onClick={() => setEditandoInlineIdTabela(isEditingThis ? null : a.id)}
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
                              {/* Inline edit row — seção Tabela */}
                              {isEditingThis && (
                                <AcordoEditInline
                                  key={`inline-${a.id}`}
                                  acordo={a}
                                  isPaguePlay={isPP}
                                  onSaved={(atualizado) => {
                                    setEditandoInlineIdTabela(null);
                                    patchAcordo(atualizado.id, atualizado); // Optimistic: atualiza sem refetch
                                  }}
                                  onCancel={() => setEditandoInlineIdTabela(null)}
                                />
                              )}
                              {/* Inline detail row — seção Tabela */}
                              {isDetailThis && !isEditingThis && (
                                <AcordoDetalheInline
                                  key={`detalhe-${a.id}`}
                                  acordo={a}
                                  isPaguePlay={isPP}
                                  colSpan={visaoAmpla ? 11 : 10}
                                  onClose={() => setDetalheInlineIdTabela(null)}
                                  onSaved={(atualizado) => patchAcordo(atualizado.id, atualizado)}
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
              usuarioId={perfil?.id}
              empresaId={empresa?.id}
              modo="lote"
              onClose={() => { setFilaAberta(false); setSelecionados([]); }}
            />
          )}

          {/* Modal confirmar exclusão individual */}
          {confirmandoExclusao && (
            <Dialog open onOpenChange={() => setConfirmandoExclusao(null)}>
              <DialogContent className="max-w-md" aria-describedby="dash-dlg-excl-desc">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <Trash2 className="w-5 h-5" /> Confirmar exclusão
                  </DialogTitle>
                  <DialogDescription id="dash-dlg-excl-desc" className="sr-only">Confirmar exclusão do acordo selecionado</DialogDescription>
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
              <DialogContent className="max-w-sm" aria-describedby="dash-dlg-excl-lote-desc">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <Trash2 className="w-4 h-4" /> Excluir {selecionados.length} acordos
                  </DialogTitle>
                  <DialogDescription id="dash-dlg-excl-lote-desc" className="sr-only">Confirmar exclusão em lote dos acordos selecionados</DialogDescription>
                </DialogHeader>
                <div className="py-2 space-y-2">
                  <p className="text-sm text-foreground">
                    Tem certeza que deseja excluir os <strong>{selecionados.length}</strong> acordos selecionados? Esta ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusaoLote(false)}>Cancelar</Button>
                  <Button variant="destructive" size="sm" className="gap-1.5" onClick={excluirSelecionados}>
                    <Trash2 className="w-3.5 h-3.5" /> Excluir Tudo
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Floating Action Bar (seleção múltipla) */}
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
                  {(perfil?.perfil === 'administrador' || perfil?.perfil === 'lider') && (
                    <Button
                      size="sm" variant="ghost"
                      className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-white/10 text-xs h-8 px-3"
                      onClick={() => setConfirmandoExclusaoLote(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Selecionados
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
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
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SEÇÃO BOOKPLAY — link para acordos (analítico via AnalyticsPanel acima)
          ════════════════════════════════════════════════════════════════════ */}
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
