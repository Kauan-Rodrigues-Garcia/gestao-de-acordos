/**
 * AnaliticoLider — visão líder/gerência/admin
 *
 * Lazy loading: resumos via RPC na abertura; linhas individuais só ao expandir.
 * Agrupamento por equipe em "Por operador".
 * Ranking com pódio (top 3 + faixas 4-10 + demais).
 * Filtro de equipe em Ranking e Destaques do dia.
 * Filtro de data por operador expandido.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, Users, Trophy, AlertCircle, ChevronDown, ChevronRight,
  Trash2, Loader2, Star, CalendarDays, X, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  buscarResumoOperadoresAnalitico,
  buscarAnalitico,
  buscarDestaquesDoMes,
  buscarEquipesComOperadores,
  removerLinhaAnalitico,
  removerOrfaosDoMes,
  type ResumoOperadorAnalitico,
  type DestaqueDiaAnalitico,
  type EquipeAnalitico,
  type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import { toast } from 'sonner';
import { TabulacaoCell } from './TabulacaoCell';
import { ImportarModal } from './ImportarModal';
import { useAnaliticoImport } from '@/hooks/useAnaliticoImport';

const ORFAOS_PAGE = 100;
const DIAS_PT    = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface AnaliticoLiderProps {
  empresaId: string;
  mes: string;
  temPermissaoImportar: boolean;
  operadorId: string;
  operadorNome: string;
  liderId?: string | null;
  onAbrirNovoAcordo: (dados: {
    instituicao: string; nomeCliente: string;
    forma: 'boleto_pix' | 'cartao'; valor: number;
  }) => void;
  onVerAcordo: (acordoId: string) => void;
  onRefetch: () => void;
}

interface FiltroData { inicio: string; fim: string }

export function AnaliticoLider({
  empresaId, mes, temPermissaoImportar,
  operadorId, operadorNome, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoLiderProps) {
  const importHook = useAnaliticoImport();

  const [modalImportar,  setModalImportar]  = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'operadores' | 'ranking' | 'destaques' | 'orfaos'>('operadores');

  // ── Resumos ───────────────────────────────────────────────────────────────
  const [resumos,        setResumos]        = useState<ResumoOperadorAnalitico[]>([]);
  const [loadingResumos, setLoadingResumos] = useState(true);

  // ── Linhas expandidas (lazy) ──────────────────────────────────────────────
  const [expandidos,    setExpandidos]    = useState<Set<string>>(new Set());
  const [linhasMap,     setLinhasMap]     = useState<Map<string, AnaliticoRecebimento[]>>(new Map());
  const [loadingLinhas, setLoadingLinhas] = useState<Set<string>>(new Set());
  // Filtro de data por operador expandido
  const [filtrosDatas,  setFiltrosDatas]  = useState<Map<string, FiltroData>>(new Map());

  // ── Órfãos ────────────────────────────────────────────────────────────────
  const [orfaos,         setOrfaos]         = useState<AnaliticoRecebimento[]>([]);
  const [loadingOrfaos,  setLoadingOrfaos]  = useState(false);
  const [orfaosVisiveis, setOrfaosVisiveis] = useState(ORFAOS_PAGE);
  const [removendoId,    setRemovendoId]    = useState<string | null>(null);
  const [removendoTodos, setRemovendoTodos] = useState(false);

  // ── Destaques ─────────────────────────────────────────────────────────────
  const [destaques,        setDestaques]        = useState<DestaqueDiaAnalitico[]>([]);
  const [loadingDestaques, setLoadingDestaques] = useState(false);

  // ── Equipes ───────────────────────────────────────────────────────────────
  const [equipes,            setEquipes]            = useState<EquipeAnalitico[]>([]);
  const [operadorEquipeMap,  setOperadorEquipeMap]  = useState<Record<string, OperadorEquipeInfo>>({});
  const [filtroEquipeId,     setFiltroEquipeId]     = useState<string | null>(null);

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

  const carregarOrfaos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingOrfaos(true);
    setOrfaosVisiveis(ORFAOS_PAGE);
    const { data } = await buscarAnalitico({ empresaId, mes, operadorId: null });
    setOrfaos(data);
    setLoadingOrfaos(false);
  }, [empresaId, mes]);

  const carregarDestaques = useCallback(async (equipeId?: string | null) => {
    if (!empresaId || !mes) return;
    setLoadingDestaques(true);
    const { data, error } = await buscarDestaquesDoMes(empresaId, mes, equipeId);
    if (error) toast.error(`Erro ao carregar destaques: ${error}`);
    setDestaques(data);
    setLoadingDestaques(false);
  }, [empresaId, mes]);

  useEffect(() => { void carregarResumos(); }, [carregarResumos]);

  useEffect(() => {
    if (abaAtiva === 'orfaos')    void carregarOrfaos();
    if (abaAtiva === 'destaques') void carregarDestaques(filtroEquipeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva]);

  // Carrega equipes uma vez por empresa
  useEffect(() => {
    buscarEquipesComOperadores(empresaId).then(({ equipes: eq, operadorEquipeMap: oem }) => {
      setEquipes(eq);
      setOperadorEquipeMap(oem);
    });
  }, [empresaId]);

  // ── Filtro de equipe ──────────────────────────────────────────────────────
  function mudarFiltroEquipe(equipeId: string | null) {
    setFiltroEquipeId(equipeId);
    if (abaAtiva === 'destaques') void carregarDestaques(equipeId);
  }

  // ── Toggle card de operador ───────────────────────────────────────────────
  async function toggleExpandido(opId: string) {
    const jáAberto = expandidos.has(opId);
    setExpandidos(prev => {
      const next = new Set(prev);
      jáAberto ? next.delete(opId) : next.add(opId);
      return next;
    });
    if (!jáAberto && !linhasMap.has(opId)) {
      setLoadingLinhas(prev => new Set(prev).add(opId));
      const { data } = await buscarAnalitico({ empresaId, mes, operadorId: opId });
      setLinhasMap(prev => new Map(prev).set(opId, data));
      setLoadingLinhas(prev => { const s = new Set(prev); s.delete(opId); return s; });
    }
  }

  // Filtra linhas por data (client-side)
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
      const next = new Map(prev);
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

  function handlePosImport() {
    setModalImportar(false);
    if (importHook.estado === 'done') {
      void carregarResumos();
      void carregarOrfaos();
      void carregarDestaques(filtroEquipeId);
      onRefetch();
    }
  }

  // ── Agrupamento por equipe (Por operador) ──────────────────────────────────
  const resumosPorEquipe = useMemo(() => {
    const groups = new Map<string, { equipeId: string | null; equipeNome: string; resumos: ResumoOperadorAnalitico[] }>();
    for (const r of resumos) {
      const info = operadorEquipeMap[r.operador_id];
      const key  = info?.equipe_id ?? '__sem__';
      const nome = info?.equipe_nome ?? 'Sem equipe';
      if (!groups.has(key)) groups.set(key, { equipeId: info?.equipe_id ?? null, equipeNome: nome, resumos: [] });
      groups.get(key)!.resumos.push(r);
    }
    return Array.from(groups.values()).filter(g => g.resumos.length > 0);
  }, [resumos, operadorEquipeMap]);

  // ── Ranking filtrado ───────────────────────────────────────────────────────
  const resumosFiltrados = useMemo(() => {
    if (!filtroEquipeId) return resumos;
    return resumos.filter(r => operadorEquipeMap[r.operador_id]?.equipe_id === filtroEquipeId);
  }, [resumos, operadorEquipeMap, filtroEquipeId]);

  // ── Helpers destaques ──────────────────────────────────────────────────────
  const [mesAnoStr, mesNumStr] = mes.split('-');
  const diasNoMes  = new Date(Number(mesAnoStr), Number(mesNumStr), 0).getDate();
  const hojeISO    = new Date().toISOString().split('T')[0];
  const destaquesMap = useMemo(() => new Map(destaques.map(d => [d.dia, d])), [destaques]);

  // ── Componente de filtro de equipe (reutilizável) ──────────────────────────
  const seletorEquipe = equipes.length > 0 && (
    <div className="flex items-center gap-2">
      <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <select
        value={filtroEquipeId ?? ''}
        onChange={e => mudarFiltroEquipe(e.target.value || null)}
        className="h-7 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Todas as equipes</option>
        {equipes.map(eq => (
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
      {/* Tabs + botão importar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'operadores', label: 'Por operador',    Icon: Users },
            { key: 'ranking',    label: 'Ranking',         Icon: Trophy },
            { key: 'destaques',  label: 'Destaques do dia', Icon: Star },
            { key: 'orfaos',     label: 'Sem operador',    Icon: AlertCircle },
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
          <Button size="sm" className="gap-1.5" onClick={() => setModalImportar(true)}>
            <Upload className="w-4 h-4" /> Importar relatório
          </Button>
        )}
      </div>

      {/* ── Aba: Por operador (agrupado por equipe) ───────────────────────── */}
      {abaAtiva === 'operadores' && (
        <div className="space-y-5">
          {loadingResumos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
          )}
          {!loadingResumos && resumos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para este mês.</p>
            </div>
          )}
          {!loadingResumos && resumosPorEquipe.map(grupo => (
            <div key={grupo.equipeId ?? '__sem__'} className="space-y-2">
              {/* Cabeçalho de equipe */}
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
                  {grupo.equipeNome}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {grupo.resumos.map(r => {
                const aberto     = expandidos.has(r.operador_id);
                const carregando = loadingLinhas.has(r.operador_id);
                const linhas     = getLinhasOp(r.operador_id);
                const todasLinhas = linhasMap.get(r.operador_id) ?? [];
                const filtro     = filtrosDatas.get(r.operador_id);
                const temFiltro  = !!(filtro?.inicio || filtro?.fim);

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
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          }
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
                          <div>
                            <p className="text-sm font-semibold">{formatBRL(r.total_ho)}</p>
                            <p className="text-xs text-muted-foreground">HO</p>
                          </div>
                          <Badge variant="outline" className="shrink-0">{r.total_pagamentos} pgto.</Badge>
                        </div>
                      </div>
                    </CardHeader>

                    {aberto && (
                      <CardContent className="p-0 border-t">
                        {carregando ? (
                          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando pagamentos…
                          </div>
                        ) : (
                          <>
                            {/* Filtro de data do operador */}
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
                                  <Button size="sm" variant="ghost" className="h-6 px-1.5 gap-1 text-xs text-muted-foreground"
                                    onClick={() => limparFiltroData(r.operador_id)}>
                                    <X className="w-3 h-3" /> Limpar
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    {linhas.length}/{todasLinhas.length} registros
                                  </span>
                                </>
                              )}
                            </div>

                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/30">
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">HO</th>
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">AÇÃO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {linhas.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">
                                      Nenhum registro no período selecionado.
                                    </td>
                                  </tr>
                                ) : linhas.map(linha => (
                                  <tr key={linha.id} className="hover:bg-muted/20">
                                    <td className="px-3 py-2">
                                      <span className="font-semibold">{linha.codigo}</span>
                                      {linha.nome_cliente && (
                                        <span className="block text-muted-foreground truncate max-w-[120px]">{linha.nome_cliente}</span>
                                      )}
                                    </td>
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
                                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>
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
                                  </tr>
                                ))}
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

      {/* ── Aba: Ranking (pódio top 3 + faixas) ──────────────────────────── */}
      {abaAtiva === 'ranking' && (
        <div className="space-y-4">
          {equipes.length > 0 && (
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
            <RankingView resumos={resumosFiltrados} />
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
            {equipes.length > 0 && seletorEquipe}
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
                    !isHoje && !isFut && dest  && 'border-border bg-card',
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
                  {removendoTodos ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
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

      <ImportarModal aberto={modalImportar} onFechar={handlePosImport} hook={importHook} />
    </div>
  );
}

// ── Sub-componente: Ranking com pódio ─────────────────────────────────────────

interface RankingViewProps { resumos: ResumoOperadorAnalitico[] }

function RankingView({ resumos }: RankingViewProps) {
  const max    = resumos[0]?.total_recebido || 1;
  const top3   = resumos.slice(0, 3);
  const meio   = resumos.slice(3, 10);
  const resto  = resumos.slice(10);

  const PODIO_STYLE = [
    { border: 'border-yellow-400/60', bg: 'bg-yellow-50/60 dark:bg-yellow-950/20', medal: '🥇', text: 'text-yellow-700 dark:text-yellow-400' },
    { border: 'border-slate-400/60',  bg: 'bg-slate-50/60 dark:bg-slate-900/20',   medal: '🥈', text: 'text-slate-600 dark:text-slate-400' },
    { border: 'border-amber-700/40',  bg: 'bg-orange-50/40 dark:bg-orange-950/10', medal: '🥉', text: 'text-amber-700 dark:text-amber-500' },
  ];

  return (
    <div className="space-y-4">
      {/* Pódio — top 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top3.map((r, i) => {
          const acima = i > 0 ? resumos[i - 1] : null;
          const gap   = acima ? acima.total_recebido - r.total_recebido : 0;
          const prox  = acima && acima.total_recebido > 0
            ? Math.min(100, Math.round((r.total_recebido / acima.total_recebido) * 100))
            : 100;
          const s = PODIO_STYLE[i];

          return (
            <Card key={r.operador_id} className={cn('border-2', s.border, s.bg)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{s.medal}</span>
                  <Badge variant="outline" className={cn('text-xs font-bold', s.text)}>
                    {i + 1}º lugar
                  </Badge>
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight">{r.operador_nome ?? r.operador_usuario}</p>
                  <p className="text-xs text-muted-foreground font-mono">{r.operador_usuario}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-primary font-mono">{formatBRL(r.total_recebido)}</p>
                  <p className="text-xs text-muted-foreground">{r.total_pagamentos} pagamentos</p>
                </div>
                {i === 0 ? (
                  <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">★ Líder do ranking</p>
                ) : gap > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Faltam <strong>{formatBRL(gap)}</strong> p/ ultrapassar
                    </p>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${prox}%` }} />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 4º ao 10º */}
      {meio.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">4º ao 10º lugar</p>
          <Card className="border-border">
            <CardContent className="p-0">
              {meio.map((r, i) => {
                const pos   = i + 4;
                const w     = Math.max(4, Math.round((r.total_recebido / max) * 100));
                const acima = resumos[pos - 2];
                const gap   = acima ? acima.total_recebido - r.total_recebido : 0;
                return (
                  <div key={r.operador_id} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors',
                    i > 0 && 'border-t border-border',
                  )}>
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right shrink-0">{pos}º</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.operador_nome ?? r.operador_usuario}</span>
                        {gap > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            faltam {formatBRL(gap)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-primary/40" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-primary">{formatBRL(r.total_recebido)}</p>
                      <p className="text-xs text-muted-foreground">{r.total_pagamentos} pgtos.</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* Demais (11+) */}
      {resto.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Demais operadores</p>
          <Card className="border-border">
            <CardContent className="p-0">
              {resto.map((r, i) => (
                <div key={r.operador_id} className={cn(
                  'flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors text-xs',
                  i > 0 && 'border-t border-border',
                )}>
                  <span className="font-bold text-muted-foreground w-8 text-right shrink-0">{i + 11}º</span>
                  <span className="flex-1 truncate font-medium">{r.operador_nome ?? r.operador_usuario}</span>
                  <span className="font-mono font-semibold text-primary shrink-0">{formatBRL(r.total_recebido)}</span>
                  <span className="text-muted-foreground shrink-0">{r.total_pagamentos} pgtos.</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
