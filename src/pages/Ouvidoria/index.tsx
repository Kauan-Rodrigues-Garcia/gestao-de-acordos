/**
 * Aba Ouvidoria — regra Cofen (06/11/2026; parte 2 em 09/11/2026).
 *
 * As reclamações que chegam pelo canal de ouvidoria do 0800. Toda manifestação
 * fica guardada como histórico; as marcadas «Acompanhar» entram na fila, com
 * status, retorno ao profissional e linha do tempo.
 *
 * Parte 2 (migration 20261109120000):
 *   - «Para você agora» (`CardAlertas`): retorno agendado pisca uma hora antes;
 *     encaminhamento esperando ciência; respostas recebidas.
 *   - quem registra é o responsável primário; «Encaminhar para» passa para
 *     alguém acima, que dá ciência e responde;
 *   - cores nas anuidades com legenda do setor;
 *   - aba «Tickets pendentes» com o texto padrão para colar no Mundial;
 *   - aba «Grupos» para juntar reclamações iguais.
 *   Sem essa migration no banco, a aba funciona como antes e avisa no topo.
 *
 * Só existe em setor de regra Cofen (hoje o Conecta Play) e nasce só para o
 * líder, que escolhe na própria aba quem do setor atende (`CardAtendentes`).
 * Quem pode o quê é do banco: a tela só pergunta.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, Download, Headset, Inbox, ListChecks, Loader2, Plus, Search,
  Trash2, X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePickerField } from '@/components/DatePickerField';
import { baixarArquivo } from '@/lib/baixarArquivo';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useOuvidoriaCofen } from '@/hooks/useOuvidoriaCofen';
import {
  listarEtiquetas, listarGrupos, listarLixeira, listarManifestacoes, listarPessoas,
} from '@/services/ouvidoriaCofen.service';
import { CampoLista } from './campos';
import { CardAlertas } from './CardAlertas';
import { CardAtendentes } from './CardAtendentes';
import { OuvidoriaCtx, type ContextoOuvidoria } from './contexto';
import { DetalheManifestacao } from './DetalheManifestacao';
import { FormManifestacao } from './FormManifestacao';
import { DetalheGrupo, PainelGrupos } from './Grupos';
import { LixeiraOuvidoria } from './LixeiraOuvidoria';
import { PainelRelatorio } from './PainelRelatorio';
import { PainelTickets } from './PainelTickets';
import {
  ASSUNTOS, CANAIS, DIAS_ALERTA, FILTROS_INICIAIS, STATUS, dataBr, estaAberta, filtrar,
  indicadores, ordenar, paraCsv, paraLinhas, pedeAcao, rotuloAssunto, rotuloConselho,
  type Etiqueta, type Filtros, type Grupo, type Manifestacao, type SetorOuvidoria, type Visao,
} from './ouvidoria';
import { COR_FAIXA_STATUS } from './estilo';
import { diasUteisEntre } from './diasUteis';
import { AnosColoridos, IconeCanal, SeloEncaminhamento, SeloRetorno, SeloStatus, SelosLinha } from './visual';

export default function PaginaOuvidoria() {
  const { setores, carregando, bancoSemAba } = useOuvidoriaCofen();
  const { perfil } = useAuth();
  const [params, setParams] = useSearchParams();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const setor: SetorOuvidoria | null = setores.find(s => s.setor_id === escolhido) ?? setores[0] ?? null;
  // A notificação abre a aba com ?m=<id da manifestação>.
  const abrir = params.get('m');

  return (
    <div className="p-3 sm:p-5">
      <div className="max-w-[1280px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Headset className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">Ouvidoria</h1>
            <p className="text-xs text-muted-foreground truncate">
              {setor ? `${setor.setor_nome} · regra Cofen · reclamações do 0800` : 'Reclamações do 0800 · regra Cofen'}
            </p>
          </div>
          {setores.length > 1 && (
            <CampoLista compacto rotulo="Setor" valor={setor?.setor_id ?? ''} aoMudar={setEscolhido}
                        opcoes={setores.map(s => ({ valor: s.setor_id, rotulo: s.setor_nome }))} />
          )}
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : bancoSemAba ? (
          <div className="rounded-xl border border-warning/50 bg-warning/10 p-6 space-y-2">
            <p className="font-medium">O banco ainda não tem esta aba.</p>
            <p className="text-sm text-muted-foreground">
              Falta aplicar a migration <code className="font-mono">20261106150000_ouvidoria_cofen.sql</code> no
              SQL Editor do Supabase. Depois dela, recarregue a página.
            </p>
          </div>
        ) : !setor ? (
          <div className="rounded-xl border bg-card p-8 text-center space-y-2">
            <p className="font-medium">A Ouvidoria é do setor de regra Cofen.</p>
            <p className="text-sm text-muted-foreground">
              Ela aparece para quem está num setor de regra Cofen (hoje o Conecta Play), com a aba ligada em
              Configurações › Permissões ou liberada pelo líder na própria aba.
            </p>
          </div>
        ) : (
          <Painel
            key={setor.setor_id}
            setor={setor}
            meuId={perfil?.id ?? null}
            abrirId={abrir}
            aoAbrirConsumido={() => setParams(p => { p.delete('m'); return p; }, { replace: true })}
          />
        )}
      </div>
    </div>
  );
}

function Indicador({
  icone: Icone, rotulo, valor, detalhe, tom, ativo, onClick, className,
}: {
  icone: LucideIcon; rotulo: string; valor: number; detalhe?: string;
  tom: 'info' | 'warning' | 'destructive' | 'success' | 'muted'; ativo?: boolean; onClick?: () => void; className?: string;
}) {
  const cores = {
    info: 'text-info bg-info/10',
    warning: 'text-warning bg-warning/15',
    destructive: 'text-destructive bg-destructive/10',
    success: 'text-success bg-success/10',
    muted: 'text-muted-foreground bg-muted',
  }[tom];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-xl border bg-card p-3.5 text-left transition-all',
        onClick && 'hover:border-primary/40 hover:shadow-sm',
        ativo && 'border-primary ring-1 ring-primary/30',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
        <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center', cores)}>
          <Icone className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums mt-1">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5">{detalhe}</p>}
    </button>
  );
}

const POR_PAGINA = 40;
/** A lista se relê sozinha enquanto a aba está aberta: alertas e encaminhamentos novos aparecem. */
const RELER_MS = 2 * 60_000;
const NENHUMA_ETIQUETA: Etiqueta[] = [];
const NENHUM_GRUPO: Grupo[] = [];

/** Exportado para o laboratório (`lab-ouvidoria.html`), que o monta com dados de exemplo. */
export function Painel({ setor, meuId, abrirId = null, aoAbrirConsumido }: {
  setor: SetorOuvidoria; meuId: string | null; abrirId?: string | null; aoAbrirConsumido?: () => void;
}) {
  const qc = useQueryClient();
  const hoje = getTodayISO();
  // Os selos da lista («hoje às 14:00») só mudam de minuto em minuto; o card de
  // alertas tem o relógio de segundo dele.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [atalho, setAtalho] = useState<'abertas' | 'sem_retorno' | 'alerta' | null>(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Manifestacao | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [grupoId, setGrupoId] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['ouvidoria-lista', setor.setor_id],
    queryFn: () => listarManifestacoes(setor.setor_id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: RELER_MS,
  });
  const pessoas = useQuery({
    queryKey: ['ouvidoria-pessoas', setor.setor_id],
    queryFn: () => listarPessoas(setor.setor_id),
    staleTime: 60_000,
  });
  const etiquetasQ = useQuery({
    queryKey: ['ouvidoria-etiquetas', setor.setor_id],
    queryFn: () => listarEtiquetas(setor.setor_id),
    staleTime: 5 * 60_000,
  });
  const gruposQ = useQuery({
    queryKey: ['ouvidoria-grupos', setor.setor_id],
    queryFn: () => listarGrupos(setor.setor_id),
    staleTime: 60_000,
    refetchInterval: RELER_MS,
  });
  // `null` = sem a migration 20261109180000 (lixeira e anexos).
  const lixeira = useQuery({
    queryKey: ['ouvidoria-lixeira', setor.setor_id],
    queryFn: () => listarLixeira(setor.setor_id),
    enabled: setor.pode_gerir,
    staleTime: 60_000,
  });
  const [lixeiraAberta, setLixeiraAberta] = useState(false);

  // `null` = a migration 20261109120000 ainda não está no banco.
  const v2 = etiquetasQ.data !== null && etiquetasQ.data !== undefined;
  const todas = useMemo(() => lista.data ?? [], [lista.data]);
  const etiquetas = etiquetasQ.data ?? NENHUMA_ETIQUETA;
  const grupos = gruposQ.data ?? NENHUM_GRUPO;
  const kpi = useMemo(() => indicadores(todas, hoje), [todas, hoje]);
  const contagem: Record<Visao, number | null> = useMemo(() => ({
    acompanhamento: todas.filter(m => m.acompanhar).length,
    historico: todas.filter(m => !m.acompanhar).length,
    todas: todas.length,
    tickets: todas.filter(m => m.ticket_status === 'pendente').length,
    grupos: grupos.filter(g => !g.encerrado_em).length,
    relatorio: null as number | null,
  }), [todas, grupos]);

  // Abrir pela notificação (?m=…) assim que a lista chegar.
  useEffect(() => {
    if (!abrirId || !lista.data) return;
    if (lista.data.some(m => m.id === abrirId)) setDetalheId(abrirId);
    aoAbrirConsumido?.();
  }, [abrirId, lista.data, aoAbrirConsumido]);

  const visiveis = useMemo(() => {
    let r = filtrar(todas, filtros, meuId);
    if (atalho === 'abertas') r = r.filter(m => m.acompanhar && estaAberta(m));
    if (atalho === 'sem_retorno') r = r.filter(m => m.acompanhar && !m.data_resposta);
    if (atalho === 'alerta') r = r.filter(m => m.acompanhar && estaAberta(m) && diasUteisEntre(m.data_manifestacao, hoje) >= DIAS_ALERTA);
    return ordenar(r, filtros.visao);
  }, [todas, filtros, meuId, atalho, hoje]);

  const detalhe = todas.find(m => m.id === detalheId) ?? null;
  const filtrando = atalho !== null || JSON.stringify({ ...filtros, visao: 'x' }) !== JSON.stringify({ ...FILTROS_INICIAIS, visao: 'x' });

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => { setFiltros(f => ({ ...f, [k]: v })); setLimite(POR_PAGINA); };
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ['ouvidoria-lista', setor.setor_id] });
    void qc.invalidateQueries({ queryKey: ['ouvidoria-andamentos'] });
    void qc.invalidateQueries({ queryKey: ['ouvidoria-grupos', setor.setor_id] });
    void qc.invalidateQueries({ queryKey: ['ouvidoria-etiquetas', setor.setor_id] });
    void qc.invalidateQueries({ queryKey: ['ouvidoria-lixeira', setor.setor_id] });
    void qc.invalidateQueries({ queryKey: ['ouvidoria-anexos'] });
  };
  const usarAtalho = (a: typeof atalho) => {
    setAtalho(atual => (atual === a ? null : a));
    if (a) setFiltros(f => ({ ...f, visao: 'acompanhamento' }));
    setLimite(POR_PAGINA);
  };

  const ctx: ContextoOuvidoria = {
    setor, meuId, todas, etiquetas, grupos, pessoas: pessoas.data ?? [], v2, recarregar,
    abrirManifestacao: id => { setGrupoId(null); setDetalheId(id); },
  };

  function exportar() {
    const csv = paraCsv(paraLinhas(visiveis, { etiquetas, grupos }));
    baixarArquivo('﻿' + csv, `ouvidoria-${setor.setor_nome.toLowerCase().replace(/\s+/g, '-')}-${hoje}.csv`,
      'text/csv;charset=utf-8');
  }

  const VISOES: { id: Visao; rotulo: string; so2?: boolean }[] = [
    { id: 'acompanhamento', rotulo: 'Em acompanhamento' },
    { id: 'tickets', rotulo: 'Tickets pendentes', so2: true },
    { id: 'grupos', rotulo: 'Grupos', so2: true },
    { id: 'historico', rotulo: 'Só histórico' },
    { id: 'relatorio', rotulo: 'Relatório' },
    { id: 'todas', rotulo: 'Todas' },
  ];
  const grupoPorId = new Map(grupos.map(g => [g.id, g]));
  const mostraLista = filtros.visao !== 'grupos' && filtros.visao !== 'relatorio';

  return (
    <OuvidoriaCtx.Provider value={ctx}>
      <div className="space-y-4">
        {!v2 && !etiquetasQ.isLoading && (
          <div className="rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
            <p className="font-medium">A parte 2 da Ouvidoria ainda não está no banco.</p>
            <p className="text-xs text-muted-foreground">
              Retorno agendado, encaminhamento com ciência, cores das anuidades, tickets e grupos aparecem depois da
              migration <code className="font-mono">20261109120000_ouvidoria_cofen_alertas_tickets_grupos.sql</code>.
            </p>
          </div>
        )}

        <CardAlertas />

        {/* Indicadores: cada um vira atalho de filtro. */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          <Indicador icone={Inbox} rotulo="Abertas" valor={kpi.abertas} tom="info"
                     detalhe={`de ${kpi.acompanhadas} acompanhadas`}
                     ativo={atalho === 'abertas'} onClick={() => usarAtalho('abertas')} />
          <Indicador icone={Clock3} rotulo="Sem retorno" valor={kpi.semRetorno} tom="warning"
                     detalhe="profissional ainda não respondido"
                     ativo={atalho === 'sem_retorno'} onClick={() => usarAtalho('sem_retorno')} />
          <Indicador icone={AlertTriangle} rotulo="Em alerta" valor={kpi.atrasadas} tom="destructive"
                     detalhe={`abertas há ${DIAS_ALERTA}+ dias úteis`}
                     ativo={atalho === 'alerta'} onClick={() => usarAtalho('alerta')} />
          <Indicador icone={CheckCircle2} rotulo="Concluídas no mês" valor={kpi.concluidasNoMes} tom="success"
                     detalhe="pela data do retorno" />
          <Indicador className="col-span-2 lg:col-span-1" icone={ListChecks} rotulo="Registradas" valor={kpi.total} tom="muted" detalhe="no total, com histórico" />
        </div>

        {setor.pode_gerir && (
          <CardAtendentes setorId={setor.setor_id} pessoas={pessoas.data ?? []} carregando={pessoas.isLoading} meuId={meuId} />
        )}

        <div className="rounded-xl border bg-card">
          {/* Abas da fila + ações */}
          <div className="flex flex-wrap items-center gap-2 border-b px-3 pt-2">
            <div className="flex gap-1 -mb-px overflow-x-auto max-w-full">
              {VISOES.filter(v => !v.so2 || v2).map(v => (
                <button key={v.id} type="button"
                        onClick={() => { set('visao', v.id); if (v.id !== 'acompanhamento') setAtalho(null); }}
                        className={cn(
                          'px-3 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap',
                          filtros.visao === v.id
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}>
                  {v.rotulo}
                  {contagem[v.id] !== null && <span className={cn(
                    'rounded-full px-1.5 text-[10px] tabular-nums',
                    v.id === 'tickets' && contagem.tickets > 0 ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 font-semibold'
                      : filtros.visao === v.id ? 'bg-primary/10 text-primary' : 'bg-muted',
                  )}>
                    {contagem[v.id]}
                  </span>}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 pb-2">
              {setor.pode_gerir && lixeira.data && (
                <Button variant="ghost" size="sm" onClick={() => setLixeiraAberta(true)}
                        className="text-muted-foreground" title="Manifestações excluídas">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Lixeira{lixeira.data.length ? ` (${lixeira.data.length})` : ''}
                </Button>
              )}
              {mostraLista && (
                <Button variant="outline" size="sm" onClick={exportar} disabled={!visiveis.length}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar
                </Button>
              )}
              <Button size="sm" onClick={() => { setEditando(null); setFormAberto(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova manifestação
              </Button>
            </div>
          </div>

          {filtros.visao === 'relatorio' ? (
            <PainelRelatorio />
          ) : filtros.visao === 'grupos' ? (
            <PainelGrupos aoAbrirGrupo={setGrupoId} />
          ) : filtros.visao === 'tickets' ? (
            <PainelTickets pendentes={visiveis} />
          ) : (
            <>
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b bg-muted/20">
                <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:w-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={filtros.busca} onChange={e => set('busca', e.target.value)}
                         placeholder="OUV, código do cliente, nome, anuidade ou nº do ticket" className="h-9 pl-8 rounded-lg" />
                </div>
                <CampoLista compacto rotulo="Status" valor={filtros.status}
                            aoMudar={v => set('status', v as Filtros['status'])}
                            opcoes={[
                              { valor: 'todos', rotulo: 'Todos os status' },
                              { valor: 'abertos', rotulo: 'Só os abertos' },
                              ...STATUS.map(s => ({
                                valor: s.valor, rotulo: s.rotulo,
                                marca: <span className={cn('h-2 w-2 rounded-full shrink-0', COR_FAIXA_STATUS[s.valor])} />,
                              })),
                            ]} />
                <CampoLista compacto rotulo="Assunto" valor={filtros.assunto}
                            aoMudar={v => set('assunto', v as Filtros['assunto'])}
                            opcoes={[{ valor: 'todos', rotulo: 'Todos os assuntos' }, ...ASSUNTOS.map(a => ({ valor: a.valor, rotulo: a.rotulo }))]} />
                <CampoLista compacto rotulo="Canal" valor={filtros.canal}
                            aoMudar={v => set('canal', v as Filtros['canal'])}
                            opcoes={[{ valor: 'todos', rotulo: 'Todos os canais' },
                              ...CANAIS.map(c => ({ valor: c.valor, rotulo: c.rotulo, marca: <IconeCanal canal={c.valor} /> }))]} />
                <CampoLista compacto rotulo="Retorno" valor={filtros.retorno}
                            aoMudar={v => set('retorno', v as Filtros['retorno'])}
                            opcoes={[
                              { valor: 'todos', rotulo: 'Com e sem retorno' },
                              { valor: 'sem', rotulo: 'Sem retorno' },
                              { valor: 'com', rotulo: 'Com retorno' },
                            ]} />
                <CampoLista compacto rotulo="Responsável" valor={filtros.responsavel}
                            aoMudar={v => set('responsavel', v)}
                            opcoes={[
                              { valor: 'todos', rotulo: 'Todos os responsáveis' },
                              { valor: 'meus', rotulo: 'Só as minhas' },
                              ...(pessoas.data ?? []).filter(p => p.tem_acesso).map(p => ({ valor: p.perfil_id, rotulo: p.nome })),
                            ]} />
                <div className="flex items-center gap-1.5">
                  <div className="w-[136px]">
                    <DatePickerField value={filtros.de} maxDate={filtros.ate || hoje} placeholder="De" size="md"
                                     onChange={v => set('de', v)} triggerClassName="h-9 rounded-lg font-sans text-sm" />
                  </div>
                  <span className="text-xs text-muted-foreground">até</span>
                  <div className="w-[136px]">
                    <DatePickerField value={filtros.ate} minDate={filtros.de || undefined} maxDate={hoje} placeholder="Até" size="md"
                                     onChange={v => set('ate', v)} triggerClassName="h-9 rounded-lg font-sans text-sm" />
                  </div>
                </div>
                {filtrando && (
                  <Button variant="ghost" size="sm" className="h-9"
                          onClick={() => { setFiltros(f => ({ ...FILTROS_INICIAIS, visao: f.visao })); setAtalho(null); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Limpar
                  </Button>
                )}
              </div>

              {/* A lista */}
              {lista.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando manifestações…
                </div>
              ) : lista.isError ? (
                <div className="p-6 text-sm text-destructive">{(lista.error as Error).message}</div>
              ) : visiveis.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm font-medium">
                    {todas.length === 0 ? 'Nenhuma manifestação registrada ainda.' : 'Nada com esses filtros.'}
                  </p>
                  {todas.length === 0 && (
                    <Button size="sm" variant="outline" onClick={() => { setEditando(null); setFormAberto(true); }}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Registrar a primeira
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="hidden md:grid grid-cols-[110px_minmax(0,2.2fr)_minmax(0,1.1fr)_190px_120px_minmax(0,1.2fr)] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                    <span>Código</span><span>Profissional</span><span>Assunto</span><span>Status</span><span>Retorno</span><span>Responsáveis</span>
                  </div>
                  <ul className="divide-y">
                    {visiveis.slice(0, limite).map(m => (
                      <LinhaManifestacao key={m.id} m={m} hoje={hoje} agora={agora}
                                         grupo={m.grupo_id ? grupoPorId.get(m.grupo_id) ?? null : null}
                                         etiquetas={etiquetas} onClick={() => setDetalheId(m.id)} />
                    ))}
                  </ul>
                  {visiveis.length > limite && (
                    <div className="p-3 text-center border-t">
                      <Button variant="ghost" size="sm" onClick={() => setLimite(l => l + POR_PAGINA)}>
                        Mostrar mais ({visiveis.length - limite})
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {formAberto && (
          <FormManifestacao
            aberto
            manifestacao={editando}
            aoFechar={() => setFormAberto(false)}
            aoSalvar={salva => { setFormAberto(false); recarregar(); setDetalheId(salva.id); }}
          />
        )}

        <DetalheManifestacao
          manifestacao={detalhe}
          aoFechar={() => setDetalheId(null)}
          aoEditar={m => { setEditando(m); setFormAberto(true); }}
          aoAbrirGrupo={id => { setDetalheId(null); setGrupoId(id); }}
        />

        <DetalheGrupo grupoId={grupoId} aoFechar={() => setGrupoId(null)} />

        {setor.pode_gerir && (
          <LixeiraOuvidoria aberta={lixeiraAberta} aoFechar={() => setLixeiraAberta(false)} itens={lixeira.data ?? []} />
        )}
      </div>
    </OuvidoriaCtx.Provider>
  );
}

function LinhaManifestacao({ m, hoje, agora, grupo, etiquetas, onClick }: {
  m: Manifestacao; hoje: string; agora: number; grupo: Grupo | null; etiquetas: readonly Etiqueta[]; onClick: () => void;
}) {
  const dias = m.acompanhar && estaAberta(m) ? diasUteisEntre(m.data_manifestacao, hoje) : null;
  const alerta = dias !== null && dias >= DIAS_ALERTA;
  const encaminhada = m.responsavel_id && m.responsavel_id !== m.criado_por;
  return (
    <li>
      <button type="button" onClick={onClick}
              className="relative w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors grid gap-2 md:gap-3 md:items-center md:grid-cols-[110px_minmax(0,2.2fr)_minmax(0,1.1fr)_190px_120px_minmax(0,1.2fr)]">
        {m.acompanhar && (
          <span className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-r', COR_FAIXA_STATUS[m.status])} />
        )}
        <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-0.5">
          <span className="font-mono text-xs font-semibold">{m.codigo}</span>
          <span className="text-[11px] text-muted-foreground">{dataBr(m.data_manifestacao)}</span>
          <span className="md:hidden ml-auto"><SeloStatus status={m.status} /></span>
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            <IconeCanal canal={m.canal} />
            <span className="truncate">{m.nome_profissional}</span>
          </p>
          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
            {m.anuidades.length > 0 && <AnosColoridos m={m} etiquetas={etiquetas} className="shrink-0" />}
            <span className="truncate">
              {[m.codigo_cliente ? `Cód. ${m.codigo_cliente}` : null,
                m.conselho_uf ? rotuloConselho(m.conselho_uf) : null,
                m.descricao].filter(Boolean).join(' · ')}
            </span>
          </p>
          <SelosLinha m={m} grupo={grupo} agoraMs={agora} />
        </div>
        <div className="min-w-0 hidden md:block">
          <span className="text-xs rounded-md bg-muted px-2 py-0.5 truncate inline-block max-w-full">{rotuloAssunto(m.assunto)}</span>
        </div>
        <div className="hidden md:flex flex-col items-start gap-0.5">
          {m.acompanhar ? <SeloStatus status={m.status} /> : (
            <span className="text-[11px] text-muted-foreground">Histórico</span>
          )}
          {alerta && (
            <span className="text-[10px] font-medium text-destructive inline-flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> há {dias} dias úteis
            </span>
          )}
        </div>
        <div className="flex md:block items-center gap-3">
          {m.acompanhar || m.data_resposta ? <SeloRetorno data={m.data_resposta} /> : <span className="text-[11px] text-muted-foreground">—</span>}
          <span className="md:hidden text-[11px] text-muted-foreground truncate">
            {m.criado_por_nome ?? '—'}{encaminhada ? ` → ${m.responsavel_nome}` : ''}
          </span>
        </div>
        <div className="hidden md:flex flex-col items-start gap-0.5 min-w-0">
          <span className="text-xs truncate max-w-full inline-flex items-center gap-1">
            <span className="truncate">{m.criado_por_nome ?? '—'}</span>
            {encaminhada && (
              <>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate font-medium">{m.responsavel_nome}</span>
              </>
            )}
          </span>
          <SeloEncaminhamento m={m} />
        </div>
        {pedeAcao(m) && !estaAberta(m) && (
          <span className="sr-only">Concluída sem retorno ao profissional</span>
        )}
      </button>
    </li>
  );
}
