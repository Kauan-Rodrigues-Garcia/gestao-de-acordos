/**
 * AnalyticsPanel.tsx — v4 (Premium Redesign)
 * Substituição do PieChart de status pelo "Anel com Breakdown":
 *   • Anel central: % da meta de valor atingida (ou % dos acordos pagos se sem meta)
 *   • Ao expandir (clicar "Ver Breakdown"): mostra % por forma de pagamento
 *   Lógica de formas de pagamento adaptada por empresa (PaguePlay vs Bookplay)
 */

import { useState, useMemo, useEffect } from 'react';
import { useAxisColors } from '@/hooks/useChartColors';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, TrendingUp, DollarSign, Calendar, Target,
  ChevronDown, ChevronUp, RefreshCw, XCircle,
  Clock, Award, Percent, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  isPaguePlay, formatCurrency, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
  getTodayISO, PP_HO_PERCENTUAL, PP_COREN_PERCENTUAL, PP_COFEN_PERCENTUAL,
} from '@/lib/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Cores para o breakdown de formas de pagamento
const BREAKDOWN_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6',
];

// Cores fixas para gráficos de área — legíveis em qualquer tema (claro/escuro)
const CHART_RECEBIDO = '#22c55e'; // verde — sempre visível
const CHART_AGENDADO = '#6366f1'; // indigo — contraste universal

// Medalhas para o ranking
const MEDAL_STYLES = [
  { bg: 'bg-amber-400/20', text: 'text-amber-500', border: 'border-amber-400/40', label: '1' },
  { bg: 'bg-slate-300/20', text: 'text-slate-400', border: 'border-slate-300/40', label: '2' },
  { bg: 'bg-orange-400/20', text: 'text-orange-500', border: 'border-orange-400/40', label: '3' },
];

// Variantes de animação
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub: Tooltip customizado
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-xl text-xs text-popover-foreground">
      <p className="font-semibold mb-1.5 text-foreground">Dia {label}</p>
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold tabular-nums font-mono" style={{ color: entry.color }}>
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: Skeleton cards
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 animate-pulse overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-muted/60" />
      <div className="h-3 w-20 rounded-md bg-muted mb-3" />
      <div className="h-7 w-28 rounded-md bg-muted mb-2" />
      <div className="h-2.5 w-16 rounded-md bg-muted/60" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: MetricCard — Premium with colored border accent
// ─────────────────────────────────────────────────────────────────────────────

type TrendDirection = 'up' | 'down' | 'neutral';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  sub?: string;
  accentColor?: string;
  trend?: TrendDirection;
  gradientFrom?: string;
}

function MetricCard({
  label,
  value,
  icon,
  sub,
  accentColor = '#6366f1',
  trend,
  gradientFrom,
}: MetricCardProps) {
  const TrendIcon =
    trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-500'
      : trend === 'down'
      ? 'text-red-400'
      : 'text-muted-foreground/60';

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
      className="group relative flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card overflow-hidden p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
    >
      {/* Colored left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: accentColor }}
      />
      {/* Subtle gradient background tint */}
      {gradientFrom && (
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top left, ${gradientFrom} 0%, transparent 70%)`,
          }}
        />
      )}
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {trend && (
            <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />
          )}
          <span
            className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
            style={{ color: accentColor + 'aa' }}
          >
            {icon}
          </span>
        </div>
      </div>
      <div className="text-xl font-bold leading-tight tracking-tight pl-1 font-mono tabular-nums">
        {value}
      </div>
      {sub && (
        <span className="text-[11px] text-muted-foreground pl-1 leading-snug">{sub}</span>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: DonutChart — anel central com label no meio
// ─────────────────────────────────────────────────────────────────────────────

interface DonutChartProps {
  percent: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}

function DonutChart({ percent, label, sublabel, color = '#6366f1', size = 180 }: DonutChartProps) {
  const clampedPerc = Math.min(percent, 100);
  const data = [
    { value: clampedPerc },
    { value: Math.max(100 - clampedPerc, 0) },
  ];

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.33}
            outerRadius={size * 0.46}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            dataKey="value"
            strokeWidth={0}
            isAnimationActive={true}
            animationBegin={80}
            animationDuration={900}
            animationEasing="ease-out"
          >
            <Cell fill={clampedPerc >= 100 ? '#22c55e' : color} />
            <Cell fill="rgba(148,163,184,0.15)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Inner glow ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: size * 0.64,
          height: size * 0.64,
          boxShadow: `0 0 0 2px ${color}22 inset`,
        }}
      />
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-extrabold leading-none tabular-nums tracking-tight">
          {percent > 0 ? `${Math.min(percent, 999)}%` : '—'}
        </span>
        {sublabel && (
          <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight max-w-[80px]">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: Mini sparkline bar (header)
// ─────────────────────────────────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: Array<{ value: number }>; color: string }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-5">
      {data.slice(-12).map((d, i) => (
        <div
          key={i}
          className="w-1 rounded-sm transition-all duration-300"
          style={{
            height: `${Math.max((d.value / max) * 100, 8)}%`,
            background: color,
            opacity: 0.4 + (i / 12) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyticsPanelProps {
  setorFiltro?: string | null;
  /** Equipe específica para Líder/Elite filtrarem por equipe */
  equipeFiltroExterno?: string | null;
  /** Operador individual para Elite em visão individual */
  operadorFiltroExterno?: string | null;
}

export function AnalyticsPanel({ setorFiltro: setorExterno, equipeFiltroExterno, operadorFiltroExterno }: AnalyticsPanelProps = {}) {
  const { tickColor, gridColor } = useAxisColors();
  const { perfil } = useAuth();
  const { tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);
  // Bookplay (não-PaguePay): analytics sempre expandido, sem botão de ocultar
  const alwaysOpen = !isPP;
  const [open, setOpen] = useState(() => !isPP);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const {
    valorRecebidoMes,
    valorAgendadoMes,
    valorNaoPago,
    valorAgendadoHoje,
    valorHOMes,
    valorHOAgendado,
    totalAcordosMes,
    totalPagosMes,
    totalNaoPagos,
    totalPendentes,
    meta,
    percMeta,
    porDia,
    porOperador,
    acordosMes,
    loading,
    refetch,
    setSetorFiltro,
    setEquipeFiltro,
    setOperadorFiltro,
  } = useAnalytics();

  // Para PaguePlay: exibir H.O. como valor principal
  const valorPrincipal  = isPP ? valorHOMes     : valorRecebidoMes;
  const valorAgendadoPP = isPP ? valorHOAgendado : valorAgendadoMes;
  const labelRecebido   = isPP ? '🟠 H.O. recebido no mês' : '💰 Recebido no mês';
  const labelAgendado   = isPP ? '📅 H.O. agendado no mês' : '📅 Agendado no mês';
  const labelMeta       = isPP ? '🎯 Meta H.O.' : '🎯 Meta';
  // Gráfico de área: PaguePlay usa H.O. como linha "recebido"
  const porDiaChart = isPP
    ? porDia.map(d => ({ ...d, recebido: d.ho }))
    : porDia;

  // Sincronizar filtro de setor externo
  useEffect(() => {
    if (setorExterno !== undefined) {
      setSetorFiltro(setorExterno ?? null);
    }
  }, [setorExterno]);

  // Sincronizar filtro de equipe externo (Líder/Elite)
  useEffect(() => {
    if (equipeFiltroExterno !== undefined) {
      setEquipeFiltro(equipeFiltroExterno ?? null);
    }
  }, [equipeFiltroExterno]);

  // Sincronizar filtro de operador externo (Elite individual)
  useEffect(() => {
    if (operadorFiltroExterno !== undefined) {
      setOperadorFiltro(operadorFiltroExterno ?? null);
    }
  }, [operadorFiltroExterno]);

  const isAdmin = perfil?.perfil === 'administrador' || perfil?.perfil === 'super_admin';
  const isLider = perfil?.perfil === 'lider';

  const { mes, ano } = useMemo(() => {
    const d = new Date();
    return { mes: d.getMonth() + 1, ano: d.getFullYear() };
  }, []);

  // ── % por forma de pagamento ────────────────────────────────────────────────
  const porTipo = useMemo(() => {
    if (!acordosMes?.length) return [];
    const tipoLabels = isPP ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS;

    const map: Record<string, { label: string; acordos: number; valor: number }> = {};
    for (const a of acordosMes) {
      const tipo = (a as any).tipo as string;
      if (!tipo) continue;

      let key = tipo;
      let label: string;
      if (isPP && (tipo === 'boleto' || tipo === 'pix')) {
        key = 'boleto_pix';
        label = 'Boleto/PIX';
      } else if (isPP && tipo === 'cartao') {
        key = 'cartao';
        label = 'Cartão de Crédito';
      } else {
        label = tipoLabels[tipo] ?? tipo;
      }

      if (!map[key]) map[key] = { label, acordos: 0, valor: 0 };
      map[key].acordos++;
      map[key].valor += Number((a as any).valor) || 0;
    }

    const total = acordosMes.length || 1;
    return Object.values(map)
      .map(item => ({
        label: item.label,
        acordos: item.acordos,
        valor: item.valor,
        perc: Math.round((item.acordos / total) * 100),
      }))
      .sort((a, b) => b.acordos - a.acordos);
  }, [acordosMes, isPP]);

  // ── Métricas adicionais ─────────────────────────────────────────────────────
  const taxaConversao = totalAcordosMes > 0
    ? Math.round((totalPagosMes / totalAcordosMes) * 100)
    : 0;

  const ticketMedio = totalPagosMes > 0
    ? valorRecebidoMes / totalPagosMes
    : 0;

  const hoje = getTodayISO();
  const acordosAtrasados = useMemo(() => {
    return (acordosMes ?? []).filter(
      a => (a as any).status === 'verificar_pendente' && (a as any).vencimento < hoje,
    ).length;
  }, [acordosMes, hoje]);

  const projecaoMes = useMemo(() => {
    const diaAtual = new Date().getDate();
    const diasTotais = new Date(ano, mes, 0).getDate();
    if (diaAtual === 0) return 0;
    return Math.round((valorRecebidoMes / diaAtual) * diasTotais);
  }, [valorRecebidoMes, mes, ano]);

  // ── Cor do anel central baseada no percentual ──────────────────────────────
  const donutColor = percMeta >= 100
    ? '#22c55e'          // verde: meta batida
    : percMeta >= 70
    ? '#6366f1'          // primário: bom progresso
    : percMeta >= 40
    ? '#f59e0b'          // amarelo: progresso médio
    : '#ef4444';         // vermelho: abaixo de 40%

  // percentual que aparece no anel:
  // • Se há meta definida → % do valor recebido vs meta
  // • Se não há meta → % de acordos pagos vs total
  const donutPercent = meta
    ? percMeta
    : totalAcordosMes > 0
    ? Math.round((totalPagosMes / totalAcordosMes) * 100)
    : 0;

  const donutSublabel = meta ? 'da meta' : 'pagos';

  // ── Formatação compacta de moeda para eixo Y ───────────────────────────────
  function formatYAxis(value: number) {
    if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}k`;
    return `R$${value}`;
  }

  // ── Sparkline data for header ──────────────────────────────────────────────
  const sparklineData = porDiaChart.map(d => ({ value: d.recebido ?? 0 }));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Header compacto sempre visível ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/70 bg-card shadow-sm"
      >
        {/* Left: title + period */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
              <BarChart2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold leading-none">Dados Analíticos</span>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                {MESES[mes - 1]} {ano}
              </p>
            </div>
          </div>

          {/* Mini sparkline — desktop only */}
          {!loading && sparklineData.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-3 border-l border-border/60">
              <MiniSparkline data={sparklineData} color={CHART_RECEBIDO} />
              <span className="text-[11px] text-muted-foreground">ritmo</span>
            </div>
          )}
        </div>

        {/* Center: live summary — desktop */}
        {!loading && (
          <div className="hidden md:flex items-center gap-5 text-xs">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {isPP ? 'H.O.' : 'Recebido'}
              </span>
              <span className="font-bold text-emerald-500 tabular-nums font-mono">
                {formatCurrency(valorPrincipal)}
              </span>
            </div>
            {isPP && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Bruto</span>
                <span className="font-semibold tabular-nums font-mono">{formatCurrency(valorRecebidoMes)}</span>
              </div>
            )}
            {!isPP && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Agendado</span>
                <span className="font-semibold tabular-nums font-mono">{formatCurrency(valorAgendadoMes)}</span>
              </div>
            )}
            {meta && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Meta</span>
                <span
                  className="font-bold tabular-nums font-mono"
                  style={{ color: donutColor }}
                >
                  {percMeta}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={refetch}
            disabled={loading}
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', loading && 'animate-spin')} />
          </Button>
          {/* Botão visível apenas na PaguePay — Bookplay fica sempre expandido */}
          {!alwaysOpen && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 rounded-lg border-border/70"
              onClick={() => setOpen(v => !v)}
            >
              {open ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Ver Analíticos
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Painel expandido ── */}
      <AnimatePresence>
        {(open || alwaysOpen) && (
          <motion.div
            key="analytics-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4 pt-1"
            >

              {/* ── ROW 1 — 6 cards métricas principais ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                ) : (
                  <>
                    {/* Card 1: H.O. (PaguePlay) ou Recebido (Bookplay) */}
                    <MetricCard
                      label={labelRecebido}
                      icon={<DollarSign className="w-4 h-4" />}
                      accentColor="#22c55e"
                      gradientFrom="#22c55e"
                      trend="up"
                      value={
                        <span className="text-emerald-500">
                          {formatCurrency(valorPrincipal)}
                        </span>
                      }
                      sub={
                        isPP
                          ? `Bruto: ${formatCurrency(valorRecebidoMes)} · ${totalPagosMes} pagos`
                          : `${totalPagosMes} acordos pagos`
                      }
                    />
                    {/* Card 2 */}
                    <MetricCard
                      label={labelAgendado}
                      icon={<Calendar className="w-4 h-4" />}
                      accentColor="#6366f1"
                      gradientFrom="#6366f1"
                      trend="neutral"
                      value={formatCurrency(valorAgendadoPP)}
                      sub={
                        isPP
                          ? `Bruto: ${formatCurrency(valorAgendadoMes)} · ${totalAcordosMes} acordos`
                          : `${totalAcordosMes} acordos`
                      }
                    />
                    {/* Card 3 */}
                    <MetricCard
                      label="Não Pagos"
                      icon={<XCircle className="w-4 h-4" />}
                      accentColor="#ef4444"
                      gradientFrom="#ef4444"
                      trend={valorNaoPago > 0 ? 'down' : 'neutral'}
                      value={
                        <span className="text-red-500">
                          {formatCurrency(valorNaoPago)}
                        </span>
                      }
                      sub={`${totalNaoPagos} acordos`}
                    />
                    {/* Card 4 */}
                    <MetricCard
                      label="Agendado hoje"
                      icon={<Clock className="w-4 h-4" />}
                      accentColor="#f59e0b"
                      gradientFrom="#f59e0b"
                      value={formatCurrency(valorAgendadoHoje)}
                    />
                    {/* Card 5 */}
                    <MetricCard
                      label="Acordos no mês"
                      icon={<BarChart2 className="w-4 h-4" />}
                      accentColor="#3b82f6"
                      gradientFrom="#3b82f6"
                      value={String(totalAcordosMes)}
                      sub={`${totalPendentes} pendentes`}
                    />
                    {/* Card 6: Meta */}
                    <MetricCard
                      label={labelMeta}
                      icon={<Target className="w-4 h-4" />}
                      accentColor={donutColor}
                      gradientFrom={donutColor}
                      trend={meta ? (percMeta >= 100 ? 'up' : percMeta >= 50 ? 'neutral' : 'down') : undefined}
                      value={
                        meta ? (
                          <span style={{ color: donutColor }}>{percMeta}% atingida</span>
                        ) : (
                          <span className="text-muted-foreground text-base">—</span>
                        )
                      }
                      sub={
                        meta
                          ? `${formatCurrency(valorPrincipal)} / ${formatCurrency(meta.meta_valor)}`
                          : 'Sem meta definida'
                      }
                    />

                    {/* Cards extras PaguePlay: Coren + Cofen */}
                    {isPP && valorRecebidoMes > 0 && (
                      <>
                        <MetricCard
                          label="Repasse Coren"
                          icon={<Percent className="w-4 h-4" />}
                          accentColor="#3b82f6"
                          gradientFrom="#3b82f6"
                          value={
                            <span className="text-blue-500">
                              {formatCurrency(valorRecebidoMes * PP_COREN_PERCENTUAL)}
                            </span>
                          }
                          sub="56,28% do bruto recebido"
                        />
                        <MetricCard
                          label="Repasse Cofen"
                          icon={<Percent className="w-4 h-4" />}
                          accentColor="#8b5cf6"
                          gradientFrom="#8b5cf6"
                          value={
                            <span className="text-violet-500">
                              {formatCurrency(valorRecebidoMes * PP_COFEN_PERCENTUAL)}
                            </span>
                          }
                          sub="18,76% do bruto recebido"
                        />
                      </>
                    )}
                  </>
                )}
              </div>

              {/* ── ROW 2 — Gráficos (AreaChart + Anel com Breakdown) ── */}
              {!loading && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* AreaChart — Recebido vs Agendado por dia */}
                  <Card className="border-border/70 bg-card shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm font-semibold text-foreground">
                          {isPP ? 'H.O. vs Agendado — por dia' : 'Recebido vs Agendado — por dia'}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-3 h-[3px] rounded-full"
                              style={{ background: CHART_RECEBIDO }}
                            />
                            {isPP ? 'H.O.' : 'Recebido'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-3 h-[3px] rounded-full"
                              style={{ background: CHART_AGENDADO }}
                            />
                            Agendado
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-2 pb-4">
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={porDiaChart} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_RECEBIDO} stopOpacity={0.45} />
                              <stop offset="100%" stopColor={CHART_RECEBIDO} stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="colorAge" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_AGENDADO} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={CHART_AGENDADO} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis
                            dataKey="dia"
                            tick={{ fontSize: 10, fill: tickColor }}
                            stroke="transparent"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: tickColor }}
                            stroke="transparent"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatYAxis}
                            width={52}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ stroke: tickColor, strokeWidth: 1, strokeDasharray: '4 2' }} />
                          <Area
                            type="monotone"
                            dataKey="agendado"
                            name="Agendado"
                            stroke={CHART_AGENDADO}
                            fill="url(#colorAge)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: CHART_AGENDADO, strokeWidth: 0 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="recebido"
                            name="Recebido"
                            stroke={CHART_RECEBIDO}
                            fill="url(#colorRec)"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5, fill: CHART_RECEBIDO, strokeWidth: 0 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* ── ANEL COM BREAKDOWN ── */}
                  <Card className="border-border/70 bg-card shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <div
                            className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
                            style={{ background: donutColor + '22' }}
                          >
                            <Target className="w-3.5 h-3.5" style={{ color: donutColor }} />
                          </div>
                          {meta ? 'Meta — % Atingida' : 'Acordos Pagos — % do Mês'}
                        </CardTitle>
                        {porTipo.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2"
                            onClick={() => setBreakdownOpen(v => !v)}
                          >
                            {breakdownOpen ? 'Resumo' : 'Ver Breakdown'}
                            <ChevronRight
                              className={cn('w-3 h-3 transition-transform duration-200', breakdownOpen && 'rotate-90')}
                            />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pb-5">
                      <AnimatePresence mode="wait">
                        {!breakdownOpen ? (
                          <motion.div
                            key="donut-main"
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.22 }}
                            className="flex flex-col items-center gap-4"
                          >
                            {/* Anel central */}
                            <DonutChart
                              percent={donutPercent}
                              label={`${donutPercent}%`}
                              sublabel={donutSublabel}
                              color={donutColor}
                              size={180}
                            />

                            {/* Legenda sumário */}
                            {meta && (
                              <div className="text-center space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-mono tabular-nums font-semibold text-foreground">
                                    {formatCurrency(valorRecebidoMes)}
                                  </span>
                                  {' '}de{' '}
                                  <span className="font-mono tabular-nums">
                                    {formatCurrency(meta.meta_valor)}
                                  </span>
                                </p>
                                {percMeta >= 100 && (
                                  <p className="text-xs font-semibold text-emerald-500 flex items-center justify-center gap-1">
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                    Meta atingida!
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Top formas de pagamento em preview */}
                            {porTipo.length > 0 && (
                              <div className="w-full space-y-2 pt-3 border-t border-border/60">
                                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                                  Top formas de pagamento
                                </p>
                                {porTipo.slice(0, 2).map((t, i) => (
                                  <div key={t.label} className="flex items-center gap-2.5">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-card"
                                      style={{
                                        background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
                                        ringColor: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] + '55',
                                      }}
                                    />
                                    <span className="text-xs flex-1 truncate font-medium">{t.label}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-muted-foreground">{t.acordos} ac.</span>
                                      <span
                                        className="text-xs font-bold tabular-nums font-mono px-1.5 py-0.5 rounded"
                                        style={{
                                          background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] + '18',
                                          color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
                                        }}
                                      >
                                        {t.perc}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                                {porTipo.length > 2 && (
                                  <p className="text-[11px] text-muted-foreground pl-0.5">
                                    +{porTipo.length - 2} mais — clique em "Ver Breakdown"
                                  </p>
                                )}
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="donut-breakdown"
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.22 }}
                            className="space-y-4"
                          >
                            {/* Mini-anel por forma de pagamento */}
                            {porTipo.length > 0 && (
                              <div className="flex flex-col items-center">
                                <ResponsiveContainer width="100%" height={150}>
                                  <PieChart>
                                    <Pie
                                      data={porTipo}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={44}
                                      outerRadius={68}
                                      paddingAngle={3}
                                      dataKey="acordos"
                                      isAnimationActive={true}
                                      animationBegin={60}
                                      animationDuration={700}
                                    >
                                      {porTipo.map((_, i) => (
                                        <Cell
                                          key={i}
                                          fill={BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]}
                                          stroke="transparent"
                                        />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{
                                        borderRadius: '10px',
                                        border: '1px solid rgba(148,163,184,0.2)',
                                        background: 'var(--popover)',
                                        color: 'var(--popover-foreground)',
                                        fontSize: '11px',
                                        padding: '6px 10px',
                                      }}
                                      formatter={(val: number, name: string, props: any) => [
                                        `${val} acordos (${props.payload?.perc ?? 0}%)`,
                                        props.payload?.label ?? name,
                                      ]}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                            {/* Legenda detalhada — horizontal progress bars */}
                            <div className="space-y-3">
                              {porTipo.map((tipo, i) => {
                                const color = BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length];
                                return (
                                  <div key={tipo.label} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{ background: color }}
                                        />
                                        <span className="font-medium">{tipo.label}</span>
                                      </div>
                                      <div className="flex items-center gap-3 text-muted-foreground">
                                        <span className="tabular-nums">{tipo.acordos} ac.</span>
                                        <span
                                          className="font-bold tabular-nums font-mono"
                                          style={{ color }}
                                        >
                                          {tipo.perc}%
                                        </span>
                                      </div>
                                    </div>
                                    {/* Progress bar with colored fill */}
                                    <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${tipo.perc}%` }}
                                        transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.08 }}
                                        className="h-full rounded-full"
                                        style={{ background: `linear-gradient(90deg, ${color}bb, ${color})` }}
                                      />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground text-right tabular-nums font-mono">
                                      {formatCurrency(tipo.valor)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* ── ROW 3 — Métricas adicionais ── */}
              {!loading && (
                <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Taxa de conversão */}
                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className={cn(
                      'relative flex flex-col gap-2 rounded-xl border p-4 overflow-hidden shadow-sm',
                      taxaConversao >= 70
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : taxaConversao >= 40
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-red-500/30 bg-red-500/5',
                    )}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                      style={{
                        background:
                          taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Taxa de conversão
                      </span>
                      <Percent
                        className="w-3.5 h-3.5"
                        style={{
                          color: taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span
                      className="text-2xl font-extrabold tabular-nums font-mono pl-1"
                      style={{
                        color: taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444',
                      }}
                    >
                      {taxaConversao}%
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">
                      {totalPagosMes} de {totalAcordosMes} pagos
                    </span>
                  </motion.div>

                  {/* Ticket médio */}
                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className="relative flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 overflow-hidden shadow-sm"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-indigo-500" />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Ticket médio
                      </span>
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                    <span className="text-xl font-bold tabular-nums font-mono text-indigo-500 pl-1 leading-tight">
                      {formatCurrency(ticketMedio)}
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">por acordo pago</span>
                  </motion.div>

                  {/* Em atraso */}
                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className={cn(
                      'relative flex flex-col gap-2 rounded-xl border p-4 overflow-hidden shadow-sm',
                      acordosAtrasados > 0
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-border/70 bg-card',
                    )}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                      style={{ background: acordosAtrasados > 0 ? '#ef4444' : '#6366f1' }}
                    />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Em atraso
                      </span>
                      <Clock
                        className={cn(
                          'w-3.5 h-3.5',
                          acordosAtrasados > 0 ? 'text-red-500' : 'text-muted-foreground',
                        )}
                      />
                    </div>
                    <span
                      className={cn(
                        'text-2xl font-extrabold tabular-nums font-mono pl-1',
                        acordosAtrasados > 0 ? 'text-red-500' : 'text-foreground',
                      )}
                    >
                      {acordosAtrasados}
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">acordos vencidos</span>
                    {/* Pulse animation on concerning metrics */}
                    {acordosAtrasados > 5 && (
                      <span className="absolute top-3 right-3 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                    )}
                  </motion.div>

                  {/* Projeção do mês */}
                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className="relative flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 overflow-hidden shadow-sm"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-amber-500" />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Projeção do mês
                      </span>
                      <Target className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <span className="text-xl font-bold tabular-nums font-mono text-amber-500 pl-1 leading-tight">
                      {formatCurrency(projecaoMes)}
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">ritmo atual</span>
                  </motion.div>
                </motion.div>
              )}

              {/* ── ROW 4 — Ranking operadores (admin/líder) ── */}
              {!loading && (isAdmin || isLider) && porOperador && porOperador.length > 0 && (
                <motion.div variants={itemVariants}>
                  <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                    <CardHeader className="pb-3 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-400/15 shrink-0">
                          <Award className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        Ranking de Operadores
                        <span className="text-muted-foreground font-normal text-xs ml-1">
                          — {MESES[mes - 1]}/{ano}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                      {/* Compute max for bar scaling */}
                      {(() => {
                        const slice = porOperador.slice(0, 10);
                        const maxValor = Math.max(...slice.map(o => o.valor), 1);
                        return (
                          <div className="space-y-1.5">
                            {slice.map((op, i) => {
                              const medal = MEDAL_STYLES[i];
                              const barWidth = Math.max((op.valor / maxValor) * 100, 2);
                              const barColor =
                                i === 0
                                  ? '#f59e0b'
                                  : i === 1
                                  ? '#94a3b8'
                                  : i === 2
                                  ? '#f97316'
                                  : '#6366f1';

                              return (
                                <motion.div
                                  key={op.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.05, duration: 0.28 }}
                                  className="group flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-muted/40 transition-colors duration-150"
                                >
                                  {/* Rank badge */}
                                  <div
                                    className={cn(
                                      'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border shrink-0',
                                      i < 3
                                        ? `${medal.bg} ${medal.text} ${medal.border}`
                                        : 'bg-muted/40 text-muted-foreground border-border/50',
                                    )}
                                  >
                                    {i + 1}
                                  </div>

                                  {/* Name + bar */}
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold truncate">{op.nome}</span>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[11px] text-muted-foreground tabular-nums">
                                          {op.acordos} ac.
                                        </span>
                                        <span className="text-xs font-bold tabular-nums font-mono" style={{ color: barColor }}>
                                          {formatCurrency(op.valor)}
                                        </span>
                                      </div>
                                    </div>
                                    {/* Bar race track */}
                                    <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${barWidth}%` }}
                                        transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.07 }}
                                        className="h-full rounded-full"
                                        style={{
                                          background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                                        }}
                                      />
                                    </div>
                                    {/* Meta progress (if applicable) */}
                                    {op.meta > 0 && (
                                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <span className="text-[10px] text-muted-foreground">Meta:</span>
                                        <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                                          <div
                                            className="h-full rounded-full bg-emerald-500/70"
                                            style={{ width: `${Math.min(op.perc, 100)}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-semibold text-emerald-500 tabular-nums">
                                          {op.perc}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
