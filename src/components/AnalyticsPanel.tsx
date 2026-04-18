/**
 * AnalyticsPanel.tsx — v3
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
  Clock, Award, CreditCard, Percent, ChevronRight,
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
  getTodayISO,
} from '@/lib/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub: Tooltip customizado
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-2 shadow-md text-xs text-popover-foreground">
      <p className="font-semibold mb-1">Dia {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: Skeleton card
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted mb-2" />
      <div className="h-6 w-28 rounded bg-muted" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: MetricCard
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  sub?: string;
}

function MetricCard({ label, value, icon, sub }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        <span className="text-muted-foreground shrink-0">{icon}</span>
      </div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub: DonutChart — anel central com label no meio
// ─────────────────────────────────────────────────────────────────────────────

interface DonutChartProps {
  percent: number;       // 0–100 (ou mais)
  label: string;         // label principal dentro do anel
  sublabel?: string;     // sublabel secundário
  color?: string;        // cor do arco preenchido
  size?: number;         // tamanho em px
}

function DonutChart({ percent, label, sublabel, color = '#6366f1', size = 160 }: DonutChartProps) {
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
            innerRadius={size * 0.32}
            outerRadius={size * 0.46}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={clampedPerc >= 100 ? '#22c55e' : color} />
            <Cell fill="rgba(148,163,184,0.22)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Texto central sobreposto */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xl font-bold leading-none">
          {percent > 0 ? `${Math.min(percent, 999)}%` : '—'}
        </span>
        {sublabel && (
          <span className="text-[11px] text-muted-foreground mt-0.5 text-center leading-tight max-w-[70px]">
            {sublabel}
          </span>
        )}
      </div>
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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* ── Header compacto sempre visível ── */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Dados Analíticos</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            — {MESES[mes - 1]}/{ano}
          </span>
        </div>

        {!loading && (
          <div className="hidden md:flex items-center gap-4 text-xs">
            <span>
              Recebido:{'  '}
              <strong className="text-green-600 dark:text-green-400">
                {formatCurrency(valorRecebidoMes)}
              </strong>
            </span>
            <span>
              Agendado: <strong>{formatCurrency(valorAgendadoMes)}</strong>
            </span>
            {meta && (
              <span>
                Meta: <strong>{percMeta}%</strong>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={refetch} disabled={loading} title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
          {/* Botão visível apenas na PaguePay — Bookplay fica sempre expandido */}
          {!alwaysOpen && (
            <Button
              variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => setOpen(v => !v)}
            >
              {open ? (
                <><ChevronUp className="w-3 h-3" /> Ocultar</>
              ) : (
                <><ChevronDown className="w-3 h-3" /> Exibir Analíticos</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Painel expandido ── */}
      <AnimatePresence>
        {(open || alwaysOpen) && (
          <motion.div
            key="analytics-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">

              {/* ── ROW 1 — 6 cards métricas ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                ) : (
                  <>
                    <MetricCard
                      label="💰 Recebido no mês"
                      icon={<DollarSign className="w-4 h-4" />}
                      value={
                        <span className="text-green-600 dark:text-green-400">
                          {formatCurrency(valorRecebidoMes)}
                        </span>
                      }
                      sub={`${totalPagosMes} acordos pagos`}
                    />
                    <MetricCard
                      label="📅 Agendado no mês"
                      icon={<Calendar className="w-4 h-4" />}
                      value={formatCurrency(valorAgendadoMes)}
                      sub={`${totalAcordosMes} acordos`}
                    />
                    <MetricCard
                      label="❌ Não Pagos"
                      icon={<XCircle className="w-4 h-4" />}
                      value={
                        <span className="text-red-500/80">
                          {formatCurrency(valorNaoPago)}
                        </span>
                      }
                      sub={`${totalNaoPagos} acordos`}
                    />
                    <MetricCard
                      label="📆 Agendado hoje"
                      icon={<Clock className="w-4 h-4" />}
                      value={formatCurrency(valorAgendadoHoje)}
                    />
                    <MetricCard
                      label="📋 Acordos no mês"
                      icon={<BarChart2 className="w-4 h-4" />}
                      value={String(totalAcordosMes)}
                      sub={`${totalPendentes} pendentes`}
                    />
                    <MetricCard
                      label="🎯 Meta"
                      icon={<Target className="w-4 h-4" />}
                      value={meta ? `${percMeta}% atingida` : '—'}
                      sub={
                        meta
                          ? `${formatCurrency(valorRecebidoMes)} / ${formatCurrency(meta.meta_valor)}`
                          : 'Sem meta definida'
                      }
                    />
                  </>
                )}
              </div>

              {/* ── ROW 2 — Gráficos (AreaChart + Anel com Breakdown) ── */}
              {!loading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* AreaChart — Recebido vs Agendado por dia */}
                  <Card className="border-border bg-card">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">
                          Recebido vs Agendado — por dia
                        </CardTitle>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-0.5 rounded" style={{ background: CHART_RECEBIDO }} />
                            Recebido
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-0.5 rounded" style={{ background: CHART_AGENDADO }} />
                            Agendado
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-2 pb-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={porDia} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={CHART_RECEBIDO} stopOpacity={0.35} />
                              <stop offset="95%" stopColor={CHART_RECEBIDO} stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="colorAge" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={CHART_AGENDADO} stopOpacity={0.28} />
                              <stop offset="95%" stopColor={CHART_AGENDADO} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis
                            dataKey="dia"
                            tick={{ fontSize: 10, fill: tickColor }}
                            stroke="transparent"
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: tickColor }}
                            stroke="transparent"
                            tickLine={false}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Area
                            type="monotone" dataKey="agendado" name="Agendado"
                            stroke={CHART_AGENDADO} fill="url(#colorAge)" strokeWidth={2}
                          />
                          <Area
                            type="monotone" dataKey="recebido" name="Recebido"
                            stroke={CHART_RECEBIDO} fill="url(#colorRec)" strokeWidth={2.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* ── ANEL COM BREAKDOWN ── */}
                  <Card className="border-border bg-card/80 dark:bg-muted/20">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Target className="w-4 h-4 text-muted-foreground" />
                          {meta ? 'Meta — % Atingida' : 'Acordos Pagos — % do Mês'}
                        </CardTitle>
                        {porTipo.length > 0 && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setBreakdownOpen(v => !v)}
                          >
                            {breakdownOpen ? 'Ocultar' : 'Ver Breakdown'}
                            <ChevronRight className={cn('w-3 h-3 transition-transform', breakdownOpen && 'rotate-90')} />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <AnimatePresence mode="wait">
                        {!breakdownOpen ? (
                          <motion.div
                            key="donut-main"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col items-center gap-3"
                          >
                            {/* Anel central */}
                            <DonutChart
                              percent={donutPercent}
                              label={`${donutPercent}%`}
                              sublabel={donutSublabel}
                              color={donutColor}
                              size={160}
                            />

                            {/* Legenda sumário */}
                            {meta && (
                              <div className="text-center space-y-0.5">
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(valorRecebidoMes)} recebido de {formatCurrency(meta.meta_valor)}
                                </p>
                                {percMeta >= 100 && (
                                  <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                                    🎉 Meta atingida!
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Top 2 formas de pagamento em preview */}
                            {porTipo.length > 0 && (
                              <div className="w-full space-y-1.5 pt-1 border-t border-border">
                                <p className="text-[11px] text-muted-foreground font-medium">Top formas de pagamento</p>
                                {porTipo.slice(0, 2).map((t, i) => (
                                  <div key={t.label} className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
                                    />
                                    <span className="text-xs flex-1 truncate">{t.label}</span>
                                    <span className="text-xs font-semibold tabular-nums">{t.perc}%</span>
                                  </div>
                                ))}
                                {porTipo.length > 2 && (
                                  <p className="text-[11px] text-muted-foreground">
                                    +{porTipo.length - 2} mais → clique em "Ver Breakdown"
                                  </p>
                                )}
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="donut-breakdown"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                          >
                            {/* Mini-anel por forma de pagamento (Pie donut) */}
                            {porTipo.length > 0 && (
                              <div className="flex flex-col items-center">
                                <ResponsiveContainer width="100%" height={140}>
                                  <PieChart style={{ background: 'transparent' }}>
                                    <Pie
                                      data={porTipo}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={40}
                                      outerRadius={65}
                                      paddingAngle={2}
                                      dataKey="acordos"
                                    >
                                      {porTipo.map((_, i) => (
                                        <Cell
                                          key={i}
                                          fill={BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]}
                                        />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      formatter={(val: number, name: string, props: any) => [
                                        `${val} acordos (${props.payload?.perc ?? 0}%)`,
                                        props.payload?.label ?? name,
                                      ]}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                            {/* Legenda detalhada por forma de pagamento */}
                            <div className="space-y-2">
                              {porTipo.map((tipo, i) => (
                                <div key={tipo.label} className="space-y-0.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }}
                                      />
                                      <span className="font-medium">{tipo.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <span>{tipo.acordos} ac.</span>
                                      <span className="font-semibold text-foreground tabular-nums">{tipo.perc}%</span>
                                    </div>
                                  </div>
                                  <Progress
                                    value={tipo.perc}
                                    className="h-1.5"
                                    style={{ '--progress-color': BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] } as React.CSSProperties}
                                  />
                                  <p className="text-[11px] text-muted-foreground text-right">
                                    {formatCurrency(tipo.valor)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── ROW 3 — Métricas adicionais ── */}
              {!loading && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard
                    label="Taxa de conversão"
                    icon={<Percent className="w-4 h-4" />}
                    value={`${taxaConversao}%`}
                    sub={`${totalPagosMes} de ${totalAcordosMes} acordos pagos`}
                  />
                  <MetricCard
                    label="Ticket médio"
                    icon={<TrendingUp className="w-4 h-4" />}
                    value={formatCurrency(ticketMedio)}
                    sub="por acordo pago"
                  />
                  <MetricCard
                    label="Em atraso"
                    icon={<Clock className="w-4 h-4" />}
                    value={String(acordosAtrasados)}
                    sub="acordos pendentes vencidos"
                  />
                  <MetricCard
                    label="Projeção do mês"
                    icon={<Target className="w-4 h-4" />}
                    value={formatCurrency(projecaoMes)}
                    sub="baseada no ritmo atual"
                  />
                </div>
              )}

              {/* ── ROW 4 — Ranking operadores (admin/líder) ── */}
              {!loading && (isAdmin || isLider) && porOperador && porOperador.length > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Award className="w-4 h-4 text-muted-foreground" />
                      Ranking de Operadores — {MESES[mes - 1]}/{ano}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {porOperador.slice(0, 10).map((op, i) => (
                        <div
                          key={op.id}
                          className="flex items-center gap-3 py-1 border-b border-border last:border-0"
                        >
                          <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <span className="text-xs font-medium flex-1 truncate">{op.nome}</span>
                          <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                            {op.acordos} ac.
                          </span>
                          <span className="text-xs font-medium w-24 text-right shrink-0">
                            {formatCurrency(op.valor)}
                          </span>
                          {op.meta > 0 && (
                            <div className="w-20 shrink-0">
                              <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
                                <span>{op.perc}%</span>
                              </div>
                              <Progress value={Math.min(op.perc, 100)} className="h-1" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
