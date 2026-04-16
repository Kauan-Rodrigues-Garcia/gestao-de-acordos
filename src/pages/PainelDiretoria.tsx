/**
 * PainelDiretoria.tsx
 * Painel analítico global para cargo Diretoria.
 * Visualiza todos os acordos e analíticos, com filtros por setor, equipe e usuário.
 * Sem capacidade de criar/editar/excluir acordos.
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, Users, BarChart3,
  Filter, Building2, Users2, User, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { formatCurrency, isPaguePlay } from '@/lib/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const PIE_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];

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
    loading,
    refetch,
  } = useAnalytics();

  const [filtroEquipe, setFiltroEquipe] = useState<string>('all');
  const [filtroOperador, setFiltroOperador] = useState<string>('all');

  const porOperadorFiltrado = useMemo(() => {
    if (!porOperador) return [];
    return porOperador;
  }, [porOperador]);

  const txConversao = totalAcordosMes > 0
    ? Math.round((totalPagosMes / totalAcordosMes) * 100)
    : 0;

  const metricCards = [
    {
      label: 'Recebido no mês',
      value: formatCurrency(valorRecebidoMes),
      icon: DollarSign,
      color: 'text-success',
      bg: 'bg-success/10',
      sub: `${totalPagosMes} acordos pagos`,
    },
    {
      label: 'Total agendado',
      value: formatCurrency(valorAgendadoMes),
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: `${totalAcordosMes} acordos no mês`,
    },
    {
      label: 'Não pagos',
      value: formatCurrency(valorNaoPago),
      icon: BarChart3,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      sub: `${totalNaoPagos} acordos`,
    },
    {
      label: 'Taxa de conversão',
      value: `${txConversao}%`,
      icon: Users,
      color: 'text-chart-3',
      bg: 'bg-chart-3/10',
      sub: `${totalPendentes} pendentes`,
    },
  ];

  if (!perfil) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-chart-5" />
            Painel Diretoria
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão analítica completa — todos os setores e equipes
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro por setor */}
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

          <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ── Métricas principais ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : metricCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className="border-border/50">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                        <p className={cn('text-xl font-bold mt-1', card.color)}>{card.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                      </div>
                      <div className={cn('p-2 rounded-lg', card.bg)}>
                        <card.icon className={cn('w-4 h-4', card.color)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
      </div>

      {/* ── Meta do mês (se houver) ────────────────────────────────────────── */}
      {meta && !loading && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Meta do mês</p>
              <Badge variant="outline" className={percMeta >= 100 ? 'text-success border-success/40' : ''}>
                {percMeta}%
              </Badge>
            </div>
            <Progress value={percMeta} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
              <span>{formatCurrency(valorRecebidoMes)} recebido</span>
              <span>Meta: {formatCurrency(meta.meta_valor)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gráfico de evolução diária ─────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Evolução diária — mês atual</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={porDia} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAgeDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={50} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="agendado" name="Agendado" stroke="hsl(var(--chart-1))" fill="url(#colorAgeDiretor)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="recebido" name="Recebido" stroke="hsl(var(--chart-2))" fill="url(#colorRecDiretor)" strokeWidth={2} dot={false} />
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
                        <span className="font-semibold">{formatCurrency(eq.valor)}</span>
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
            ) : porOperadorFiltrado.length > 0 ? (
              <div className="space-y-2.5">
                {porOperadorFiltrado.slice(0, 8).map((op, i) => (
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
                        <span className="text-sm font-semibold text-success">{formatCurrency(op.valor)}</span>
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

      {/* ── Status breakdown ──────────────────────────────────────────────────── */}
      {!loading && porStatus.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Distribuição por status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={porStatus} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
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
