/**
 * PainelDiretoria.tsx — v2
 * Painel analítico profissional para cargo Diretoria / Admin.
 *
 * MELHORIAS v2:
 * • Seção "Agendado por Setor e Tipo" — visão consolidada de quanto cada setor
 *   tem agendado no mês, separado por tipo de pagamento (boleto, pix, cartão…)
 * • KPIs expandidos: ticket médio, índice de adimplência, acordos por dia útil
 * • Análise mensal: comparativo recebido × agendado × inadimplência
 * • Distribuição por tipo de pagamento (gráfico + tabela)
 * • Planejamento: projeção do mês e metas
 * • Layout de painel profissional com seções colapsáveis e destaque visual
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, Users, BarChart3,
  Filter, Building2, Users2, User, RefreshCw,
  CreditCard, Landmark, QrCode, Calendar,
  TrendingDown, Target, Activity, PieChart,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
  PieChart as RechartsPie, Pie, Legend,
} from 'recharts';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { formatCurrency, isPaguePlay } from '@/lib/index';
import { formatBRL, safeNum, sumSafe } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useEffect, useCallback } from 'react';

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface SetorAgendamento {
  id: string;
  nome: string;
  totalAgendado: number;
  totalRecebido: number;
  totalNaoPago: number;
  totalPendente: number;
  totalAcordos: number;
  porTipo: Record<string, { agendado: number; recebido: number; qtd: number }>;
  perc: number; // % recebido do total agendado
}

interface MesAnteriorData {
  valorAgendado: number;
  valorRecebido: number;
  totalAcordos: number;
}

// ─── Cores ─────────────────────────────────────────────────────────────────────

const TIPO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  boleto:            Landmark,
  pix:               QrCode,
  pix_automatico:    QrCode,
  cartao:            CreditCard,
  cartao_recorrente: CreditCard,
};

const TIPO_CORES: Record<string, string> = {
  boleto:            '#6366f1',  // indigo
  pix:               '#22c55e',  // verde
  pix_automatico:    '#10b981',  // esmeralda
  cartao:            '#f59e0b',  // âmbar
  cartao_recorrente: '#f97316',  // laranja
};

// Cores fixas para o gráfico de área — visíveis em todos os temas
const EVOL_AGENDADO = '#6366f1';
const EVOL_RECEBIDO = '#22c55e';

const TIPO_LABELS_DISPLAY: Record<string, string> = {
  boleto:            'Boleto / PIX',
  pix:               'Pix',
  pix_automatico:    'Pix Automático',
  cartao:            'Cartão',
  cartao_recorrente: 'Cartão Recorrente',
};

const PIE_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6',
];

// ─── Tooltip customizado ────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs text-popover-foreground min-w-[160px]">
      <p className="font-semibold mb-1.5 text-foreground">Dia {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="flex justify-between gap-3">
          <span>{entry.name}:</span>
          <span className="font-mono font-semibold">{formatBRL(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs text-popover-foreground">
      <p className="font-semibold" style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="font-mono mt-0.5">{formatBRL(d.value)}</p>
      <p className="text-muted-foreground">{d.payload.qtd} acordos</p>
    </div>
  );
}

// ─── Componente: KPI Card ──────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  delta?: { value: string; up: boolean; neutral?: boolean };
  delay?: number;
}

function KpiCard({ label, value, sub, icon: Icon, color, bg, delta, delay = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="border-border/50 hover:border-border hover:shadow-sm transition-all">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
              <p className={cn('text-xl font-bold mt-1 font-mono', color)}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              {delta && (
                <div className={cn(
                  'flex items-center gap-1 mt-1.5 text-[10px] font-medium',
                  delta.neutral ? 'text-muted-foreground' :
                  delta.up ? 'text-success' : 'text-destructive'
                )}>
                  {!delta.neutral && (
                    delta.up
                      ? <ArrowUpRight className="w-3 h-3" />
                      : <ArrowDownRight className="w-3 h-3" />
                  )}
                  <span>{delta.value}</span>
                  {!delta.neutral && <span className="text-muted-foreground font-normal">vs mês ant.</span>}
                </div>
              )}
            </div>
            <div className={cn('p-2 rounded-lg flex-shrink-0', bg)}>
              <Icon className={cn('w-4 h-4', color)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Componente: Setor Row ─────────────────────────────────────────────────────

function SetorRow({ setor, index, tipos }: { setor: SetorAgendamento; index: number; tipos: string[] }) {
  const [expandido, setExpandido] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border border-border/50 rounded-xl overflow-hidden"
    >
      {/* Header do setor */}
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{setor.nome}</p>
          <p className="text-[10px] text-muted-foreground">{setor.totalAcordos} acordos no mês</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Agendado</p>
            <p className="text-sm font-bold text-primary font-mono">{formatBRL(setor.totalAgendado)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="text-sm font-bold text-success font-mono">{formatBRL(setor.totalRecebido)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-16">
              <Progress value={setor.perc} className="h-1.5" />
            </div>
            <span className={cn(
              'text-xs font-bold w-9 text-right',
              setor.perc >= 80 ? 'text-success' :
              setor.perc >= 50 ? 'text-warning' : 'text-destructive'
            )}>{setor.perc}%</span>
          </div>
          {expandido
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Detalhes expandidos por tipo */}
      {expandido && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border/50 bg-muted/20 p-4"
        >
          {/* Resumo mobile */}
          <div className="flex gap-4 mb-4 sm:hidden">
            <div>
              <p className="text-[10px] text-muted-foreground">Agendado</p>
              <p className="text-sm font-bold text-primary font-mono">{formatBRL(setor.totalAgendado)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Recebido</p>
              <p className="text-sm font-bold text-success font-mono">{formatBRL(setor.totalRecebido)}</p>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-success/10 border border-success/20 text-center">
              <p className="text-[10px] text-success font-medium">Recebido</p>
              <p className="text-sm font-bold text-success font-mono">{formatBRL(setor.totalRecebido)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20 text-center">
              <p className="text-[10px] text-warning font-medium">Pendente</p>
              <p className="text-sm font-bold text-warning font-mono">{formatBRL(setor.totalPendente)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
              <p className="text-[10px] text-destructive font-medium">Não Pago</p>
              <p className="text-sm font-bold text-destructive font-mono">{formatBRL(setor.totalNaoPago)}</p>
            </div>
          </div>

          {/* Detalhamento por tipo */}
          {tipos.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Por tipo de pagamento</p>
              <div className="space-y-2">
                {tipos
                  .filter(t => setor.porTipo[t]?.qtd > 0)
                  .map(tipo => {
                    const dado = setor.porTipo[tipo];
                    if (!dado || dado.qtd === 0) return null;
                    const TipoIcon = TIPO_ICONS[tipo] ?? Landmark;
                    const percTipo = dado.agendado > 0 ? Math.round((dado.recebido / dado.agendado) * 100) : 0;
                    return (
                      <div key={tipo} className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-background border border-border/50">
                        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                          style={{ background: `${TIPO_CORES[tipo]}22` }}>
                          <TipoIcon className="w-3.5 h-3.5" style={{ color: TIPO_CORES[tipo] }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium truncate">{TIPO_LABELS_DISPLAY[tipo] ?? tipo}</p>
                            <p className="text-xs font-mono font-semibold text-foreground flex-shrink-0">
                              {formatBRL(dado.agendado)}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-[10px] text-muted-foreground">{dado.qtd} acordos · {formatBRL(dado.recebido)} recebido</p>
                            <p className={cn('text-[10px] font-semibold flex-shrink-0',
                              percTipo >= 80 ? 'text-success' : percTipo >= 50 ? 'text-warning' : 'text-destructive'
                            )}>{percTipo}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function PainelDiretoria() {
  const { perfil } = useAuth();
  const { tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);

  const {
    valorRecebidoMes,
    valorAgendadoMes,
    valorNaoPago,
    totalAcordosMes,
    totalPagosMes,
    totalNaoPagos,
    totalPendentes,
    porDia,
    porEquipe,
    porOperador,
    porStatus,
    meta,
    percMeta,
    setores,
    setorFiltro,
    setSetorFiltro,
    acordosMes,
    loading,
    refetch,
  } = useAnalytics();

  // ── Dados por setor ─────────────────────────────────────────────────────────
  const [setoresDetalhes, setSetoresDetalhes] = useState<
    { id: string; nome: string; acordos: any[] }[]
  >([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [mesAnterior, setMesAnterior] = useState<MesAnteriorData | null>(null);

  const { empresa } = useEmpresa();

  const carregarSetoresDetalhes = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingSetores(true);
    try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const inicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
      const ultimoDia = new Date(anoAtual, mesAtual, 0).getDate();
      const fim = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

      // Mês anterior
      const mesPrev = mesAtual === 1 ? 12 : mesAtual - 1;
      const anoPrev = mesAtual === 1 ? anoAtual - 1 : anoAtual;
      const inicioPrev = `${anoPrev}-${String(mesPrev).padStart(2, '0')}-01`;
      const ultimoDiaPrev = new Date(anoPrev, mesPrev, 0).getDate();
      const fimPrev = `${anoPrev}-${String(mesPrev).padStart(2, '0')}-${String(ultimoDiaPrev).padStart(2, '0')}`;

      // Buscar setores + acordos do mês atual
      const [{ data: setoresData }, { data: acordosMesData }, { data: acordosPrevData }] = await Promise.all([
        supabase
          .from('setores')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .order('nome'),
        supabase
          .from('acordos')
          .select('id, valor, status, tipo, setor_id, vencimento')
          .eq('empresa_id', empresa.id)
          .gte('vencimento', inicio)
          .lte('vencimento', fim),
        supabase
          .from('acordos')
          .select('id, valor, status, vencimento')
          .eq('empresa_id', empresa.id)
          .gte('vencimento', inicioPrev)
          .lte('vencimento', fimPrev),
      ]);

      if (setoresData && acordosMesData) {
        const detalhes = (setoresData as { id: string; nome: string }[]).map(s => ({
          ...s,
          acordos: (acordosMesData as any[]).filter(a => a.setor_id === s.id),
        }));
        setSetoresDetalhes(detalhes);
      }

      // Mês anterior — resumo global
      if (acordosPrevData) {
        const prev = acordosPrevData as any[];
        const prevPagos = prev.filter(a => a.status === 'pago');
        setMesAnterior({
          valorAgendado: prev.reduce((s: number, a: any) => s + safeNum(a.valor), 0),
          valorRecebido: prevPagos.reduce((s: number, a: any) => s + safeNum(a.valor), 0),
          totalAcordos: prev.length,
        });
      }
    } catch (err) {
      console.error('[PainelDiretoria] erro ao carregar setores:', err);
    } finally {
      setLoadingSetores(false);
    }
  }, [empresa?.id]);

  useEffect(() => {
    carregarSetoresDetalhes();
  }, [carregarSetoresDetalhes]);

  // ── Consolidar dados por setor ──────────────────────────────────────────────
  const setoresAgendamento = useMemo<SetorAgendamento[]>(() => {
    return setoresDetalhes.map(s => {
      const acs = s.acordos;
      const totalAgendado = sumSafe(acs.map(a => a.valor));
      const pagos = acs.filter(a => a.status === 'pago');
      const naoPagos = acs.filter(a => a.status === 'nao_pago');
      const pendentes = acs.filter(a => a.status === 'verificar_pendente');
      const totalRecebido = sumSafe(pagos.map(a => a.valor));
      const totalNaoPago = sumSafe(naoPagos.map(a => a.valor));
      const totalPendente = sumSafe(pendentes.map(a => a.valor));
      const perc = totalAgendado > 0 ? Math.min(Math.round((totalRecebido / totalAgendado) * 100), 100) : 0;

      // Agrupamento por tipo
      const porTipo: Record<string, { agendado: number; recebido: number; qtd: number }> = {};
      acs.forEach(a => {
        const tipo = a.tipo ?? 'sem_tipo';
        if (!porTipo[tipo]) porTipo[tipo] = { agendado: 0, recebido: 0, qtd: 0 };
        porTipo[tipo].agendado += safeNum(a.valor);
        porTipo[tipo].qtd++;
        if (a.status === 'pago') porTipo[tipo].recebido += safeNum(a.valor);
      });

      return {
        id: s.id,
        nome: s.nome,
        totalAgendado,
        totalRecebido,
        totalNaoPago,
        totalPendente,
        totalAcordos: acs.length,
        porTipo,
        perc,
      };
    }).filter(s => s.totalAcordos > 0 || setoresDetalhes.length <= 10)
      .sort((a, b) => b.totalAgendado - a.totalAgendado);
  }, [setoresDetalhes]);

  // Tipos de pagamento presentes no mês
  const tiposPresentes = useMemo(() => {
    const set = new Set<string>();
    setoresAgendamento.forEach(s => {
      Object.keys(s.porTipo).forEach(t => {
        if (s.porTipo[t].qtd > 0) set.add(t);
      });
    });
    return Array.from(set);
  }, [setoresAgendamento]);

  // ── KPIs derivados ──────────────────────────────────────────────────────────
  const txConversao = totalAcordosMes > 0
    ? Math.round((totalPagosMes / totalAcordosMes) * 100)
    : 0;

  const ticketMedio = totalPagosMes > 0
    ? Math.round(valorRecebidoMes / totalPagosMes)
    : 0;

  const inadimplencia = valorAgendadoMes > 0
    ? Math.round((valorNaoPago / valorAgendadoMes) * 100)
    : 0;

  // Comparativo com mês anterior
  const deltaAgendado = mesAnterior && mesAnterior.valorAgendado > 0
    ? Math.round(((valorAgendadoMes - mesAnterior.valorAgendado) / mesAnterior.valorAgendado) * 100)
    : null;

  const deltaRecebido = mesAnterior && mesAnterior.valorRecebido > 0
    ? Math.round(((valorRecebidoMes - mesAnterior.valorRecebido) / mesAnterior.valorRecebido) * 100)
    : null;

  // Distribuição por tipo (dados do accordosMes do hook)
  const distribuicaoPorTipo = useMemo(() => {
    const map: Record<string, { agendado: number; recebido: number; qtd: number }> = {};
    acordosMes.forEach(a => {
      const tipo = (a as any).tipo ?? 'outros';
      if (!map[tipo]) map[tipo] = { agendado: 0, recebido: 0, qtd: 0 };
      map[tipo].agendado += safeNum(a.valor);
      map[tipo].qtd++;
      if (a.status === 'pago') map[tipo].recebido += safeNum(a.valor);
    });
    return Object.entries(map)
      .map(([tipo, d]) => ({
        tipo,
        name: TIPO_LABELS_DISPLAY[tipo] ?? tipo,
        value: d.agendado,
        recebido: d.recebido,
        qtd: d.qtd,
        fill: TIPO_CORES[tipo] ?? '#94a3b8',
      }))
      .sort((a, b) => b.value - a.value);
  }, [acordosMes]);

  // Projeção do mês (baseado em dias úteis estimados)
  const hoje = new Date();
  const diasPassados = hoje.getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecaoMes = diasPassados > 0 && valorRecebidoMes > 0
    ? Math.round((valorRecebidoMes / diasPassados) * diasNoMes)
    : 0;

  const totalAgendadoGeral = setoresAgendamento.reduce((s, x) => s + x.totalAgendado, 0);

  if (!perfil) return null;

  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 p-4 md:p-6">

      {/* ── Cabeçalho ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-chart-5" />
            Painel Diretoria
          </h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            Análise completa · {mesNome}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {setores.length > 0 && (
            <Select
              value={setorFiltro ?? 'all'}
              onValueChange={v => setSetorFiltro(v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <Building2 className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm"
            onClick={() => { refetch(); carregarSetoresDetalhes(); }}
            disabled={loading || loadingSetores}
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', (loading || loadingSetores) && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ── KPIs principais ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Recebido no mês"
              value={formatBRL(valorRecebidoMes)}
              sub={`${totalPagosMes} acordos pagos`}
              icon={DollarSign}
              color="text-success"
              bg="bg-success/10"
              delta={deltaRecebido !== null ? {
                value: `${deltaRecebido > 0 ? '+' : ''}${deltaRecebido}%`,
                up: deltaRecebido >= 0,
              } : undefined}
              delay={0}
            />
            <KpiCard
              label="Total agendado"
              value={formatBRL(valorAgendadoMes)}
              sub={`${totalAcordosMes} acordos no mês`}
              icon={TrendingUp}
              color="text-primary"
              bg="bg-primary/10"
              delta={deltaAgendado !== null ? {
                value: `${deltaAgendado > 0 ? '+' : ''}${deltaAgendado}%`,
                up: deltaAgendado >= 0,
              } : undefined}
              delay={0.06}
            />
            <KpiCard
              label="Não pagos"
              value={formatBRL(valorNaoPago)}
              sub={`${totalNaoPagos} acordos`}
              icon={AlertCircle}
              color="text-destructive"
              bg="bg-destructive/10"
              delay={0.12}
            />
            <KpiCard
              label="Taxa de conversão"
              value={`${txConversao}%`}
              sub={`${totalPendentes} pendentes`}
              icon={CheckCircle2}
              color="text-chart-3"
              bg="bg-chart-3/10"
              delay={0.18}
            />
          </>
        )}
      </div>

      {/* ── KPIs secundários ─────────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Ticket médio (pagos)"
            value={formatBRL(ticketMedio)}
            sub="por acordo pago"
            icon={Activity}
            color="text-chart-1"
            bg="bg-chart-1/10"
            delay={0.22}
          />
          <KpiCard
            label="Índice de inadimplência"
            value={`${inadimplencia}%`}
            sub={`${formatBRL(valorNaoPago)} em atraso`}
            icon={TrendingDown}
            color={inadimplencia > 20 ? 'text-destructive' : 'text-warning'}
            bg={inadimplencia > 20 ? 'bg-destructive/10' : 'bg-warning/10'}
            delay={0.26}
          />
          <KpiCard
            label="Projeção do mês"
            value={projecaoMes > 0 ? formatBRL(projecaoMes) : '—'}
            sub={`Base: ${diasPassados} de ${diasNoMes} dias`}
            icon={Target}
            color="text-chart-5"
            bg="bg-chart-5/10"
            delay={0.30}
          />
          <KpiCard
            label="Pendentes"
            value={String(totalPendentes)}
            sub={`≈ ${formatBRL(valorAgendadoMes - valorRecebidoMes - valorNaoPago)} a verificar`}
            icon={Clock}
            color="text-chart-4"
            bg="bg-chart-4/10"
            delay={0.34}
          />
        </div>
      )}

      {/* ── Meta do mês ───────────────────────────────────────────────────────── */}
      {meta && !loading && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-chart-5" />
                Meta do mês
              </p>
              <Badge
                variant="outline"
                className={cn(
                  percMeta >= 100 ? 'text-success border-success/40 bg-success/5' :
                  percMeta >= 70  ? 'text-warning border-warning/40 bg-warning/5' :
                  'text-destructive border-destructive/40 bg-destructive/5'
                )}
              >
                {percMeta}% atingido
              </Badge>
            </div>
            <Progress value={percMeta} className="h-2.5" />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span className="text-success font-medium">{formatBRL(valorRecebidoMes)} recebido</span>
              <span>Meta: <span className="font-semibold text-foreground">{formatBRL(meta.meta_valor)}</span></span>
            </div>
            {projecaoMes > 0 && (
              <p className={cn(
                'text-xs mt-1.5 font-medium',
                projecaoMes >= meta.meta_valor ? 'text-success' : 'text-warning'
              )}>
                {projecaoMes >= meta.meta_valor
                  ? '✓ Projeção indica atingimento da meta'
                  : `⚠ Projeção: ${formatBRL(projecaoMes)} (${Math.round((projecaoMes / meta.meta_valor) * 100)}% da meta)`
                }
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Agendamento por setor e tipo ──────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Agendado por setor no mês
            </CardTitle>
            {!loadingSetores && totalAgendadoGeral > 0 && (
              <Badge variant="outline" className="text-primary border-primary/30 font-mono text-xs">
                {formatBRL(totalAgendadoGeral)} total
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Valor agendado por setor, detalhado por tipo de pagamento. Clique no setor para expandir.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingSetores ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : setoresAgendamento.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum dado de setor disponível</p>
            </div>
          ) : (
            setoresAgendamento.map((setor, i) => (
              <SetorRow
                key={setor.id}
                setor={setor}
                index={i}
                tipos={tiposPresentes}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Distribuição por tipo de pagamento ────────────────────────────────── */}
      {!loading && distribuicaoPorTipo.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Gráfico Pizza */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieChart className="w-4 h-4 text-chart-2" />
                Distribuição por tipo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <RechartsPie>
                  <Pie
                    data={distribuicaoPorTipo}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {distribuicaoPorTipo.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => <span className="text-xs text-foreground">{v}</span>}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabela de tipos */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-chart-3" />
                Detalhamento por tipo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {distribuicaoPorTipo.map((d, i) => {
                const TipoIcon = TIPO_ICONS[d.tipo] ?? Landmark;
                const percRec = d.value > 0 ? Math.round((d.recebido / d.value) * 100) : 0;
                return (
                  <div key={d.tipo} className="flex items-center gap-3 py-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${d.fill}22` }}>
                      <TipoIcon className="w-3.5 h-3.5" style={{ color: d.fill }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{d.name}</p>
                        <p className="text-xs font-mono font-bold text-foreground flex-shrink-0">
                          {formatBRL(d.value)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={percRec} className="h-1 flex-1" />
                        <span className={cn(
                          'text-[10px] font-semibold w-8 text-right',
                          percRec >= 80 ? 'text-success' : percRec >= 50 ? 'text-warning' : 'text-muted-foreground'
                        )}>{percRec}%</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {d.qtd} acordos · {formatBRL(d.recebido)} recebido
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Gráfico de evolução diária ─────────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: EVOL_AGENDADO }} />
              Evolução diária — {mesNome}
            </CardTitle>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: EVOL_RECEBIDO }} />
                Recebido
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: EVOL_AGENDADO }} />
                Agendado
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={porDia} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EVOL_RECEBIDO} stopOpacity={0.38} />
                    <stop offset="95%" stopColor={EVOL_RECEBIDO} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorAgeDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EVOL_AGENDADO} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={EVOL_AGENDADO} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="rgba(148,163,184,0.2)"
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="rgba(148,163,184,0.2)"
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="agendado" name="Agendado" stroke={EVOL_AGENDADO} fill="url(#colorAgeDiretor)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="recebido" name="Recebido" stroke={EVOL_RECEBIDO} fill="url(#colorRecDiretor)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Rankings ─────────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Por equipe */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users2 className="w-4 h-4 text-chart-3" />
              Performance por equipe
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : porEquipe && porEquipe.length > 0 ? (
              <div className="space-y-3">
                {porEquipe.slice(0, 6).map((eq, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[60%]">{eq.nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">{eq.acordos} pagos</span>
                        <span className="font-semibold font-mono">{formatBRL(eq.valor)}</span>
                      </div>
                    </div>
                    {eq.meta > 0 && (
                      <div className="flex items-center gap-2">
                        <Progress value={eq.perc} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground w-10 text-right">{eq.perc}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma equipe cadastrada</p>
            )}
          </CardContent>
        </Card>

        {/* Por operador */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-chart-1" />
              Ranking de operadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : porOperador && porOperador.length > 0 ? (
              <div className="space-y-2.5">
                {porOperador.slice(0, 8).map((op, i) => (
                  <div key={op.id} className="flex items-center gap-3">
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                      i === 0 ? 'bg-yellow-400/20 text-yellow-600' :
                      i === 1 ? 'bg-slate-300/30 text-slate-600' :
                      i === 2 ? 'bg-amber-600/20 text-amber-700' :
                                'bg-muted text-muted-foreground',
                    )}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{op.nome}</span>
                        <span className="text-sm font-semibold text-success font-mono">{formatBRL(op.valor)}</span>
                      </div>
                      {op.meta > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Progress value={op.perc} className="h-1 flex-1" />
                          <span className="text-xs text-muted-foreground">{op.perc}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de operadores</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Comparativo mês anterior ─────────────────────────────────────────── */}
      {mesAnterior && !loading && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-chart-4" />
              Comparativo com mês anterior
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: 'Agendado atual',
                  value: formatBRL(valorAgendadoMes),
                  sub: `${totalAcordosMes} acordos`,
                  color: 'text-primary',
                },
                {
                  label: 'Agendado anterior',
                  value: formatBRL(mesAnterior.valorAgendado),
                  sub: `${mesAnterior.totalAcordos} acordos`,
                  color: 'text-muted-foreground',
                },
                {
                  label: 'Recebido atual',
                  value: formatBRL(valorRecebidoMes),
                  sub: `${totalPagosMes} pagos`,
                  color: 'text-success',
                },
                {
                  label: 'Recebido anterior',
                  value: formatBRL(mesAnterior.valorRecebido),
                  sub: 'mês passado',
                  color: 'text-muted-foreground',
                },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg border border-border bg-card">
                  <p className="text-[10px] text-muted-foreground font-medium">{item.label}</p>
                  <p className={cn('text-base font-bold font-mono mt-0.5', item.color)}>{item.value}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>

            {/* Delta visual */}
            {(deltaAgendado !== null || deltaRecebido !== null) && (
              <div className="flex gap-3 mt-3 flex-wrap">
                {deltaAgendado !== null && (
                  <div className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border',
                    deltaAgendado >= 0
                      ? 'text-success bg-success/10 border-success/30'
                      : 'text-destructive bg-destructive/10 border-destructive/30'
                  )}>
                    {deltaAgendado >= 0
                      ? <ArrowUpRight className="w-3 h-3" />
                      : <ArrowDownRight className="w-3 h-3" />
                    }
                    Agendado: {deltaAgendado > 0 ? '+' : ''}{deltaAgendado}% vs mês anterior
                  </div>
                )}
                {deltaRecebido !== null && (
                  <div className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border',
                    deltaRecebido >= 0
                      ? 'text-success bg-success/10 border-success/30'
                      : 'text-destructive bg-destructive/10 border-destructive/30'
                  )}>
                    {deltaRecebido >= 0
                      ? <ArrowUpRight className="w-3 h-3" />
                      : <ArrowDownRight className="w-3 h-3" />
                    }
                    Recebido: {deltaRecebido > 0 ? '+' : ''}{deltaRecebido}% vs mês anterior
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Status breakdown ──────────────────────────────────────────────────── */}
      {!loading && porStatus.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Distribuição por status — acordos do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={porStatus} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="transparent" tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="transparent" tickLine={false} />
                <Tooltip formatter={(v: number) => [v, 'acordos']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {porStatus.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
