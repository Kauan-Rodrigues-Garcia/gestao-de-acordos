import { motion } from 'framer-motion';
import { Users2, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';

interface RankEntry {
  /** porEquipe não tem id (agrupado por nome); porOperador tem e usa como key. */
  id?: string;
  nome: string;
  valor: number;
  acordos: number;
  meta?: number;
  perc?: number;
}

interface RankingsSectionProps {
  porEquipe: RankEntry[];
  porOperador: RankEntry[];
  loading: boolean;
}

const PODIUM_CLASSES = [
  'border-yellow-500/20 bg-yellow-500/5',
  'border-slate-400/20 bg-slate-400/5',
  'border-amber-600/20 bg-amber-600/5',
] as const;

const BADGE_CLASSES = [
  'bg-yellow-400/20 text-yellow-600 border-yellow-400/30 shadow-sm shadow-yellow-400/20',
  'bg-slate-300/20 text-slate-500 border-slate-300/30',
  'bg-amber-600/20 text-amber-700 border-amber-600/30',
] as const;

const BAR_CLASSES = [
  'bg-yellow-400', 'bg-slate-400', 'bg-amber-600', 'bg-primary',
] as const;

export function RankingsSection({ porEquipe, porOperador, loading }: RankingsSectionProps) {
  return (
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
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
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
                    i < 3 ? PODIUM_CLASSES[i] : 'border-border/30 bg-background/30'
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0 border',
                    i < 3 ? BADGE_CLASSES[i] : 'bg-muted text-muted-foreground border-border/30'
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
                    {eq.meta && eq.meta > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', i < 3 ? BAR_CLASSES[i] : BAR_CLASSES[3])}
                            style={{ width: `${Math.min(eq.perc ?? 0, 100)}%` }}
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
            <div className="space-y-2.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
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
                      i < 3 ? PODIUM_CLASSES[i] : 'border-border/30 bg-background/30'
                    )}
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 border',
                      i < 3 ? BADGE_CLASSES[i] : 'bg-muted text-muted-foreground border-border/30'
                    )}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground truncate">{op.nome}</span>
                        <span className="text-xs font-extrabold text-success font-mono flex-shrink-0">{formatBRL(op.valor)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full', i < 3 ? BAR_CLASSES[i] : 'bg-primary/60')}
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.05 }}
                        />
                      </div>
                      {op.meta && op.meta > 0 && (
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
  );
}
