import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  Building2, Clock, Landmark,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import type { SetorAgendamento } from './types';
import { TIPO_ICONS, TIPO_CORES, TIPO_LABELS_DISPLAY } from './types';

// ─── Tooltips ─────────────────────────────────────────────────────────────────

export function CustomTooltip({ active, payload, label }: any) {
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

export function CustomPieTooltip({ active, payload }: any) {
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

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

export function KpiCard({ label, value, sub, icon: Icon, color, bg, delta, delay = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className="h-full"
    >
      <div className="relative h-full rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 hover:border-border/70 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
        <div className={cn('absolute inset-x-0 top-0 h-0.5 rounded-t-2xl opacity-70', bg.replace('/10', ''))} />
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

// ─── Section Label ─────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border/50" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2">{children}</span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

// ─── KPI Skeleton Row ──────────────────────────────────────────────────────────

export function KpiSkeletons({ count }: { count: number }) {
  return (
    <>
      {[...Array(count)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </>
  );
}

// ─── Setor Row ─────────────────────────────────────────────────────────────────

export function SetorRow({ setor, index, tipos }: { setor: SetorAgendamento; index: number; tipos: string[] }) {
  const [expandido, setExpandido] = useState(false);

  const percColor = setor.perc >= 80
    ? 'text-success'
    : setor.perc >= 50
      ? 'text-warning'
      : 'text-destructive';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className="rounded-xl border border-border/40 overflow-hidden bg-card/60 backdrop-blur-sm hover:border-border/70 transition-all duration-200"
    >
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/20 transition-colors text-left group"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{setor.nome}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{setor.totalAcordos} acordos no mês</p>
        </div>
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
                  <p className="text-[10px] text-warning font-bold uppercase tracking-wide">Agendado restante</p>
                </div>
                <p className="text-sm font-extrabold text-warning font-mono">{formatBRL(setor.totalRestante)}</p>
                <p className="text-[9px] text-warning/70 mt-0.5">
                  {setor.qtdRestante} a verificar
                </p>
              </div>
              <div className={cn('p-3 rounded-xl border text-center bg-destructive/5 border-destructive/20')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle className="w-3 h-3 text-destructive" />
                  <p className="text-[10px] text-destructive font-bold uppercase tracking-wide">Não Pago</p>
                </div>
                <p className="text-sm font-extrabold text-destructive font-mono">{formatBRL(setor.totalNaoPago)}</p>
              </div>
            </div>

            {setor.totalAgendado > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Composição do agendado</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-px bg-muted">
                  {setor.totalRecebido > 0 && (
                    <div className="h-full bg-success" style={{ width: `${Math.round((setor.totalRecebido / setor.totalAgendado) * 100)}%` }} />
                  )}
                  {setor.totalRestante > 0 && (
                    <div className="h-full bg-warning" style={{ width: `${Math.round((setor.totalRestante / setor.totalAgendado) * 100)}%` }} />
                  )}
                  {setor.totalNaoPago > 0 && (
                    <div className="h-full bg-destructive" style={{ width: `${Math.round((setor.totalNaoPago / setor.totalAgendado) * 100)}%` }} />
                  )}
                </div>
                <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success inline-block" />Rec.</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-warning inline-block" />Restante</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive inline-block" />N. pago</span>
                </div>
              </div>
            )}

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
                              <p className="text-xs font-mono font-bold text-foreground flex-shrink-0">{formatBRL(dado.agendado)}</p>
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
