/**
 * Aba Ouvidoria — regra Cofen (06/11/2026).
 *
 * As reclamações que chegam pelo canal de ouvidoria do 0800. Toda manifestação
 * fica guardada como histórico; as marcadas «Acompanhar» entram na fila, com
 * status, retorno ao profissional e linha do tempo.
 *
 * Só existe em setor de regra Cofen (hoje o Conecta Play) e nasce só para o
 * líder, que escolhe na própria aba quem do setor atende (`CardAtendentes`).
 * Quem pode o quê é do banco (migration 20261106150000): a tela só pergunta.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Clock3, Download, Headset, Inbox, ListChecks, Loader2, Plus, Search,
  X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { baixarArquivo } from '@/lib/baixarArquivo';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useOuvidoriaCofen } from '@/hooks/useOuvidoriaCofen';
import { listarManifestacoes, listarPessoas } from '@/services/ouvidoriaCofen.service';
import { CardAtendentes } from './CardAtendentes';
import { DetalheManifestacao } from './DetalheManifestacao';
import { FormManifestacao } from './FormManifestacao';
import {
  ASSUNTOS, CANAIS, DIAS_ALERTA, FILTROS_INICIAIS, STATUS, dataBr, diasEntre, estaAberta, filtrar,
  indicadores, ordenar, paraCsv, paraLinhas, pedeAcao, rotuloAssunto, rotuloConselho,
  type Filtros, type Manifestacao, type SetorOuvidoria, type Visao,
} from './ouvidoria';
import { CLASSE_SELECT, COR_FAIXA_STATUS } from './estilo';
import { IconeCanal, SeloRetorno, SeloStatus } from './visual';

export default function PaginaOuvidoria() {
  const { setores, carregando, bancoSemAba } = useOuvidoriaCofen();
  const { perfil } = useAuth();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const setor: SetorOuvidoria | null = setores.find(s => s.setor_id === escolhido) ?? setores[0] ?? null;

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
            <select className={CLASSE_SELECT} value={setor?.setor_id ?? ''} aria-label="Setor"
                    onChange={e => setEscolhido(e.target.value)}>
              {setores.map(s => <option key={s.setor_id} value={s.setor_id}>{s.setor_nome}</option>)}
            </select>
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
          <Painel key={setor.setor_id} setor={setor} meuId={perfil?.id ?? null} />
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

/** Exportado para o laboratório (`lab-ouvidoria.html`), que o monta com dados de exemplo. */
export function Painel({ setor, meuId }: { setor: SetorOuvidoria; meuId: string | null }) {
  const qc = useQueryClient();
  const hoje = getTodayISO();

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [atalho, setAtalho] = useState<'abertas' | 'sem_retorno' | 'alerta' | null>(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Manifestacao | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ['ouvidoria-lista', setor.setor_id],
    queryFn: () => listarManifestacoes(setor.setor_id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const pessoas = useQuery({
    queryKey: ['ouvidoria-pessoas', setor.setor_id],
    queryFn: () => listarPessoas(setor.setor_id),
    staleTime: 60_000,
  });

  const todas = useMemo(() => lista.data ?? [], [lista.data]);
  const kpi = useMemo(() => indicadores(todas, hoje), [todas, hoje]);
  const contagem = useMemo(() => ({
    acompanhamento: todas.filter(m => m.acompanhar).length,
    historico: todas.filter(m => !m.acompanhar).length,
    todas: todas.length,
  }), [todas]);

  const visiveis = useMemo(() => {
    let r = filtrar(todas, filtros, meuId);
    if (atalho === 'abertas') r = r.filter(m => m.acompanhar && estaAberta(m));
    if (atalho === 'sem_retorno') r = r.filter(m => m.acompanhar && !m.data_resposta);
    if (atalho === 'alerta') r = r.filter(m => m.acompanhar && estaAberta(m) && diasEntre(m.data_manifestacao, hoje) >= DIAS_ALERTA);
    return ordenar(r, filtros.visao);
  }, [todas, filtros, meuId, atalho, hoje]);

  const detalhe = todas.find(m => m.id === detalheId) ?? null;
  const filtrando = atalho !== null || JSON.stringify({ ...filtros, visao: 'x' }) !== JSON.stringify({ ...FILTROS_INICIAIS, visao: 'x' });

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => { setFiltros(f => ({ ...f, [k]: v })); setLimite(POR_PAGINA); };
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ['ouvidoria-lista', setor.setor_id] });
    void qc.invalidateQueries({ queryKey: ['ouvidoria-andamentos'] });
  };
  const usarAtalho = (a: typeof atalho) => {
    setAtalho(atual => (atual === a ? null : a));
    if (a) setFiltros(f => ({ ...f, visao: 'acompanhamento' }));
    setLimite(POR_PAGINA);
  };

  function exportar() {
    const csv = paraCsv(paraLinhas(visiveis));
    baixarArquivo('﻿' + csv, `ouvidoria-${setor.setor_nome.toLowerCase().replace(/\s+/g, '-')}-${hoje}.csv`,
      'text/csv;charset=utf-8');
  }

  const VISOES: { id: Visao; rotulo: string }[] = [
    { id: 'acompanhamento', rotulo: 'Em acompanhamento' },
    { id: 'historico', rotulo: 'Só histórico' },
    { id: 'todas', rotulo: 'Todas' },
  ];

  return (
    <div className="space-y-4">
      {/* Indicadores: cada um vira atalho de filtro. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <Indicador icone={Inbox} rotulo="Abertas" valor={kpi.abertas} tom="info"
                   detalhe={`de ${kpi.acompanhadas} acompanhadas`}
                   ativo={atalho === 'abertas'} onClick={() => usarAtalho('abertas')} />
        <Indicador icone={Clock3} rotulo="Sem retorno" valor={kpi.semRetorno} tom="warning"
                   detalhe="profissional ainda não respondido"
                   ativo={atalho === 'sem_retorno'} onClick={() => usarAtalho('sem_retorno')} />
        <Indicador icone={AlertTriangle} rotulo="Em alerta" valor={kpi.atrasadas} tom="destructive"
                   detalhe={`abertas há ${DIAS_ALERTA}+ dias`}
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
            {VISOES.map(v => (
              <button key={v.id} type="button"
                      onClick={() => { set('visao', v.id); if (v.id !== 'acompanhamento') setAtalho(null); }}
                      className={cn(
                        'px-3 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap',
                        filtros.visao === v.id
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}>
                {v.rotulo}
                <span className={cn(
                  'rounded-full px-1.5 text-[10px] tabular-nums',
                  filtros.visao === v.id ? 'bg-primary/10 text-primary' : 'bg-muted',
                )}>
                  {contagem[v.id]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 pb-2">
            <Button variant="outline" size="sm" onClick={exportar} disabled={!visiveis.length}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar
            </Button>
            <Button size="sm" onClick={() => { setEditando(null); setFormAberto(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova manifestação
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 px-3 py-2.5 border-b bg-muted/20">
          <div className="relative col-span-2 sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={filtros.busca} onChange={e => set('busca', e.target.value)}
                   placeholder="OUV, código do cliente, nome ou anuidade" className="h-9 pl-8" />
          </div>
          <select className={cn(CLASSE_SELECT, 'min-w-0')} value={filtros.status} aria-label="Status"
                  onChange={e => set('status', e.target.value as Filtros['status'])}>
            <option value="todos">Todos os status</option>
            <option value="abertos">Só os abertos</option>
            {STATUS.map(s => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>
          <select className={cn(CLASSE_SELECT, 'min-w-0')} value={filtros.assunto} aria-label="Assunto"
                  onChange={e => set('assunto', e.target.value as Filtros['assunto'])}>
            <option value="todos">Todos os assuntos</option>
            {ASSUNTOS.map(a => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
          </select>
          <select className={cn(CLASSE_SELECT, 'min-w-0')} value={filtros.canal} aria-label="Canal"
                  onChange={e => set('canal', e.target.value as Filtros['canal'])}>
            <option value="todos">Todos os canais</option>
            {CANAIS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
          <select className={cn(CLASSE_SELECT, 'min-w-0')} value={filtros.retorno} aria-label="Retorno"
                  onChange={e => set('retorno', e.target.value as Filtros['retorno'])}>
            <option value="todos">Com e sem retorno</option>
            <option value="sem">Sem retorno</option>
            <option value="com">Com retorno</option>
          </select>
          <select className={cn(CLASSE_SELECT, 'min-w-0')} value={filtros.responsavel} aria-label="Responsável"
                  onChange={e => set('responsavel', e.target.value)}>
            <option value="todos">Todos os responsáveis</option>
            <option value="meus">Só as minhas</option>
            {(pessoas.data ?? []).filter(p => p.tem_acesso).map(p => (
              <option key={p.perfil_id} value={p.perfil_id}>{p.nome}</option>
            ))}
          </select>
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
            <div className="hidden md:grid grid-cols-[110px_minmax(0,2.2fr)_minmax(0,1.2fr)_190px_120px_minmax(0,1fr)] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
              <span>Código</span><span>Profissional</span><span>Assunto</span><span>Status</span><span>Retorno</span><span>Responsável</span>
            </div>
            <ul className="divide-y">
              {visiveis.slice(0, limite).map(m => (
                <LinhaManifestacao key={m.id} m={m} hoje={hoje} onClick={() => setDetalheId(m.id)} />
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
      </div>

      {formAberto && (
        <FormManifestacao
          aberto
          setorId={setor.setor_id}
          manifestacao={editando}
          atendentes={pessoas.data ?? []}
          aoFechar={() => setFormAberto(false)}
          aoSalvar={salva => { setFormAberto(false); recarregar(); setDetalheId(salva.id); }}
        />
      )}

      <DetalheManifestacao
        manifestacao={detalhe}
        podeGerir={setor.pode_gerir}
        aoFechar={() => setDetalheId(null)}
        aoEditar={m => { setEditando(m); setFormAberto(true); }}
        aoMudar={recarregar}
      />
    </div>
  );
}

function LinhaManifestacao({ m, hoje, onClick }: { m: Manifestacao; hoje: string; onClick: () => void }) {
  const dias = estaAberta(m) ? diasEntre(m.data_manifestacao, hoje) : null;
  const alerta = m.acompanhar && dias !== null && dias >= DIAS_ALERTA;
  return (
    <li>
      <button type="button" onClick={onClick}
              className="relative w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors grid gap-2 md:gap-3 md:items-center md:grid-cols-[110px_minmax(0,2.2fr)_minmax(0,1.2fr)_190px_120px_minmax(0,1fr)]">
        {m.acompanhar && (
          <span className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-r', COR_FAIXA_STATUS[m.status])} />
        )}
        <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-0.5">
          <span className="font-mono text-xs font-semibold">{m.codigo}</span>
          <span className="text-[11px] text-muted-foreground">{dataBr(m.data_manifestacao)}</span>
          <span className="md:hidden ml-auto"><SeloStatus status={m.status} /></span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            <IconeCanal canal={m.canal} />
            <span className="truncate">{m.nome_profissional}</span>
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {[m.codigo_cliente ? `Cód. ${m.codigo_cliente}` : null,
              m.conselho_uf ? rotuloConselho(m.conselho_uf) : null,
              m.anuidades.length ? `Anuidade ${m.anuidades.join(', ')}` : null,
              m.descricao].filter(Boolean).join(' · ')}
          </p>
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
              <AlertTriangle className="h-2.5 w-2.5" /> há {dias} dias
            </span>
          )}
        </div>
        <div className="flex md:block items-center gap-3">
          {m.acompanhar || m.data_resposta ? <SeloRetorno data={m.data_resposta} /> : <span className="text-[11px] text-muted-foreground">—</span>}
          <span className="md:hidden text-[11px] text-muted-foreground truncate">{m.responsavel_nome ?? 'Sem responsável'}</span>
        </div>
        <div className="hidden md:block min-w-0">
          <span className={cn('text-xs truncate block', !m.responsavel_nome && 'text-muted-foreground')}>
            {m.responsavel_nome ?? 'Sem responsável'}
          </span>
        </div>
        {pedeAcao(m) && !estaAberta(m) && (
          <span className="sr-only">Concluída sem retorno ao profissional</span>
        )}
      </button>
    </li>
  );
}
