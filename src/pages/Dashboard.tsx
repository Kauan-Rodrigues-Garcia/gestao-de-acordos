import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  TrendingUp, CheckCircle2,
  DollarSign, Users, CalendarDays,
  ArrowRight, MessageSquare, Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardMetricas, useAcordos } from '@/hooks/useAcordos';
import { ROUTE_PATHS, formatCurrency, formatDate, STATUS_COLORS, STATUS_LABELS, TIPO_LABELS, getTodayISO } from '@/lib/index';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { cn } from '@/lib/utils';

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } }
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } }
};

function StatCard({ title, value, subtitle, icon: Icon, color, trend, loading }: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color: string; trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
}) {
  return (
    <motion.div variants={fadeUp}>
      <Card className="border-border hover:border-primary/30 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
              <Icon className="w-5 h-5" />
            </div>
            {!loading && trend && (
              <span className={cn('flex items-center gap-1 text-xs font-medium',
                trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
              </span>
            )}
          </div>
          <div className="mt-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{title}</p>
                {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const PIE_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Dashboard() {
  const { perfil } = useAuth();
  const { metricas, loading: loadingMetricas } = useDashboardMetricas();
  const { acordos: acordosHoje, loading: loadingHoje } = useAcordos({ apenas_hoje: true });
  const { acordos: todosAcordos } = useAcordos();
  const hoje = getTodayISO();
  const diaSemana = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Data para gráfico de status
  const statusData = ['verificar_pendente', 'pago', 'nao_pago'].map(s => ({
    name: STATUS_LABELS[s],
    value: todosAcordos.filter(a => a.status === s).length,
  })).filter(d => d.value > 0);

  // Data para gráfico por tipo
  const tipoData = ['boleto', 'cartao_recorrente', 'pix_automatico', 'cartao', 'pix'].map(t => ({
    name: TIPO_LABELS[t],
    acordos: todosAcordos.filter(a => a.tipo === t).length,
    valor: todosAcordos.filter(a => a.tipo === t).reduce((s, a) => s + Number(a.valor), 0),
  }));

  const nome = perfil?.nome?.split(' ')[0] || 'Usuário';

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Bom dia, {nome}! 👋
          </h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">
            {diaSemana}, {dataFormatada}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTE_PATHS.ACORDOS}>
              <CalendarDays className="w-4 h-4 mr-2" />
              Ver Acordos
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to={ROUTE_PATHS.ACORDO_NOVO}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Acordo
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
      >
        <StatCard title="Acordos Hoje" value={metricas.acordos_hoje}
          icon={CalendarDays} color="bg-primary/10 text-primary" trend="neutral" loading={loadingMetricas} />
        <StatCard title="Pagos Hoje" value={metricas.pagos_hoje}
          icon={CheckCircle2} color="bg-success/10 text-success" trend="up" loading={loadingMetricas} />
        <StatCard title="Previsto Hoje" value={formatCurrency(metricas.valor_previsto_hoje)}
          icon={DollarSign} color="bg-info/10 text-info" loading={loadingMetricas} />
        <StatCard title="Recebido Hoje" value={formatCurrency(metricas.valor_recebido_hoje)}
          icon={TrendingUp} color="bg-success/10 text-success" trend="up" loading={loadingMetricas} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Acordos do dia */}
        <div className="lg:col-span-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  Acordos de Hoje
                  <Badge variant="secondary" className="text-xs">{acordosHoje.length}</Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1.5 text-success border-success/30 hover:bg-success/10"
                    onClick={() => {
                      acordosHoje.forEach(a => {
                        if (a.whatsapp) {
                          const msg = `Olá, ${a.nome_cliente}, passando para lembrar do seu acordo NR ${a.nr_cliente}, no valor de ${formatCurrency(a.valor)}, com vencimento em ${formatDate(a.vencimento)}. Qualquer dúvida, estamos à disposição.`;
                          window.open(`https://wa.me/55${a.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
                        }
                      });
                    }}
                  >
                    <MessageSquare className="w-3 h-3" />
                    Enviar Lembretes
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                    <Link to={`${ROUTE_PATHS.ACORDOS}?data=${hoje}`}>
                      Ver todos <ArrowRight className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHoje ? (
                <div className="p-4 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-6 w-6 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : acordosHoje.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum acordo para hoje</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Cliente / NR</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Valor</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tipo</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acordosHoje.slice(0, 8).map((a, i) => (
                        <tr key={a.id} className={cn('border-b border-border/50 hover:bg-accent/50 transition-colors', i % 2 === 0 && 'bg-muted/10')}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-foreground">{a.nome_cliente}</p>
                            {a.instituicao && (
                              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{a.instituicao}</p>
                            )}
                            <p className="text-muted-foreground font-mono">{a.nr_cliente}</p>
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{formatCurrency(a.valor)}</td>
                          <td className="px-4 py-2.5">
                            <span className="capitalize text-muted-foreground">{TIPO_LABELS[a.tipo]}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[a.status])}>
                              {STATUS_LABELS[a.status]}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {a.whatsapp && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-6 h-6 text-success hover:bg-success/10"
                                  onClick={() => {
                                    const msg = `Olá, ${a.nome_cliente}, passando para lembrar do seu acordo NR ${a.nr_cliente}, no valor de ${formatCurrency(a.valor)}, com vencimento em ${formatDate(a.vencimento)}. Qualquer dúvida, estamos à disposição.`;
                                    window.open(`https://wa.me/55${a.whatsapp!.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
                                  }}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                </Button>
                              )}
                              <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                                <Link to={`/acordos/${a.id}`}>
                                  <ArrowRight className="w-3 h-3" />
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {acordosHoje.length > 8 && (
                    <div className="px-4 py-3 text-center border-t border-border">
                      <Button asChild variant="ghost" size="sm" className="text-xs">
                        <Link to={`${ROUTE_PATHS.ACORDOS}?data=${hoje}`}>
                          Ver mais {acordosHoje.length - 8} acordos
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="space-y-4">
          {/* Pie - por status */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Por Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                      paddingAngle={3} dataKey="value">
                      {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [v, 'Acordos']} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bar - por tipo */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Por Tipo de Acordo</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={tipoData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip />
                  <Bar dataKey="acordos" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Separator />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>Total de acordos: <strong className="text-foreground font-mono">{todosAcordos.length}</strong></span>
            </div>
            <Button asChild variant="link" size="sm" className="text-xs h-auto p-0">
              <Link to={ROUTE_PATHS.ACORDOS}>Ver todos →</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
