/**
 * PainelLider.tsx — Acompanhamento do time (líder/elite/gerência/admin)
 *
 * Reestruturado como painel de gestão por período:
 *  - Seletor de mês no topo (vale para todo o painel)
 *  - Faixa de KPIs do time no mês (recebido, H.O., a receber, não pagos, conversão)
 *  - Lista de operadores ordenável com métricas do mês + barra de conversão
 *  - Detalhe do operador alinhado ao mês selecionado
 *  - Atualização em tempo real (realtime de acordos) — sem precisar recarregar
 *
 * Métricas são SEMPRE do mês selecionado (por vencimento), refletindo a
 * atribuição de recebimento por vencimento usada no resto do sistema.
 */
import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users, AlertTriangle, ArrowRight, Calendar,
  ChevronRight, ChevronLeft, ChevronDown, RefreshCw, X, Loader2,
  TrendingUp, Wallet, Percent, ArrowUpDown, Search, Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase, Perfil, Acordo } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useRealtimeAcordos } from '@/providers/RealtimeAcordosProvider';
import { formatBRL, sumSafe } from '@/lib/money';
import { formatDate, STATUS_LABELS, STATUS_COLORS, getTodayISO, isPerfilAdmin, isPerfilLider, PP_HO_PERCENTUAL } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { DatePickerField } from '@/components/DatePickerField';
import { cn } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────

interface MesRef { ano: number; mes: number }   // mes: 0-11

interface OpMetric {
  perfil:       Perfil;
  recebido:     number;   // R$ pago no mês
  ho:           number;   // H.O. sobre o recebido
  pagos:        number;
  aReceber:     number;   // R$ em aberto no mês
  abertos:      number;
  naoPagos:     number;   // acordos marcados como não pago
  valorNaoPago: number;
  totalAcordos: number;   // pagos + abertos + não pagos (base da conversão)
  conversao:    number;   // 0-100 (pagos / totalAcordos)
}

type SortKey = 'recebido' | 'conversao' | 'naoPagos' | 'aReceber' | 'nome';

// ─── Helpers de período ─────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function periodoDoMes(m: MesRef) {
  const inicio = `${m.ano}-${pad(m.mes + 1)}-01`;
  const ultimoDia = new Date(m.ano, m.mes + 1, 0).getDate();
  const fim = `${m.ano}-${pad(m.mes + 1)}-${pad(ultimoDia)}`;
  const d = new Date(m.ano, m.mes, 1);
  const nome = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { inicio, fim, label: nome.charAt(0).toUpperCase() + nome.slice(1) };
}

function metricasOperador(perfil: Perfil, acordos: Acordo[]): OpMetric {
  const pagos    = acordos.filter(a => a.status === 'pago');
  const abertos  = acordos.filter(a => !['pago', 'nao_pago'].includes(a.status));
  const naoPagos = acordos.filter(a => a.status === 'nao_pago');
  const recebido = sumSafe(pagos.map(a => a.valor));
  const aReceber = sumSafe(abertos.map(a => a.valor));
  const totalAcordos = pagos.length + abertos.length + naoPagos.length;
  return {
    perfil,
    recebido,
    ho:           recebido * PP_HO_PERCENTUAL,
    pagos:        pagos.length,
    aReceber,
    abertos:      abertos.length,
    naoPagos:     naoPagos.length,
    valorNaoPago: sumSafe(naoPagos.map(a => a.valor)),
    totalAcordos,
    conversao:    totalAcordos > 0 ? Math.round((pagos.length / totalAcordos) * 100) : 0,
  };
}

// ─── KPI card do time ────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, accent,
}: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="relative flex flex-col gap-1 rounded-xl border border-border/70 bg-card p-3.5 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none">{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="text-lg font-bold font-mono tabular-nums leading-tight pl-1">{value}</div>
      {sub && <span className="text-[10px] text-muted-foreground pl-1 leading-snug">{sub}</span>}
    </div>
  );
}

// ─── Barra de conversão ──────────────────────────────────────────────────────

function BarraConversao({ perc }: { perc: number }) {
  const cor = perc >= 70 ? 'bg-success' : perc >= 40 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', cor)} style={{ width: `${perc}%` }} />
      </div>
      <span className="text-[11px] font-mono font-semibold text-muted-foreground w-8 text-right">{perc}%</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export default function PainelLider() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const verTodosSetores = temPermissao('ver_todos_setores');
  const { subscribe, unsubscribe } = useRealtimeAcordos();
  const isPP = useTenant().isPaguePlay;
  const instanceId = useRef(`painel-lider-${Math.random().toString(36).slice(2, 9)}`).current;

  const isAdmin = isPerfilAdmin(perfil?.perfil ?? '') || perfil?.perfil === 'diretoria';
  const isLiderOuSimilar = isPerfilLider(perfil?.perfil ?? '') && !isAdmin;

  const [mesRef, setMesRef] = useState<MesRef>(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const periodo = useMemo(() => periodoDoMes(mesRef), [mesRef]);
  const ehMesAtual = useMemo(() => {
    const d = new Date();
    return mesRef.ano === d.getFullYear() && mesRef.mes === d.getMonth();
  }, [mesRef]);

  const [operadores, setOperadores] = useState<Perfil[]>([]);
  const [acordosMes, setAcordosMes] = useState<Acordo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState<string | null>(null);
  const [opSelId, setOpSelId]       = useState<string | null>(null);
  const [busca, setBusca]           = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('recebido');

  // ── Carregar operadores (não depende do mês) ──────────────────────────────
  const carregarOperadores = useCallback(async (): Promise<Perfil[]> => {
    if (!perfil || !empresa?.id) return [];
    let q = supabase
      .from('perfis')
      .select('*, setores(id, nome)')
      .eq('empresa_id', empresa.id)
      .in('perfil', ['operador', 'elite'])
      .eq('ativo', true);
    if (!isAdmin && isLiderOuSimilar && perfil.setor_id && !verTodosSetores) {
      q = q.eq('setor_id', perfil.setor_id);
    }
    const { data, error } = await q.order('nome');
    if (error) throw new Error(`Operadores: ${error.message}`);
    return (data as Perfil[]) ?? [];
  }, [perfil?.id, perfil?.perfil, perfil?.setor_id, empresa?.id, isAdmin, isLiderOuSimilar, verTodosSetores]);

  // ── Carregar acordos do mês para os operadores ────────────────────────────
  const carregarAcordosMes = useCallback(async (ids: string[]): Promise<Acordo[]> => {
    if (!empresa?.id || ids.length === 0) return [];
    const { data, error } = await supabase
      .from('acordos')
      .select('id, nome_cliente, nr_cliente, vencimento, valor, status, tipo, operador_id, setor_id, parcelas, whatsapp, observacoes, data_cadastro, criado_em, atualizado_em')
      .eq('empresa_id', empresa.id)
      .in('operador_id', ids)
      .gte('vencimento', periodo.inicio)
      .lte('vencimento', periodo.fim)
      .order('vencimento', { ascending: true });
    if (error) throw new Error(`Acordos: ${error.message}`);
    return (data as Acordo[]) ?? [];
  }, [empresa?.id, periodo.inicio, periodo.fim]);

  // ── Orquestra a carga (operadores + acordos do mês) ───────────────────────
  const idsRef = useRef<string[]>([]);
  const carregarTudo = useCallback(async () => {
    if (!perfil || !empresa?.id) return;
    setLoading(true);
    setErro(null);
    try {
      const ops = await carregarOperadores();
      setOperadores(ops);
      idsRef.current = ops.map(o => o.id);
      const acs = await carregarAcordosMes(idsRef.current);
      setAcordosMes(acs);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [perfil?.id, empresa?.id, carregarOperadores, carregarAcordosMes]);

  useEffect(() => { void carregarTudo(); }, [carregarTudo]);

  // ── Realtime: qualquer mudança em acordos recarrega os do mês ─────────────
  const recarregarAcordos = useCallback(async () => {
    try {
      const acs = await carregarAcordosMes(idsRef.current);
      setAcordosMes(acs);
    } catch { /* silencioso — mantém dados atuais */ }
  }, [carregarAcordosMes]);

  useEffect(() => {
    subscribe(instanceId, () => { void recarregarAcordos(); });
    return () => unsubscribe(instanceId);
  }, [subscribe, unsubscribe, instanceId, recarregarAcordos]);

  // ── Agregações ────────────────────────────────────────────────────────────
  const metricas = useMemo(() => {
    const porOp = new Map<string, Acordo[]>();
    for (const a of acordosMes) {
      if (!a.operador_id) continue;
      const arr = porOp.get(a.operador_id) ?? [];
      arr.push(a);
      porOp.set(a.operador_id, arr);
    }
    return operadores.map(op => metricasOperador(op, porOp.get(op.id) ?? []));
  }, [operadores, acordosMes]);

  const time = useMemo(() => {
    const recebido = sumSafe(metricas.map(m => m.recebido));
    const ho       = sumSafe(metricas.map(m => m.ho));
    const aReceber = sumSafe(metricas.map(m => m.aReceber));
    const pagos    = metricas.reduce((s, m) => s + m.pagos, 0);
    const abertos  = metricas.reduce((s, m) => s + m.abertos, 0);
    const naoPagos = metricas.reduce((s, m) => s + m.naoPagos, 0);
    const valorNaoPago = sumSafe(metricas.map(m => m.valorNaoPago));
    const totalAcordos = pagos + abertos + naoPagos;
    return {
      recebido, ho, aReceber, pagos, abertos, naoPagos, valorNaoPago,
      conversao: totalAcordos > 0 ? Math.round((pagos / totalAcordos) * 100) : 0,
      nOperadores: operadores.length,
    };
  }, [metricas, operadores.length]);

  const ordenados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q ? metricas.filter(m => m.perfil.nome.toLowerCase().includes(q)) : metricas;
    const arr = [...base];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'conversao': return b.conversao - a.conversao;
        case 'naoPagos':  return b.naoPagos - a.naoPagos || b.valorNaoPago - a.valorNaoPago;
        case 'aReceber':  return b.aReceber - a.aReceber;
        case 'nome':      return a.perfil.nome.localeCompare(b.perfil.nome, 'pt-BR');
        case 'recebido':
        default:          return b.recebido - a.recebido;
      }
    });
    return arr;
  }, [metricas, busca, sortKey]);

  function irMes(delta: number) {
    setMesRef(m => {
      const d = new Date(m.ano, m.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!perfil || !empresa?.id) return null;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">

      {/* ── Cabeçalho + navegador de mês ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Painel do Líder
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                <Radio className="w-3 h-3" /> ao vivo
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Acompanhamento da equipe · {time.nOperadores} operador{time.nOperadores !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => irMes(-1)} title="Mês anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="flex items-center gap-1.5 text-sm font-semibold min-w-[130px] justify-center">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {periodo.label}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => irMes(1)} title="Próximo mês">
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!ehMesAtual && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary"
              onClick={() => { const d = new Date(); setMesRef({ ano: d.getFullYear(), mes: d.getMonth() }); }}>
              Hoje
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void carregarTudo()} disabled={loading} title="Recarregar">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center justify-between">
          <span>{erro}</span>
          <Button size="sm" variant="link" className="text-destructive h-auto p-0" onClick={() => void carregarTudo()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* ── KPIs do time ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[76px] bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Recebido no mês" accent="#10b981" icon={<TrendingUp className="w-4 h-4" />}
            value={<span className="text-emerald-500">{formatBRL(time.recebido)}</span>}
            sub={isPP
              ? `H.O. ${formatBRL(time.ho)} · ${time.pagos} pago${time.pagos !== 1 ? 's' : ''}`
              : `${time.pagos} acordo${time.pagos !== 1 ? 's' : ''} pago${time.pagos !== 1 ? 's' : ''}`} />
          <KpiCard label="A receber" accent="#6366f1" icon={<Wallet className="w-4 h-4" />}
            value={<span className="text-primary">{formatBRL(time.aReceber)}</span>}
            sub={`${time.abertos} em aberto`} />
          <KpiCard label="Não pagos" accent="#ef4444" icon={<AlertTriangle className="w-4 h-4" />}
            value={<span className={time.naoPagos > 0 ? 'text-destructive' : 'text-foreground'}>{time.naoPagos}</span>}
            sub={`${formatBRL(time.valorNaoPago)} não pago`} />
          <KpiCard label="Conversão do time" accent="#f59e0b" icon={<Percent className="w-4 h-4" />}
            value={`${time.conversao}%`}
            sub={`${time.pagos}/${time.pagos + time.abertos + time.naoPagos} acordos`} />
          <KpiCard label="Operadores" accent="#8b5cf6" icon={<Users className="w-4 h-4" />}
            value={String(time.nOperadores)}
            sub="na equipe" />
        </div>
      )}

      {/* ── Lista de operadores ──────────────────────────────────────────── */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Operadores · {periodo.label}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar operador…"
                  className="h-8 w-40 pl-8 pr-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
                <SelectTrigger className="h-8 w-40 text-xs gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recebido">Maior recebido</SelectItem>
                  <SelectItem value="conversao">Maior conversão</SelectItem>
                  <SelectItem value="naoPagos">Mais não pagos</SelectItem>
                  <SelectItem value="aReceber">Maior a receber</SelectItem>
                  <SelectItem value="nome">Nome (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
            </div>
          ) : ordenados.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-10">
              {busca ? 'Nenhum operador encontrado.' : 'Nenhum operador na equipe.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-semibold">OPERADOR</th>
                    <th className="text-right px-3 py-2.5 font-semibold">RECEBIDO</th>
                    {isPP && <th className="text-right px-3 py-2.5 font-semibold">H.O.</th>}
                    <th className="text-right px-3 py-2.5 font-semibold">A RECEBER</th>
                    <th className="text-center px-3 py-2.5 font-semibold">ABERTOS</th>
                    <th className="text-center px-3 py-2.5 font-semibold">NÃO PAGOS</th>
                    <th className="text-left px-3 py-2.5 font-semibold min-w-[120px]">CONVERSÃO</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((m, i) => {
                    const sel = m.perfil.id === opSelId;
                    return (
                      <Fragment key={m.perfil.id}>
                        <tr
                          onClick={() => setOpSelId(sel ? null : m.perfil.id)}
                          className={cn(
                            'border-b border-border/50 cursor-pointer transition-colors',
                            sel ? 'bg-primary/5' : 'hover:bg-muted/20',
                            m.naoPagos > 0 && !sel && 'bg-destructive/[0.03]',
                          )}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[11px] font-bold text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                              <Avatar className="w-7 h-7 shrink-0">
                                <AvatarImage src={m.perfil.foto_url ?? undefined} alt={m.perfil.nome} />
                                <AvatarFallback className="text-[10px] font-bold bg-muted text-muted-foreground">
                                  {m.perfil.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate max-w-[160px]">{m.perfil.nome}</p>
                                <p className="text-[10px] text-muted-foreground">{m.totalAcordos} acordo{m.totalAcordos !== 1 ? 's' : ''} no mês</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-success">{formatBRL(m.recebido)}</td>
                          {isPP && <td className="px-3 py-2.5 text-right font-mono text-emerald-600/80">{formatBRL(m.ho)}</td>}
                          <td className="px-3 py-2.5 text-right font-mono text-primary">{formatBRL(m.aReceber)}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-warning">{m.abertos}</td>
                          <td className="px-3 py-2.5 text-center">
                            {m.naoPagos > 0 ? (
                              <span className="inline-flex items-center gap-1 font-mono font-semibold text-destructive">
                                <AlertTriangle className="w-3 h-3" /> {m.naoPagos}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5"><BarraConversao perc={m.conversao} /></td>
                          <td className="px-2 py-2.5 text-right">
                            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', sel && 'rotate-180 text-primary')} />
                          </td>
                        </tr>
                        {sel && (
                          <tr>
                            <td colSpan={isPP ? 8 : 7} className="p-0 bg-muted/10 border-b border-border">
                              <div className="p-3 md:p-4">
                                <DetalheOperador
                                  operadorId={m.perfil.id}
                                  operadorNome={m.perfil.nome}
                                  fotoUrl={m.perfil.foto_url}
                                  inicioMes={periodo.inicio}
                                  fimMes={periodo.fim}
                                  labelMes={periodo.label}
                                  onFechar={() => setOpSelId(null)}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Detalhe do operador (acordos do mês selecionado) ────────────────────────

interface DetalheOperadorProps {
  operadorId:   string;
  operadorNome: string;
  fotoUrl?:     string | null;
  inicioMes:    string;
  fimMes:       string;
  labelMes:     string;
  onFechar:     () => void;
}

function DetalheOperador({
  operadorId, operadorNome, fotoUrl, inicioMes, fimMes, labelMes, onFechar,
}: DetalheOperadorProps) {
  const tenant = useTenant();
  const statusLabels = tenant.statusLabels;
  const isPP = tenant.isPaguePlay;
  const { subscribe, unsubscribe } = useRealtimeAcordos();
  const instanceId = useRef(`detalhe-op-${Math.random().toString(36).slice(2, 9)}`).current;

  const PAGE = 50;
  const [acordos, setAcordos]     = useState<Acordo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('all');
  const [filtroData, setFiltroData]      = useState<string>('');   // '' = sem filtro
  const [limite, setLimite]              = useState(PAGE);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase
        .from('acordos')
        .select('id, nome_cliente, nr_cliente, vencimento, valor, status, tipo, operador_id, setor_id, parcelas, whatsapp, observacoes, data_cadastro, criado_em, atualizado_em')
        .eq('operador_id', operadorId)
        .gte('vencimento', inicioMes)
        .lte('vencimento', fimMes)
        .order('vencimento', { ascending: true });
      if (error) throw error;
      setAcordos((data as Acordo[]) ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar acordos');
    } finally {
      setLoading(false);
    }
  }, [operadorId, inicioMes, fimMes]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    subscribe(instanceId, () => { void carregar(); });
    return () => unsubscribe(instanceId);
  }, [subscribe, unsubscribe, instanceId, carregar]);

  const hoje = getTodayISO();
  const pagos    = acordos.filter(a => a.status === 'pago');
  const abertos  = acordos.filter(a => !['pago', 'nao_pago'].includes(a.status));
  const naoPagos = acordos.filter(a => a.status === 'nao_pago');
  const recebido = sumSafe(pagos.map(a => a.valor));
  const ho       = recebido * PP_HO_PERCENTUAL;
  const aReceber = sumSafe(abertos.map(a => a.valor));
  const totalConv = pagos.length + abertos.length + naoPagos.length;

  const acordosFiltrados = acordos
    .filter(a => filtroStatus === 'all' || a.status === filtroStatus)
    .filter(a => !filtroData || a.vencimento === filtroData)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const acordosVisiveis = acordosFiltrados.slice(0, limite);

  // Reset da paginação quando os filtros mudam
  function mudarFiltroStatus(v: string) { setFiltroStatus(v); setLimite(PAGE); }
  function mudarFiltroData(v: string)   { setFiltroData(v);   setLimite(PAGE); }

  const initials = operadorNome.split(' ').map(n => n[0]).slice(0, 2).join('');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="space-y-4"
    >
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="w-10 h-10">
              <AvatarImage src={fotoUrl ?? undefined} alt={operadorNome} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground truncate">{operadorNome}</h3>
              <p className="text-xs text-muted-foreground">
                {loading ? 'Carregando…' : `${acordos.length} acordo${acordos.length !== 1 ? 's' : ''} em ${labelMes}`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => void carregar()} title="Recarregar">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onFechar} title="Fechar">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando acordos…</span>
            </div>
          ) : erro ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {erro}
              <Button size="sm" variant="link" className="text-destructive ml-2 h-auto p-0" onClick={() => void carregar()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className={cn('grid grid-cols-2 gap-3', isPP ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4')}>
              {[
                { label: 'Recebido/mês', value: formatBRL(recebido),          cls: 'text-success',     sub: `${pagos.length} pago(s)` },
                ...(isPP ? [{ label: 'H.O./mês', value: formatBRL(ho), cls: 'text-emerald-600', sub: `${(PP_HO_PERCENTUAL * 100).toFixed(2)}% do recebido` }] : []),
                { label: 'A receber/mês', value: formatBRL(aReceber),          cls: 'text-primary',     sub: `${abertos.length} aberto(s)` },
                { label: 'Não pagos',    value: String(naoPagos.length),       cls: 'text-destructive', sub: `${formatBRL(sumSafe(naoPagos.map(a => a.valor)))} não pago` },
                { label: 'Conversão',    value: `${totalConv > 0 ? Math.round((pagos.length / totalConv) * 100) : 0}%`, cls: 'text-warning', sub: `${pagos.length}/${totalConv}` },
              ].map(({ label, value, cls, sub }) => (
                <div key={label} className="p-3 bg-background rounded-lg border border-border">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={cn('text-base font-bold font-mono mt-0.5', cls)}>{value}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && !erro && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">Acordos de {operadorNome.split(' ')[0]} · {labelMes}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filtroStatus} onValueChange={mudarFiltroStatus}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Todos status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(statusLabels).filter(([k]) => !!k).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DatePickerField
                  value={filtroData}
                  onChange={mudarFiltroData}
                  size="sm"
                  placeholder="Filtrar data"
                  triggerClassName="w-36"
                />
                {filtroData && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-xs text-muted-foreground"
                    onClick={() => mudarFiltroData('')}>
                    <X className="w-3 h-3" /> Limpar data
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {acordosFiltrados.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-8">Nenhum acordo encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">CLIENTE</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">VENCIMENTO</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">VALOR</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">STATUS</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {acordosVisiveis.map(a => {
                      const venceHoje = a.vencimento === hoje;
                      const atrasado  = a.vencimento < hoje && !['pago', 'nao_pago'].includes(a.status);
                      return (
                        <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 font-medium text-foreground max-w-[160px] truncate">{a.nome_cliente}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {formatDate(a.vencimento)}
                            {venceHoje && <Badge className="ml-1 text-[10px] bg-warning/20 text-warning border-warning/30 h-4 px-1">Hoje</Badge>}
                            {atrasado  && <Badge className="ml-1 text-[10px] bg-destructive/10 text-destructive border-destructive/20 h-4 px-1">Atrasado</Badge>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-semibold text-foreground">{formatBRL(a.valor)}</td>
                          <td className="px-4 py-2">
                            <Badge className={cn('text-[10px] h-5 px-1.5', STATUS_COLORS[a.status as keyof typeof STATUS_COLORS])} variant="outline">
                              {statusLabels[a.status] ?? STATUS_LABELS[a.status] ?? a.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <Link to={`/acordos/${a.id}`} className="text-primary hover:underline">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {acordosVisiveis.length < acordosFiltrados.length && (
                  <div className="flex items-center justify-center gap-3 py-3 border-t border-border">
                    <span className="text-[11px] text-muted-foreground">
                      Mostrando {acordosVisiveis.length} de {acordosFiltrados.length}
                    </span>
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setLimite(l => l + PAGE)}>
                      Carregar mais {Math.min(PAGE, acordosFiltrados.length - acordosVisiveis.length)}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
