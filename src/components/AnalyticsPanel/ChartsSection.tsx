import { useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ChevronRight, ArrowUpRight } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { CHART_RECEBIDO, CHART_AGENDADO, BREAKDOWN_COLORS, itemVariants } from './constants';
import { CustomTooltip, DonutChart } from './SubComponents';

interface ChartsSectionProps {
  isPP: boolean;
  porDiaChart: Array<{ dia: string; recebido?: number; agendado?: number; ho?: number }>;
  porTipo: Array<{ label: string; acordos: number; valor: number; perc: number }>;
  donutPercent: number;
  donutColor: string;
  donutSublabel: string;
  meta: { meta_valor: number } | null | undefined;
  percMeta: number;
  valorRecebidoMes: number;
  tickColor: string;
  gridColor: string;
}

function formatYAxis(value: number) {
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}k`;
  return `R$${value}`;
}

export function ChartsSection({
  isPP, porDiaChart, porTipo,
  donutPercent, donutColor, donutSublabel,
  meta, percMeta, valorRecebidoMes,
  tickColor, gridColor,
}: ChartsSectionProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // PP: interruptor da linha verde — Total (padrão) ⇄ H.O.
  const [modoHO, setModoHO] = useState(false);
  const hoAtivo = isPP && modoHO;
  const dadosChart = hoAtivo
    ? porDiaChart.map(d => ({ ...d, recebido: d.ho ?? 0 }))
    : porDiaChart;

  return (
    <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* AreaChart — Recebido vs Agendado por dia */}
      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              {hoAtivo ? 'H.O. vs Agendado — por dia' : 'Recebido vs Agendado — por dia'}
            </CardTitle>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              {isPP && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className={!modoHO ? 'font-semibold text-foreground' : undefined}>Total</span>
                  <Switch checked={modoHO} onCheckedChange={setModoHO} className="scale-[0.7]" />
                  <span className={modoHO ? 'font-semibold text-foreground' : undefined}>H.O.</span>
                </label>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-[3px] rounded-full" style={{ background: CHART_RECEBIDO }} />
                {hoAtivo ? 'H.O.' : 'Recebido'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-[3px] rounded-full" style={{ background: CHART_AGENDADO }} />
                Agendado
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dadosChart} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
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
                name={hoAtivo ? 'H.O.' : 'Recebido'}
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

      {/* Anel com Breakdown */}
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
                <DonutChart
                  percent={donutPercent}
                  label={`${donutPercent}%`}
                  sublabel={donutSublabel}
                  color={donutColor}
                  size={180}
                />
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
                          } as CSSProperties}
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
                        +{porTipo.length - 2} mais — clique em &quot;Ver Breakdown&quot;
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
                {porTipo.length > 0 && (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie
                          data={porTipo}
                          cx="50%" cy="50%"
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
                <div className="space-y-3">
                  {porTipo.map((tipo, i) => {
                    const color = BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length];
                    return (
                      <div key={tipo.label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="font-medium">{tipo.label}</span>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="tabular-nums">{tipo.acordos} ac.</span>
                            <span className="font-bold tabular-nums font-mono" style={{ color }}>
                              {tipo.perc}%
                            </span>
                          </div>
                        </div>
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
  );
}
