/**
 * AnalyticsPanel.tsx — REESCRITO COMPLETO
 * Painel analítico colapsível — cores neutras, layout expandido padronizado.
 * ROW 1: 6 cards métricas | ROW 2: progresso meta | ROW 3: gráficos
 * ROW 4: % por forma de pagamento | ROW 5: métricas adicionais | ROW 6: ranking operadores
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, TrendingUp, DollarSign, Calendar, Target,
  ChevronDown, ChevronUp, RefreshCw, CheckCircle2, XCircle,
  Clock, Award, CreditCard, Percent,
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const PIE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-4))',
  'hsl(var(--destructive))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-5))',
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub: Tooltip customizado Recharts
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
// Sub: MetricCard — card neutro com valor e label
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
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function AnalyticsPanel() {
  const [open, setOpen] = useState(false);
  const { perfil } = useAuth();
  const { tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);

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
    percMetaAcordos,
    porStatus,
    porDia,
    porOperador,
    acordosMes,
    loading,
    refetch,
  } = useAnalytics();

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

      // PaguePlay: boleto e pix → "Boleto/PIX"
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

  // Projeção: baseada no ritmo de pagamentos até hoje
  const projecaoMes = useMemo(() => {
    const diaAtual = new Date().getDate();
    const diasTotais = new Date(ano, mes, 0).getDate();
    if (diaAtual === 0) return 0;
    return Math.round((valorRecebidoMes / diaAtual) * diasTotais);
  }, [valorRecebidoMes, mes, ano]);

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

        {/* 3 mini-valores inline (md+) */}
        {!loading && (
          <div className="hidden md:flex items-center gap-4 text-xs">
            <span>
              Recebido:{' '}
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
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={refetch}
            disabled={loading}
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setOpen(v => !v)}
          >
            {open ? (
              <><ChevronUp className="w-3 h-3" /> Ocultar</>
            ) : (
              <><ChevronDown className="w-3 h-3" /> Exibir Analíticos</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Painel expandido ── */}
      <AnimatePresence>
        {open && (
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

              {/* ── ROW 2 — Progresso da meta ── */}
              {!loading && meta && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      Progresso da Meta — {MESES[mes - 1]}/{ano}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {/* Meta de valor */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Valor recebido</span>
                        <span>
                          {formatCurrency(valorRecebidoMes)} / {formatCurrency(meta.meta_valor)} — {percMeta}%
                        </span>
                      </div>
                      <Progress value={Math.min(percMeta, 100)} className="h-2" />
                    </div>
                    {/* Meta de acordos */}
                    {meta.meta_acordos > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Acordos pagos</span>
                          <span>
                            {totalPagosMes} / {meta.meta_acordos} — {percMetaAcordos}%
                          </span>
                        </div>
                        <Progress value={Math.min(percMetaAcordos, 100)} className="h-2" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── ROW 3 — Gráficos (2 colunas em lg) ── */}
              {!loading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* AreaChart — Recebido vs Agendado por dia */}
                  <Card className="border-border bg-card">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">
                        Recebido vs Agendado — por dia
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 pb-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={porDia} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorAge" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip content={<CustomTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="recebido"
                            name="Recebido"
                            stroke="#22c55e"
                            fill="url(#colorRec)"
                            strokeWidth={1.5}
                          />
                          <Area
                            type="monotone"
                            dataKey="agendado"
                            name="Agendado"
                            stroke="hsl(var(--chart-1))"
                            fill="url(#colorAge)"
                            strokeWidth={1.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* PieChart donut — por status */}
                  <Card className="border-border bg-card">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">
                        Distribuição por Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center pb-4">
                      {porStatus.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie
                                data={porStatus}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={70}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {porStatus.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, name: string) => [String(value), name]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="flex flex-wrap justify-center gap-3 mt-1">
                            {porStatus.map((entry, index) => (
                              <div key={entry.name} className="flex items-center gap-1 text-xs">
                                <span
                                  className="w-2.5 h-2.5 rounded-full inline-block"
                                  style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                                />
                                <span>{entry.name}: {entry.value}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground py-8">
                          Sem dados de status no mês
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── ROW 4 — % por forma de pagamento ── */}
              {!loading && porTipo.length > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      Distribuição por Forma de Pagamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2.5">
                    {porTipo.map((tipo, i) => (
                      <div key={tipo.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{tipo.label}</span>
                          <span className="text-muted-foreground">
                            {tipo.perc}% — {formatCurrency(tipo.valor)}
                          </span>
                        </div>
                        <Progress
                          value={tipo.perc}
                          className="h-1.5"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* ── ROW 5 — Métricas adicionais ── */}
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

              {/* ── ROW 6 — Ranking operadores (admin/líder) ── */}
              {!loading && (isAdmin || isLider) && porOperador && porOperador.length > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Award className="w-4 h-4 text-muted-foreground" />
                      Ranking de Operadores — {MESES[mes - 1]}/{ano}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {porOperador.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum operador com dados neste período.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {porOperador.slice(0, 10).map((op, i) => (
                          <div
                            key={op.id}
                            className="flex items-center gap-3 py-1 border-b border-border last:border-0"
                          >
                            <span className="text-xs text-muted-foreground w-4 shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-xs font-medium flex-1 truncate">
                              {op.nome}
                            </span>
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
                    )}
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
