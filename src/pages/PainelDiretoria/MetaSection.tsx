import { motion } from 'framer-motion';
import { Target, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';

interface MetaSectionProps {
  meta: { meta_valor: number };
  percMeta: number;
  isPP: boolean;
  valorHOMes: number;
  valorRecebidoMes: number;
  valorCorenMes: number;
  valorCofenMes: number;
  projecaoMes: number;
  mesNome: string;
}

export function MetaSection({
  meta, percMeta, isPP, valorHOMes, valorRecebidoMes,
  valorCorenMes, valorCofenMes, projecaoMes, mesNome,
}: MetaSectionProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <div className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden p-5">
        <div
          className="absolute inset-x-0 bottom-0 h-0.5 opacity-60"
          style={{ background: `linear-gradient(to right, ${percMeta >= 100 ? '#22c55e' : percMeta >= 70 ? '#f59e0b' : '#ef4444'} ${percMeta}%, transparent ${percMeta}%)` }}
        />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-chart-5/10 border border-chart-5/20">
              <Target className="w-4 h-4 text-chart-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{isPP ? 'Meta H.O. do mês' : 'Meta do mês'}</h3>
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
          {[25, 50, 75].map(milestone => (
            <div key={milestone} className="absolute top-0 h-3 w-px bg-background/60" style={{ left: `${milestone}%` }} />
          ))}
        </div>

        <div className="flex justify-between text-[10px] text-muted-foreground/50 mb-3 px-0">
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
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
            projecaoMes >= meta.meta_valor ? 'text-success bg-success/8 border-success/20' : 'text-warning bg-warning/8 border-warning/20'
          )}>
            {projecaoMes >= meta.meta_valor ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {projecaoMes >= meta.meta_valor
              ? `Projeção${isPP ? ' H.O.' : ''} indica atingimento da meta`
              : `Projeção${isPP ? ' H.O.' : ''}: ${formatBRL(projecaoMes)} (${Math.round((projecaoMes / meta.meta_valor) * 100)}% da meta)`
            }
          </div>
        )}
      </div>
    </motion.div>
  );
}
