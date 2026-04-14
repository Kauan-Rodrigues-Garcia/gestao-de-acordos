/**
 * AnalyticsPanel.tsx
 * Painel analítico colapsível — exibe métricas em tempo real por perfil.
 * Compacto por padrão, expande via botão "Exibir Dados Analíticos".
 * Perfis:
 *  - Operador: métricas individuais + % meta individual
 *  - Líder:    métricas do setor + equipe + ranking operadores
 *  - Admin:    todos os setores + equipes + operadores
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Target,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { useAnalytics, MetaInfo } from "@/hooks/useAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, isPaguePlay } from "@/lib/index";
import { useEmpresa } from "@/hooks/useEmpresa";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────

interface MetaCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "primary";
  sub?: string;
}

interface OperadorRanking {
  id: string;
  nome: string;
  acordos: number;
  valor: number;
  metaPercent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PIE_COLORS = {
  Pago: "#22c55e",
  Pendente: "#f59e0b",
  "Não Pago": "#ef4444",
};

const VARIANT_STYLES: Record<string, string> = {
  default:     "bg-muted/60 border-border text-foreground",
  success:     "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400",
  warning:     "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  destructive: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
  primary:     "bg-primary/10 border-primary/30 text-primary",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: MetaCard
// ─────────────────────────────────────────────────────────────────────────────

function MetaCard({ label, value, icon, variant = "default", sub }: MetaCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-3 transition-all",
        VARIANT_STYLES[variant],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium opacity-75 truncate">{label}</span>
        <span className="opacity-60 shrink-0">{icon}</span>
      </div>
      <span className="text-lg font-bold leading-tight">{value}</span>
      {sub && <span className="text-xs opacity-60">{sub}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Skeleton loader
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted mb-2" />
      <div className="h-6 w-28 rounded bg-muted" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2 animate-pulse">
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="h-4 w-12 rounded bg-muted ml-auto" />
      <div className="h-4 w-20 rounded bg-muted" />
      <div className="h-3 w-24 rounded-full bg-muted" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Tooltip customizado para Recharts
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-2 shadow-md text-xs text-popover-foreground">
      <p className="font-semibold mb-1">Dia {label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function AnalyticsPanel() {
  const { user, perfil } = useAuth();
  const { empresa } = useEmpresa();
  const {
    data,
    loading,
    refetch,
    mes,
    ano,
    metaInfo,
  } = useAnalytics();

  const [expanded, setExpanded] = useState(false);
  const [spinning, setSpinning] = useState(false);

  // Nível de acesso
  const isAdmin = perfil === "admin";
  const isLider = perfil === "lider";
  const isOperador = perfil === "operador";
  const podeVerEquipe = isAdmin || isLider;

  // Label do mês/ano
  const mesLabel = `${MESES[mes - 1]}/${ano}`;

  // ── Dados derivados ──────────────────────────────────────────────────────

  const recebidoMes: number = data?.recebidoMes ?? 0;
  const agendadoMes: number = data?.agendadoMes ?? 0;
  const naoPagosMes: number = data?.naoPagosMes ?? 0;
  const agendadoHoje: number = data?.agendadoHoje ?? 0;
  const acordosMes: number = data?.acordosMes ?? 0;
  const metaValor: number = metaInfo?.meta_valor ?? 0;
  const metaPercent: number = metaValor > 0 ? Math.min((recebidoMes / metaValor) * 100, 100) : 0;

  const metaPercentLabel = metaValor > 0
    ? `${metaPercent.toFixed(1)}%`
    : "—";

  // Dados do gráfico de área (recebido vs agendado por dia)
  const areaData = useMemo(
    () => data?.porDia ?? [],
    [data?.porDia],
  );

  // Dados do gráfico de pizza (por status)
  const pieData = useMemo(() => {
    if (!data?.porStatus) return [];
    return [
      { name: "Pago",       value: data.porStatus.pago ?? 0 },
      { name: "Pendente",   value: data.porStatus.pendente ?? 0 },
      { name: "Não Pago",   value: data.porStatus.naoPago ?? 0 },
    ].filter((d) => d.value > 0);
  }, [data?.porStatus]);

  // Ranking de operadores
  const operadores: OperadorRanking[] = useMemo(
    () => data?.operadores ?? [],
    [data?.operadores],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleRefetch() {
    setSpinning(true);
    await refetch();
    setTimeout(() => setSpinning(false), 600);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card className="w-full border border-border shadow-sm overflow-hidden">
      {/* ── Header (sempre visível) ───────────────────────────────────── */}
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Título */}
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-sm font-semibold">
              Dados Analíticos —{" "}
              <span className="text-muted-foreground font-normal">{mesLabel}</span>
            </CardTitle>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRefetch}
              disabled={loading}
              title="Atualizar dados"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5 text-muted-foreground", spinning && "animate-spin")}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>Ocultar <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>Exibir <ChevronDown className="h-3 w-3" /></>
              )}
            </Button>
          </div>
        </div>

        {/* ── Mini cards colapsados ─────────────────────────────────── */}
        {!expanded && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <MetaCard
                  label="Recebido/mês"
                  value={formatCurrency(recebidoMes)}
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  variant="success"
                />
                <MetaCard
                  label="Agendado/mês"
                  value={formatCurrency(agendadoMes)}
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  variant="primary"
                />
                <MetaCard
                  label="Meta"
                  value={metaPercentLabel}
                  icon={<Target className="h-3.5 w-3.5" />}
                  variant={
                    metaPercent >= 100
                      ? "success"
                      : metaPercent >= 60
                      ? "warning"
                      : "destructive"
                  }
                />
              </>
            )}
          </div>
        )}
      </CardHeader>

      {/* ── Painel expandido ─────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="analytics-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <CardContent className="px-4 pb-5 pt-0 space-y-5">
              <Separator />

              {/* ── ROW 1: 6 MetaCards ─────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                ) : (
                  <>
                    <MetaCard
                      label="Recebido/mês"
                      value={formatCurrency(recebidoMes)}
                      icon={<DollarSign className="h-3.5 w-3.5" />}
                      variant="success"
                      sub="pagamentos confirmados"
                    />
                    <MetaCard
                      label="Agendado/mês"
                      value={formatCurrency(agendadoMes)}
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      variant="primary"
                      sub="promessas no mês"
                    />
                    <MetaCard
                      label="Não Pagos"
                      value={formatCurrency(naoPagosMes)}
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      variant="destructive"
                      sub="quebras de acordo"
                    />
                    <MetaCard
                      label="Agendado/hoje"
                      value={formatCurrency(agendadoHoje)}
                      icon={<Clock className="h-3.5 w-3.5" />}
                      variant="warning"
                      sub="vencendo hoje"
                    />
                    <MetaCard
                      label="Acordos/mês"
                      value={acordosMes}
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      variant="default"
                      sub="total de acordos"
                    />
                    <MetaCard
                      label="Meta %"
                      value={metaPercentLabel}
                      icon={<Target className="h-3.5 w-3.5" />}
                      variant={
                        metaPercent >= 100
                          ? "success"
                          : metaPercent >= 60
                          ? "warning"
                          : "destructive"
                      }
                      sub={
                        metaValor > 0
                          ? `${formatCurrency(recebidoMes)} / ${formatCurrency(metaValor)}`
                          : "meta não definida"
                      }
                    />
                  </>
                )}
              </div>

              {/* ── ROW 2: Barra de progresso da meta ──────────────────── */}
              {!loading && metaValor > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      Progresso da meta — {mesLabel}
                    </span>
                    <span
                      className={cn(
                        "font-semibold",
                        metaPercent >= 100
                          ? "text-green-600 dark:text-green-400"
                          : metaPercent >= 60
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {metaPercent.toFixed(1)}% atingida
                    </span>
                  </div>
                  <Progress
                    value={metaPercent}
                    className={cn(
                      "h-3 rounded-full",
                      metaPercent >= 100
                        ? "[&>div]:bg-green-500"
                        : metaPercent >= 60
                        ? "[&>div]:bg-amber-500"
                        : "[&>div]:bg-red-500",
                    )}
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{formatCurrency(recebidoMes)} recebidos</span>
                    <span>Meta: {formatCurrency(metaValor)}</span>
                  </div>
                </div>
              )}

              {/* ── ROW 3: Gráficos ────────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gráfico de área: Recebido vs Agendado por dia */}
                <div className="rounded-xl border border-border p-3 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Recebido vs Agendado — por dia
                  </p>
                  {loading ? (
                    <div className="h-40 flex items-center justify-center">
                      <div className="h-32 w-full rounded-lg bg-muted animate-pulse" />
                    </div>
                  ) : areaData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                      Sem dados disponíveis
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={150}>
                      <AreaChart data={areaData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRecebido" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorAgendado" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="dia"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="recebido"
                          name="Recebido"
                          stroke="#22c55e"
                          strokeWidth={2}
                          fill="url(#colorRecebido)"
                          dot={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="agendado"
                          name="Agendado"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#colorAgendado)"
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Gráfico de pizza: por status */}
                <div className="rounded-xl border border-border p-3 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" />
                    Distribuição por status
                  </p>
                  {loading ? (
                    <div className="h-40 flex items-center justify-center">
                      <div className="h-32 w-full rounded-lg bg-muted animate-pulse" />
                    </div>
                  ) : pieData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                      Sem dados disponíveis
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={60}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS] ?? "#94a3b8"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [value, ""]}
                          contentStyle={{
                            fontSize: 11,
                            borderRadius: 8,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--popover))",
                            color: "hsl(var(--popover-foreground))",
                          }}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── ROW 4: Ranking de operadores (admin/líder) ─────────── */}
              {podeVerEquipe && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Ranking de Operadores — {mesLabel}
                    </p>

                    {loading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
                      </div>
                    ) : operadores.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Nenhum operador com dados neste período.
                      </p>
                    ) : (
                      <div className="rounded-xl border border-border overflow-hidden">
                        {/* Cabeçalho */}
                        <div className="grid grid-cols-[1.5fr_60px_1fr_1.2fr] gap-2 px-3 py-1.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                          <span>Operador</span>
                          <span className="text-right">Acordos</span>
                          <span className="text-right">Recebido</span>
                          <span className="text-right">Meta</span>
                        </div>

                        {/* Linhas */}
                        {operadores.map((op, idx) => (
                          <div
                            key={op.id}
                            className={cn(
                              "grid grid-cols-[1.5fr_60px_1fr_1.2fr] gap-2 px-3 py-2 text-xs items-center",
                              idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                            )}
                          >
                            {/* Nome + posição */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={cn(
                                  "shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                                  idx === 0
                                    ? "bg-yellow-400/20 text-yellow-600"
                                    : idx === 1
                                    ? "bg-slate-300/30 text-slate-500"
                                    : idx === 2
                                    ? "bg-orange-400/20 text-orange-600"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {idx + 1}
                              </span>
                              <span className="truncate font-medium">{op.nome}</span>
                            </div>

                            {/* Acordos */}
                            <span className="text-right font-mono">{op.acordos}</span>

                            {/* Valor recebido */}
                            <span className="text-right font-mono text-green-600 dark:text-green-400">
                              {formatCurrency(op.valor)}
                            </span>

                            {/* Barra de meta */}
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={Math.min(op.metaPercent, 100)}
                                className={cn(
                                  "h-1.5 flex-1",
                                  op.metaPercent >= 100
                                    ? "[&>div]:bg-green-500"
                                    : op.metaPercent >= 60
                                    ? "[&>div]:bg-amber-500"
                                    : "[&>div]:bg-red-500",
                                )}
                              />
                              <span
                                className={cn(
                                  "text-[11px] font-semibold w-9 text-right shrink-0",
                                  op.metaPercent >= 100
                                    ? "text-green-600 dark:text-green-400"
                                    : op.metaPercent >= 60
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-red-500",
                                )}
                              >
                                {op.metaPercent.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
