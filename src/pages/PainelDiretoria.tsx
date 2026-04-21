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
import { useAxisColors } from '@/hooks/useChartColors';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, BarChart3,
  Filter, Building2, Users2, User, RefreshCw,
  CreditCard, Landmark, QrCode, Calendar,
  TrendingDown, Target, Activity, PieChart,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Clock, Percent, Banknote, PiggyBank,
  CalendarClock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
  PieChart as RechartsPie, Pie, Legend,
} from 'recharts';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { isPaguePlay, PP_HO_PERCENTUAL, PP_COREN_PERCENTUAL, PP_COFEN_PERCENTUAL } from '@/lib/index';
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
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm p-3 shadow-xl text-xs text-popover-foreground min-w-[170px]">
      <p className="font-semibold mb-2 text-foreground border-b border-border/40 pb-1.5">Dia {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="flex justify-between gap-4 mt-1">
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono font-bold">{formatBRL(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm p-3 shadow-xl text-xs text-popover-foreground">
      <p className="font-bold mb-1" style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="font-mono text-sm font-semibold">{formatBRL(d.value)}</p>
      <p className="text-muted-foreground mt-0.5">{d.payload.qtd} acordos</p>
    </div>
  );
}

// ─── Componente: KPI Card (redesenhado) ────────────────────────────────────────

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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className="h-full"
    >
      <div className="relative h-full rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 hover:border-border/70 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
        {/* Subtle gradient accent */}
        <div className={cn('absolute inset-x-0 top-0 h-0.5 rounded-t-2xl opacity-70', bg.replace('/10', ''))} />
        {/* Background glow */}
        <div className={cn('absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity', bg)} />

        <div className="flex items-start justify-between gap-3 relative">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider truncate">{label}</p>
            <p className={cn('text-2xl font-extrabold mt-1.5 font-mono leading-none tracking-tight', color)}>{value}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{sub}</p>
            {delta && (
              <div className={cn(
                'inline-flex items-center gap-1 mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full',
                delta.neutral
                  ? 'bg-muted text-muted-foreground'
                  : delta.up
                    ? 'bg-success/15 text-success'
                    : 'bg-destructive/15 text-destructive'
              )}>
                {!delta.neutral && (
                  delta.up
                    ? <ArrowUpRight className="w-2.5 h-2.5" />
                    : <ArrowDownRight className="w-2.5 h-2.5" />
                )}
                <span>{delta.value}</span>
                {!delta.neutral && <span className="font-normal opacity-70">vs mês ant.</span>}
              </div>
            )}
          </div>
          <div className={cn('p-2.5 rounded-xl flex-shrink-0 border border-border/20', bg)}>
            <Icon className={cn('w-4 h-4', color)} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Componente: Section Label ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border/50" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2">{children}</span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

// ─── Componente: Setor Row (redesenhado) ───────────────────────────────────────

function SetorRow({ setor, index, tipos }: { setor: SetorAgendamento; index: number; tipos: string[] }) {
  const [expandido, setExpandido] = useState(false);

  const percColor = setor.perc >= 80
    ? 'text-success'
    : setor.perc >= 50
      ? 'text-warning'
      : 'text-destructive';

  const percBg = setor.perc >= 80
    ? 'bg-success/10 border-success/20'
    : setor.perc >= 50
      ? 'bg-warning/10 border-warning/20'
      : 'bg-destructive/10 border-destructive/20';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className="rounded-xl border border-border/40 overflow-hidden bg-card/60 backdrop-blur-sm hover:border-border/70 transition-all duration-200"
    >
      {/* Header do setor */}
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/20 transition-colors text-left group"
      >
        {/* Rank indicator */}
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3.5 h-3.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{setor.nome}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{setor.totalAcordos} acordos no mês</p>
        </div>

        {/* Mini inline bar chart */}
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0 w-24">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${setor.perc}%`,
                background: setor.perc >= 80 ? '#22c55e' : setor.perc >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className={cn('text-[11px] font-bold w-8 text-right tabular-nums', percColor)}>
            {setor.perc}%
          </span>
        </div>

        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Agendado</p>
            <p className="text-xs font-bold text-primary font-mono">{formatBRL(setor.totalAgendado)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Recebido</p>
            <p className="text-xs font-bold text-success font-mono">{formatBRL(setor.totalRecebido)}</p>
          </div>
        </div>

        <div className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center border transition-colors',
          expandido ? 'bg-primary/10 border-primary/30' : 'bg-muted border-border/40'
        )}>
          {expandido
            ? <ChevronUp className="w-3 h-3 text-primary" />
            : <ChevronDown className="w-3 h-3 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Detalhes expandidos por tipo */}
      {expandido && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="border-t border-border/40"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--border) / 0.3) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        >
          <div className="p-4 bg-muted/10">
            {/* Mobile summary */}
            <div className="flex gap-4 mb-4 sm:hidden">
              <div>
                <p className="text-[10px] text-muted-foreground">Agendado</p>
                <p className="text-sm font-bold text-primary font-mono">{formatBRL(setor.totalAgendado)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Recebido</p>
                <p className="text-sm font-bold text-success font-mono">{formatBRL(setor.totalRecebido)}</p>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-1">Conversão</p>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${setor.perc}%` }} />
                  </div>
                  <span className={cn('text-[11px] font-bold', percColor)}>{setor.perc}%</span>
                </div>
              </div>
            </div>

            {/* Status breakdown — 3 cards */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className={cn('p-3 rounded-xl border text-center bg-success/5 border-success/20')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  <p className="text-[10px] text-success font-bold uppercase tracking-wide">Recebido</p>
                </div>
                <p className="text-sm font-extrabold text-success font-mono">{formatBRL(setor.totalRecebido)}</p>
              </div>
              <div className={cn('p-3 rounded-xl border text-center bg-warning/5 border-warning/20')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-warning" />
                  <p className="text-[10px] text-warning font-bold uppercase tracking-wide">Pendente</p>
                </div>
                <p className="text-sm font-extrabold text-warning font-mono">{formatBRL(setor.totalPendente)}</p>
              </div>
              <div className={cn('p-3 rounded-xl border text-center bg-destructive/5 border-destructive/20')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle className="w-3 h-3 text-destructive" />
                  <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">Não Pago</p>
                </div>
                <p className="text-sm font-extrabold text-destructive font-mono">{formatBRL(setor.totalNaoPago)}</p>
              </div>
            </div>

            {/* Horizontal stacked bar */}
            {setor.totalAgendado > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Composição do agendado</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-px bg-muted">
                  {setor.totalRecebido > 0 && (
                    <div
                      className="h-full bg-success"
                      style={{ width: `${Math.round((setor.totalRecebido / setor.totalAgendado) * 100)}%` }}
                      title={`Recebido ${Math.round((setor.totalRecebido / setor.totalAgendado) * 100)}%`}
                    />
                  )}
                  {setor.totalPendente > 0 && (
                    <div
                      className="h-full bg-warning"
                      style={{ width: `${Math.round((setor.totalPendente / setor.totalAgendado) * 100)}%` }}
                      title={`Pendente ${Math.round((setor.totalPendente / setor.totalAgendado) * 100)}%`}
                    />
                  )}
                  {setor.totalNaoPago > 0 && (
                    <div
                      className="h-full bg-destructive"
                      style={{ width: `${Math.round((setor.totalNaoPago / setor.totalAgendado) * 100)}%` }}
                      title={`Não pago ${Math.round((setor.totalNaoPago / setor.totalAgendado) * 100)}%`}
                    />
                  )}
                </div>
                <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success inline-block" />Rec.</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-warning inline-block" />Pend.</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive inline-block" />N. pago</span>
                </div>
              </div>
            )}

            {/* Detalhamento por tipo */}
            {tipos.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Por tipo de pagamento</p>
                <div className="space-y-1.5">
                  {tipos
                    .filter(t => setor.porTipo[t]?.qtd > 0)
                    .map(tipo => {
                      const dado = setor.porTipo[tipo];
                      if (!dado || dado.qtd === 0) return null;
                      const TipoIcon = TIPO_ICONS[tipo] ?? Landmark;
                      const percTipo = dado.agendado > 0 ? Math.round((dado.recebido / dado.agendado) * 100) : 0;
                      return (
                        <div key={tipo} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-background/70 border border-border/30 hover:border-border/60 transition-colors">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border"
                            style={{ background: `${TIPO_CORES[tipo]}18`, borderColor: `${TIPO_CORES[tipo]}30` }}
                          >
                            <TipoIcon className="w-3.5 h-3.5" style={{ color: TIPO_CORES[tipo] }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold truncate text-foreground">{TIPO_LABELS_DISPLAY[tipo] ?? tipo}</p>
                              <p className="text-xs font-mono font-bold text-foreground flex-shrink-0">
                                {formatBRL(dado.agendado)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${percTipo}%`,
                                    background: percTipo >= 80 ? '#22c55e' : percTipo >= 50 ? '#f59e0b' : '#ef4444',
                                  }}
                                />
                              </div>
                              <p className={cn('text-[10px] font-bold flex-shrink-0 w-8 text-right',
                                percTipo >= 80 ? 'text-success' : percTipo >= 50 ? 'text-warning' : 'text-destructive'
                              )}>{percTipo}%</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{dado.qtd} acordos · {formatBRL(dado.recebido)} recebido</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function PainelDiretoria() {
  const { tickColor, gridColor } = useAxisColors();
  const { perfil } = useAuth();
  const { tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);

  const {
    valorRecebidoMes,
    valorAgendadoMes,
    valorNaoPago,
    valorHOMes,
    valorHOAgendado,
    valorHONaoPago,
    totalAcordosMes,
    totalPagosMes,
    totalNaoPagos,
    totalPendentes,
    valorAgendadoRestanteMes,
    totalAgendadoRestanteMes,
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

  // KPIs H.O. (PaguePlay)
  const valorCorenMes  = valorRecebidoMes * PP_COREN_PERCENTUAL;
  const valorCofenMes  = valorRecebidoMes * PP_COFEN_PERCENTUAL;
  const valorCorenAge  = valorAgendadoMes * PP_COREN_PERCENTUAL;
  const valorCofenAge  = valorAgendadoMes * PP_COFEN_PERCENTUAL;

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
  // Projeção baseada em H.O. para PaguePlay
  const valorBaseProjecao = isPP ? valorHOMes : valorRecebidoMes;
  const projecaoMes = diasPassados > 0 && valorBaseProjecao > 0
    ? Math.round((valorBaseProjecao / diasPassados) * diasNoMes)
    : 0;
  const projecaoBruta = diasPassados > 0 && valorRecebidoMes > 0
    ? Math.round((valorRecebidoMes / diasPassados) * diasNoMes)
    : 0;

  const totalAgendadoGeral = setoresAgendamento.reduce((s, x) => s + x.totalAgendado, 0);

  if (!perfil) return null;

  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">

      {/* ── Cabeçalho premium ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
      >
        {/* Gradient accent top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-chart-3 to-chart-5" />
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
              <span className="font-semibold uppercase tracking-widest">Painel Executivo</span>
              <span className="opacity-40">›</span>
              <span className="capitalize font-medium text-foreground/70">{mesNome}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2.5 tracking-tight">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              Painel Diretoria
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-[11px] text-muted-foreground">
                Atualizado às <span className="font-semibold text-foreground/80">{agora}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {setores.length > 0 && (
              <Select
                value={setorFiltro ?? 'all'}
                onValueChange={v => setSetorFiltro(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-44 h-9 text-xs rounded-xl border-border/50 bg-background/60">
                  <Building2 className="w-3 h-3 mr-1 text-muted-foreground" />
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetch(); carregarSetoresDetalhes(); }}
              disabled={loading || loadingSetores}
              className="rounded-xl h-9 border-border/50 bg-background/60 hover:bg-accent/40"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', (loading || loadingSetores) && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Section: KPIs Principais ─────────────────────────────────────────── */}
      <SectionLabel>Indicadores-chave do mês</SectionLabel>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {loading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : (
          <>
            <KpiCard
              label={isPP ? 'H.O. recebido no mês' : 'Recebido no mês'}
              value={isPP ? formatBRL(valorHOMes) : formatBRL(valorRecebidoMes)}
              sub={
                isPP
                  ? `Bruto: ${formatBRL(valorRecebidoMes)} · ${totalPagosMes} pagos`
                  : `${totalPagosMes} acordos pagos`
              }
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
              label={isPP ? 'H.O. agendado' : 'Total agendado'}
              value={isPP ? formatBRL(valorHOAgendado) : formatBRL(valorAgendadoMes)}
              sub={
                isPP
                  ? `Bruto: ${formatBRL(valorAgendadoMes)} · ${totalAcordosMes} acordos`
                  : `${totalAcordosMes} acordos no mês`
              }
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
              label="Agendado restante"
              value={formatBRL(valorAgendadoRestanteMes)}
              sub={`${totalAgendadoRestanteMes} pendentes no mês`}
              icon={CalendarClock}
              color="text-warning"
              bg="bg-warning/10"
              delay={0.12}
            />
            <KpiCard
              label="Não pagos"
              value={formatBRL(valorNaoPago)}
              sub={isPP ? `H.O. não pago: ${formatBRL(valorHONaoPago)}` : `${totalNaoPagos} acordos`}
              icon={AlertCircle}
              color="text-destructive"
              bg="bg-destructive/10"
              delay={0.18}
            />
            <KpiCard
              label="Taxa de conversão"
              value={`${txConversao}%`}
              sub={`${totalPendentes} pendentes`}
              icon={CheckCircle2}
              color="text-chart-3"
              bg="bg-chart-3/10"
              delay={0.24}
            />
          </>
        )}
      </div>

      {/* ── KPIs PaguePlay: distribuição H.O./Coren/Cofen ─────────────────────── */}
      {isPP && !loading && valorRecebidoMes > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
            {/* Glass shimmer background */}
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-violet-500/5 pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-orange-500/5 blur-3xl pointer-events-none" />

            <div className="relative p-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <Percent className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Distribuição de Receita — PaguePlay</h3>
                  <p className="text-[11px] text-muted-foreground">Quebra do valor bruto recebido entre H.O., Coren e Cofen</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {/* H.O. */}
                <div className="p-4 rounded-xl border border-orange-500/25 bg-gradient-to-br from-orange-500/8 to-orange-500/3 hover:border-orange-500/40 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/20">
                      <Banknote className="w-3.5 h-3.5 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-orange-600 dark:text-orange-400">H.O. PaguePlay</p>
                      <p className="text-[10px] text-muted-foreground">{(PP_HO_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold font-mono text-orange-500 leading-none">{formatBRL(valorHOMes)}</p>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Agendado H.O.</span>
                      <span className="font-mono font-semibold">{formatBRL(valorHOAgendado)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-orange-500/15 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-orange-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${valorHOAgendado > 0 ? Math.min(Math.round((valorHOMes / valorHOAgendado) * 100), 100) : 0}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                  {meta && (
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Meta H.O.:</span>
                      <span className={cn('font-bold', percMeta >= 100 ? 'text-success' : percMeta >= 70 ? 'text-warning' : 'text-destructive')}>
                        {formatBRL(meta.meta_valor)} ({percMeta}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* Coren */}
                <div className="p-4 rounded-xl border border-blue-500/25 bg-gradient-to-br from-blue-500/8 to-blue-500/3 hover:border-blue-500/40 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/20">
                      <PiggyBank className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Repasse Coren</p>
                      <p className="text-[10px] text-muted-foreground">{(PP_COREN_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold font-mono text-blue-500 leading-none">{formatBRL(valorCorenMes)}</p>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Coren agendado</span>
                      <span className="font-mono font-semibold">{formatBRL(valorCorenAge)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-blue-500/15 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${valorCorenAge > 0 ? Math.min(Math.round((valorCorenMes / valorCorenAge) * 100), 100) : 0}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Não pago: <span className="font-mono font-semibold text-destructive">{formatBRL(valorNaoPago * PP_COREN_PERCENTUAL)}</span>
                  </p>
                </div>

                {/* Cofen */}
                <div className="p-4 rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/8 to-violet-500/3 hover:border-violet-500/40 transition-colors">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/20">
                      <PiggyBank className="w-3.5 h-3.5 text-violet-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-violet-600 dark:text-violet-400">Repasse Cofen</p>
                      <p className="text-[10px] text-muted-foreground">{(PP_COFEN_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold font-mono text-violet-500 leading-none">{formatBRL(valorCofenMes)}</p>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Cofen agendado</span>
                      <span className="font-mono font-semibold">{formatBRL(valorCofenAge)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-violet-500/15 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-violet-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${valorCofenAge > 0 ? Math.min(Math.round((valorCofenMes / valorCofenAge) * 100), 100) : 0}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Não pago: <span className="font-mono font-semibold text-destructive">{formatBRL(valorNaoPago * PP_COFEN_PERCENTUAL)}</span>
                  </p>
                </div>
              </div>

              {/* Barra visual de distribuição animada */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Distribuição percentual do bruto recebido</p>
                <div className="flex h-5 rounded-xl overflow-hidden gap-px bg-muted/50">
                  <motion.div
                    className="h-full bg-orange-500 flex items-center justify-center"
                    style={{ width: `${(PP_HO_PERCENTUAL * 100).toFixed(1)}%` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                    title={`H.O. ${(PP_HO_PERCENTUAL * 100).toFixed(2)}%`}
                  >
                    <span className="text-[9px] font-bold text-white/90 hidden sm:block">{(PP_HO_PERCENTUAL * 100).toFixed(1)}%</span>
                  </motion.div>
                  <motion.div
                    className="h-full bg-blue-500 flex items-center justify-center"
                    style={{ width: `${(PP_COREN_PERCENTUAL * 100).toFixed(1)}%` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    title={`Coren ${(PP_COREN_PERCENTUAL * 100).toFixed(2)}%`}
                  >
                    <span className="text-[9px] font-bold text-white/90 hidden sm:block">{(PP_COREN_PERCENTUAL * 100).toFixed(1)}%</span>
                  </motion.div>
                  <motion.div
                    className="h-full bg-violet-500 flex items-center justify-center"
                    style={{ width: `${(PP_COFEN_PERCENTUAL * 100).toFixed(1)}%` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    title={`Cofen ${(PP_COFEN_PERCENTUAL * 100).toFixed(2)}%`}
                  >
                    <span className="text-[9px] font-bold text-white/90 hidden sm:block">{(PP_COFEN_PERCENTUAL * 100).toFixed(1)}%</span>
                  </motion.div>
                </div>
                <div className="flex gap-5 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />H.O. {(PP_HO_PERCENTUAL * 100).toFixed(2)}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Coren {(PP_COREN_PERCENTUAL * 100).toFixed(2)}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />Cofen {(PP_COFEN_PERCENTUAL * 100).toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── KPIs secundários ─────────────────────────────────────────────────── */}
      {!loading && (
        <>
          <SectionLabel>Métricas de performance</SectionLabel>
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
              label={isPP ? 'Projeção H.O./mês' : 'Projeção do mês'}
              value={projecaoMes > 0 ? formatBRL(projecaoMes) : '—'}
              sub={
                isPP && projecaoBruta > 0
                  ? `Bruto: ${formatBRL(projecaoBruta)} · ${diasPassados}/${diasNoMes} dias`
                  : `Base: ${diasPassados} de ${diasNoMes} dias`
              }
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
        </>
      )}

      {/* ── Meta do mês ─────────────────────────────────────────────────────── */}
      {meta && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden p-5">
            {/* Progress glow */}
            <div
              className="absolute inset-x-0 bottom-0 h-0.5 opacity-60"
              style={{
                background: `linear-gradient(to right, ${percMeta >= 100 ? '#22c55e' : percMeta >= 70 ? '#f59e0b' : '#ef4444'} ${percMeta}%, transparent ${percMeta}%)`
              }}
            />

            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-chart-5/10 border border-chart-5/20">
                  <Target className="w-4 h-4 text-chart-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {isPP ? 'Meta H.O. do mês' : 'Meta do mês'}
                  </h3>
                  <p className="text-[11px] text-muted-foreground capitalize">{mesNome}</p>
                </div>
              </div>
              <div className={cn(
                'px-3 py-1 rounded-full text-xs font-bold border',
                percMeta >= 100 ? 'text-success border-success/30 bg-success/10' :
                percMeta >= 70  ? 'text-warning border-warning/30 bg-warning/10' :
                'text-destructive border-destructive/30 bg-destructive/10'
              )}>
                {percMeta}% atingido
              </div>
            </div>

            {/* Gradient progress bar with milestone markers */}
            <div className="relative mb-3">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: percMeta >= 100
                      ? 'linear-gradient(to right, #16a34a, #22c55e)'
                      : percMeta >= 70
                        ? 'linear-gradient(to right, #d97706, #f59e0b)'
                        : 'linear-gradient(to right, #dc2626, #ef4444)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(percMeta, 100)}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                />
              </div>
              {/* Milestone markers */}
              {[25, 50, 75].map(milestone => (
                <div
                  key={milestone}
                  className="absolute top-0 h-3 w-px bg-background/60"
                  style={{ left: `${milestone}%` }}
                />
              ))}
            </div>

            {/* Milestone labels */}
            <div className="flex justify-between text-[10px] text-muted-foreground/50 mb-3 px-0">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span className="text-success font-semibold">
                {isPP ? `H.O. recebido: ${formatBRL(valorHOMes)}` : `${formatBRL(valorRecebidoMes)} recebido`}
              </span>
              <span className="text-muted-foreground">
                Meta: <span className="font-bold text-foreground">{formatBRL(meta.meta_valor)}</span>
              </span>
              {isPP && (
                <span className="text-muted-foreground text-[11px]">
                  Bruto: {formatBRL(valorRecebidoMes)} · Coren: {formatBRL(valorCorenMes)} · Cofen: {formatBRL(valorCofenMes)}
                </span>
              )}
            </div>

            {projecaoMes > 0 && (
              <div className={cn(
                'mt-3 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border w-fit',
                projecaoMes >= meta.meta_valor
                  ? 'text-success bg-success/8 border-success/20'
                  : 'text-warning bg-warning/8 border-warning/20'
              )}>
                {projecaoMes >= meta.meta_valor
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <AlertCircle className="w-3.5 h-3.5" />
                }
                {projecaoMes >= meta.meta_valor
                  ? `Projeção${isPP ? ' H.O.' : ''} indica atingimento da meta`
                  : `Projeção${isPP ? ' H.O.' : ''}: ${formatBRL(projecaoMes)} (${Math.round((projecaoMes / meta.meta_valor) * 100)}% da meta)`
                }
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Agendamento por setor e tipo ──────────────────────────────────────── */}
      <SectionLabel>Breakdown por setor</SectionLabel>

      <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Agendado por setor no mês</h3>
              <p className="text-[11px] text-muted-foreground">Clique no setor para expandir o detalhamento por tipo</p>
            </div>
          </div>
          {!loadingSetores && totalAgendadoGeral > 0 && (
            <div className="px-3 py-1 rounded-xl border border-primary/25 bg-primary/5 text-xs font-bold text-primary font-mono flex-shrink-0">
              {formatBRL(totalAgendadoGeral)}
            </div>
          )}
        </div>
        <div className="p-4 space-y-2">
          {loadingSetores ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : setoresAgendamento.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-6 h-6 opacity-30" />
              </div>
              <p className="text-sm font-medium">Nenhum dado de setor disponível</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Os dados aparecerão quando houver acordos no mês</p>
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
        </div>
      </div>

      {/* ── Distribuição por tipo de pagamento ────────────────────────────────── */}
      {!loading && distribuicaoPorTipo.length > 0 && (
        <>
          <SectionLabel>Distribuição por tipo de pagamento</SectionLabel>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Gráfico Donut moderno */}
            <div className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-chart-2/10 border border-chart-2/20">
                    <PieChart className="w-3.5 h-3.5 text-chart-2" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Distribuição por tipo</h3>
                </div>
              </div>
              <div className="p-4 relative">
                <ResponsiveContainer width="100%" height={240}>
                  <RechartsPie>
                    <Pie
                      data={distribuicaoPorTipo}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {distribuicaoPorTipo.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      formatter={(v) => <span className="text-[11px] text-foreground">{v}</span>}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
                {/* Center stat */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-10px' }}>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Total</p>
                    <p className="text-sm font-extrabold font-mono text-foreground leading-none mt-0.5">
                      {formatBRL(distribuicaoPorTipo.reduce((s, d) => s + d.value, 0))}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {distribuicaoPorTipo.reduce((s, d) => s + d.qtd, 0)} acordos
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabela de tipos com indicadores */}
            <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-chart-3/10 border border-chart-3/20">
                    <CreditCard className="w-3.5 h-3.5 text-chart-3" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Detalhamento por tipo</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {distribuicaoPorTipo.map((d, i) => {
                  const TipoIcon = TIPO_ICONS[d.tipo] ?? Landmark;
                  const percRec = d.value > 0 ? Math.round((d.recebido / d.value) * 100) : 0;
                  const totalValue = distribuicaoPorTipo.reduce((s, x) => s + x.value, 0);
                  const sharePerc = totalValue > 0 ? Math.round((d.value / totalValue) * 100) : 0;
                  return (
                    <div key={d.tipo} className="group">
                      <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-border/30 bg-background/40 hover:border-border/60 hover:bg-background/70 transition-all">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border"
                          style={{ background: `${d.fill}15`, borderColor: `${d.fill}30` }}
                        >
                          <TipoIcon className="w-4 h-4" style={{ color: d.fill }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-bold text-foreground truncate">{d.name}</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-muted-foreground">{sharePerc}%</span>
                              <p className="text-xs font-mono font-extrabold text-foreground">{formatBRL(d.value)}</p>
                            </div>
                          </div>
                          {/* Horizontal bar indicator */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: d.fill }}
                                initial={{ width: 0 }}
                                animate={{ width: `${percRec}%` }}
                                transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }}
                              />
                            </div>
                            <span className={cn(
                              'text-[10px] font-bold w-8 text-right tabular-nums',
                              percRec >= 80 ? 'text-success' : percRec >= 50 ? 'text-warning' : 'text-muted-foreground'
                            )}>{percRec}%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {d.qtd} acordos · <span className="text-success font-semibold">{formatBRL(d.recebido)}</span> recebido
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Gráfico de evolução diária ─────────────────────────────────────────── */}
      <SectionLabel>Evolução diária</SectionLabel>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg border" style={{ background: `${EVOL_AGENDADO}18`, borderColor: `${EVOL_AGENDADO}30` }}>
              <Activity className="w-3.5 h-3.5" style={{ color: EVOL_AGENDADO }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground capitalize">Evolução diária — {mesNome}</h3>
              <p className="text-[11px] text-muted-foreground">Agendado vs recebido por dia</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-2 rounded-sm" style={{ background: EVOL_RECEBIDO, opacity: 0.7 }} />
              Recebido
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-2 rounded-sm" style={{ background: EVOL_AGENDADO, opacity: 0.7 }} />
              Agendado
            </span>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <Skeleton className="h-[280px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={porDia} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EVOL_RECEBIDO} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={EVOL_RECEBIDO} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorAgeDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EVOL_AGENDADO} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={EVOL_AGENDADO} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.5} />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 10, fill: tickColor }}
                  stroke="transparent"
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: tickColor }}
                  stroke="transparent"
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="agendado"
                  name="Agendado"
                  stroke={EVOL_AGENDADO}
                  strokeWidth={1.5}
                  fill="url(#colorAgeDiretor)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="recebido"
                  name="Recebido"
                  stroke={EVOL_RECEBIDO}
                  strokeWidth={2.5}
                  fill="url(#colorRecDiretor)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* ── Rankings ─────────────────────────────────────────────────────────── */}
      <SectionLabel>Rankings de performance</SectionLabel>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Por equipe */}
        <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-chart-3/10 border border-chart-3/20">
                <Users2 className="w-3.5 h-3.5 text-chart-3" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Performance por equipe</h3>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
              </div>
            ) : porEquipe && porEquipe.length > 0 ? (
              <div className="space-y-2">
                {porEquipe.slice(0, 6).map((eq, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all hover:border-border/60',
                      i === 0 ? 'border-yellow-500/20 bg-yellow-500/5'
                      : i === 1 ? 'border-slate-400/20 bg-slate-400/5'
                      : i === 2 ? 'border-amber-600/20 bg-amber-600/5'
                      : 'border-border/30 bg-background/30'
                    )}
                  >
                    {/* Podium badge */}
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0 border',
                      i === 0 ? 'bg-yellow-400/20 text-yellow-600 border-yellow-400/30 shadow-sm shadow-yellow-400/20'
                      : i === 1 ? 'bg-slate-300/20 text-slate-500 border-slate-300/30'
                      : i === 2 ? 'bg-amber-600/20 text-amber-700 border-amber-600/30'
                      : 'bg-muted text-muted-foreground border-border/30'
                    )}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate text-foreground">{eq.nome}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-muted-foreground">{eq.acordos} pagos</span>
                          <span className="text-sm font-extrabold font-mono text-success">{formatBRL(eq.valor)}</span>
                        </div>
                      </div>
                      {eq.meta > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-600' : 'bg-primary')}
                              style={{ width: `${Math.min(eq.perc, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-9 text-right font-semibold">{eq.perc}%</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Users2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Nenhuma equipe cadastrada</p>
              </div>
            )}
          </div>
        </div>

        {/* Por operador */}
        <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-chart-1/10 border border-chart-1/20">
                <User className="w-3.5 h-3.5 text-chart-1" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Ranking de operadores</h3>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-2.5">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
              </div>
            ) : porOperador && porOperador.length > 0 ? (
              <div className="space-y-2">
                {porOperador.slice(0, 8).map((op, i) => {
                  const maxValor = porOperador[0]?.valor ?? 1;
                  const barWidth = maxValor > 0 ? Math.round((op.valor / maxValor) * 100) : 0;
                  return (
                    <motion.div
                      key={op.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-xl border transition-all hover:border-border/60',
                        i === 0 ? 'border-yellow-500/20 bg-yellow-500/5'
                        : i === 1 ? 'border-slate-400/20 bg-slate-400/5'
                        : i === 2 ? 'border-amber-600/20 bg-amber-600/5'
                        : 'border-border/30 bg-background/30'
                      )}
                    >
                      <span className={cn(
                        'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 border',
                        i === 0 ? 'bg-yellow-400/20 text-yellow-600 border-yellow-400/30 shadow-sm shadow-yellow-400/20'
                        : i === 1 ? 'bg-slate-300/20 text-slate-500 border-slate-300/30'
                        : i === 2 ? 'bg-amber-600/20 text-amber-700 border-amber-600/30'
                        : 'bg-muted text-muted-foreground border-border/30'
                      )}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground truncate">{op.nome}</span>
                          <span className="text-xs font-extrabold text-success font-mono flex-shrink-0">{formatBRL(op.valor)}</span>
                        </div>
                        {/* Bar race style indicator */}
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className={cn(
                              'h-full rounded-full',
                              i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-600' : 'bg-primary/60'
                            )}
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.04 + 0.1 }}
                          />
                        </div>
                        {op.meta > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{op.perc}% da meta</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Sem dados de operadores</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Comparativo mês anterior ─────────────────────────────────────────── */}
      {mesAnterior && !loading && (
        <>
          <SectionLabel>Comparativo mensal</SectionLabel>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-chart-4/10 border border-chart-4/20">
                  <Calendar className="w-3.5 h-3.5 text-chart-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Comparativo com mês anterior</h3>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3">
                {/* Agendado column */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Agendado</p>
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">
                      {isPP ? 'H.O. agendado atual' : 'Agendado atual'}
                    </p>
                    <p className="text-xl font-extrabold font-mono text-primary leading-none">
                      {isPP ? formatBRL(valorHOAgendado) : formatBRL(valorAgendadoMes)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {totalAcordosMes} acordos{isPP ? ` · bruto ${formatBRL(valorAgendadoMes)}` : ''}
                    </p>
                  </div>
                  {/* Arrow connector */}
                  <div className="flex items-center justify-center gap-2 py-1">
                    {deltaAgendado !== null && (
                      <div className={cn(
                        'flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border',
                        deltaAgendado >= 0
                          ? 'text-success bg-success/10 border-success/25'
                          : 'text-destructive bg-destructive/10 border-destructive/25'
                      )}>
                        {deltaAgendado >= 0
                          ? <ArrowUpRight className="w-3 h-3" />
                          : <ArrowDownRight className="w-3 h-3" />
                        }
                        {deltaAgendado > 0 ? '+' : ''}{deltaAgendado}%
                      </div>
                    )}
                  </div>
                  <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">
                      {isPP ? 'H.O. agendado anterior' : 'Agendado anterior'}
                    </p>
                    <p className="text-xl font-extrabold font-mono text-muted-foreground leading-none">
                      {isPP
                        ? formatBRL(mesAnterior.valorAgendado * PP_HO_PERCENTUAL)
                        : formatBRL(mesAnterior.valorAgendado)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">{mesAnterior.totalAcordos} acordos</p>
                  </div>
                </div>

                {/* Recebido column */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Recebido</p>
                  <div className="p-4 rounded-xl border border-success/20 bg-success/5">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">
                      {isPP ? 'H.O. recebido atual' : 'Recebido atual'}
                    </p>
                    <p className="text-xl font-extrabold font-mono text-success leading-none">
                      {isPP ? formatBRL(valorHOMes) : formatBRL(valorRecebidoMes)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {totalPagosMes} pagos{isPP ? ` · bruto ${formatBRL(valorRecebidoMes)}` : ''}
                    </p>
                  </div>
                  {/* Arrow connector */}
                  <div className="flex items-center justify-center gap-2 py-1">
                    {deltaRecebido !== null && (
                      <div className={cn(
                        'flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border',
                        deltaRecebido >= 0
                          ? 'text-success bg-success/10 border-success/25'
                          : 'text-destructive bg-destructive/10 border-destructive/25'
                      )}>
                        {deltaRecebido >= 0
                          ? <ArrowUpRight className="w-3 h-3" />
                          : <ArrowDownRight className="w-3 h-3" />
                        }
                        {deltaRecebido > 0 ? '+' : ''}{deltaRecebido}%
                      </div>
                    )}
                  </div>
                  <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">
                      {isPP ? 'H.O. recebido anterior' : 'Recebido anterior'}
                    </p>
                    <p className="text-xl font-extrabold font-mono text-muted-foreground leading-none">
                      {isPP
                        ? formatBRL(mesAnterior.valorRecebido * PP_HO_PERCENTUAL)
                        : formatBRL(mesAnterior.valorRecebido)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">mês passado</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* ── Status breakdown ──────────────────────────────────────────────────── */}
      {!loading && porStatus.length > 0 && (
        <>
          <SectionLabel>Distribuição por status</SectionLabel>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted border border-border/40">
                  <BarChart3 className="w-3.5 h-3.5 text-foreground/70" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Acordos do mês por status</h3>
              </div>
              <div className="px-3 py-1 rounded-full bg-muted border border-border/30 text-[11px] font-semibold text-muted-foreground">
                {porStatus.reduce((s, e) => s + e.value, 0)} acordos
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Horizontal stacked bar total */}
              {(() => {
                const total = porStatus.reduce((s, e) => s + e.value, 0);
                return (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Composição total</p>
                    <div className="flex h-4 rounded-xl overflow-hidden gap-px bg-muted/30">
                      {porStatus.map((entry, i) => {
                        const pct = total > 0 ? (entry.value / total) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <motion.div
                            key={entry.name}
                            className="h-full"
                            style={{ background: entry.color, width: `${pct}%` }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5, delay: i * 0.1 }}
                            title={`${entry.name}: ${Math.round(pct)}%`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 flex-wrap">
                      {porStatus.map((entry) => {
                        const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                        return (
                          <span key={entry.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ background: entry.color }} />
                            {entry.name} <span className="font-bold" style={{ color: entry.color }}>{pct}%</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Animated progress sections */}
              <div className="space-y-3 pt-2">
                {(() => {
                  const total = porStatus.reduce((s, e) => s + e.value, 0);
                  return porStatus.map((entry, idx) => {
                    const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                    const StatusIcon =
                      entry.icon === 'check' ? CheckCircle2 :
                      entry.icon === 'clock' ? Clock :
                      AlertCircle;
                    return (
                      <div key={entry.name} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: entry.color }} />
                            <span className="text-sm font-semibold text-foreground">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-muted-foreground">{entry.value} acordos</span>
                            <span
                              className="text-sm font-extrabold tabular-nums w-10 text-right"
                              style={{ color: entry.color }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: entry.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut', delay: idx * 0.08 }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Mini bar chart */}
              <div className="pt-3 border-t border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Comparativo visual</p>
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart
                    data={porStatus}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    barCategoryGap="30%"
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: tickColor, fontWeight: 500 }}
                      stroke="transparent"
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.06)', radius: 6 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const total = porStatus.reduce((s, e) => s + e.value, 0);
                        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                        return (
                          <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm p-2.5 shadow-xl text-xs">
                            <p className="font-bold text-popover-foreground mb-1" style={{ color: d.color }}>
                              {d.name}
                            </p>
                            <p className="text-popover-foreground">{d.value} acordos <span className="text-muted-foreground">({pct}%)</span></p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={64}>
                      {porStatus.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        </>
      )}

    </div>
  );
}
