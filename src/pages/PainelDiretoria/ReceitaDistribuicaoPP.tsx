import { motion } from 'framer-motion';
import { Percent, Banknote, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { PP_HO_PERCENTUAL, PP_COREN_PERCENTUAL, PP_COFEN_PERCENTUAL } from '@/lib/index';

interface ReceitaDistribuicaoPPProps {
  valorRecebidoMes: number;
  valorHOMes: number;
  valorHOAgendado: number;
  valorNaoPago: number;
  valorCorenMes: number;
  valorCofenMes: number;
  valorCorenAge: number;
  valorCofenAge: number;
  meta: { meta_valor: number } | null;
  percMeta: number;
}

export function ReceitaDistribuicaoPP({
  valorHOMes, valorHOAgendado, valorNaoPago,
  valorCorenMes, valorCofenMes, valorCorenAge, valorCofenAge,
  meta, percMeta,
}: ReceitaDistribuicaoPPProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <div className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-violet-500/5 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-orange-500/5 blur-3xl pointer-events-none" />
        <div className="relative p-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <Percent className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Distribuição de Receita — PaguePlay</h3>
              <p className="text-[11px] text-muted-foreground">Quebra do valor bruto recebido entre H.O., Coren e Cofen</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {/* H.O. */}
            <div className="p-4 rounded-xl border border-orange-500/25 bg-gradient-to-br from-orange-500/8 to-orange-500/3 hover:border-orange-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/20">
                  <Banknote className="w-3.5 h-3.5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-orange-600 dark:text-orange-400">H.O. PaguePlay</p>
                  <p className="text-[10px] text-muted-foreground">{(PP_HO_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
                </div>
              </div>
              <p className="text-2xl font-extrabold font-mono text-orange-500 leading-none">{formatBRL(valorHOMes)}</p>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Agendado H.O.</span>
                  <span className="font-mono font-semibold">{formatBRL(valorHOAgendado)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-orange-500/15 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-orange-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${valorHOAgendado > 0 ? Math.min(Math.round((valorHOMes / valorHOAgendado) * 100), 100) : 0}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
              {meta && (
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Meta H.O.:</span>
                  <span className={cn('font-bold', percMeta >= 100 ? 'text-success' : percMeta >= 70 ? 'text-warning' : 'text-destructive')}>
                    {formatBRL(meta.meta_valor)} ({percMeta}%)
                  </span>
                </div>
              )}
            </div>

            {/* Coren */}
            <div className="p-4 rounded-xl border border-blue-500/25 bg-gradient-to-br from-blue-500/8 to-blue-500/3 hover:border-blue-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/20">
                  <PiggyBank className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Repasse Coren</p>
                  <p className="text-[10px] text-muted-foreground">{(PP_COREN_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
                </div>
              </div>
              <p className="text-2xl font-extrabold font-mono text-blue-500 leading-none">{formatBRL(valorCorenMes)}</p>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Coren agendado</span>
                  <span className="font-mono font-semibold">{formatBRL(valorCorenAge)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-blue-500/15 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${valorCorenAge > 0 ? Math.min(Math.round((valorCorenMes / valorCorenAge) * 100), 100) : 0}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                  />
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Não pago: <span className="font-mono font-semibold text-destructive">{formatBRL(valorNaoPago * PP_COREN_PERCENTUAL)}</span>
              </p>
            </div>

            {/* Cofen */}
            <div className="p-4 rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/8 to-violet-500/3 hover:border-violet-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/20">
                  <PiggyBank className="w-3.5 h-3.5 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-violet-600 dark:text-violet-400">Repasse Cofen</p>
                  <p className="text-[10px] text-muted-foreground">{(PP_COFEN_PERCENTUAL * 100).toFixed(2)}% do bruto</p>
                </div>
              </div>
              <p className="text-2xl font-extrabold font-mono text-violet-500 leading-none">{formatBRL(valorCofenMes)}</p>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Cofen agendado</span>
                  <span className="font-mono font-semibold">{formatBRL(valorCofenAge)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-violet-500/15 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-violet-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${valorCofenAge > 0 ? Math.min(Math.round((valorCofenMes / valorCofenAge) * 100), 100) : 0}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Não pago: <span className="font-mono font-semibold text-destructive">{formatBRL(valorNaoPago * PP_COFEN_PERCENTUAL)}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Distribuição percentual do bruto recebido</p>
            <div className="flex h-5 rounded-xl overflow-hidden gap-px bg-muted/50">
              {[
                { pct: PP_HO_PERCENTUAL, color: 'bg-orange-500' },
                { pct: PP_COREN_PERCENTUAL, color: 'bg-blue-500' },
                { pct: PP_COFEN_PERCENTUAL, color: 'bg-violet-500' },
              ].map(({ pct, color }, i) => (
                <motion.div
                  key={i}
                  className={cn('h-full flex items-center justify-center', color)}
                  style={{ width: `${(pct * 100).toFixed(1)}%` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                >
                  <span className="text-[9px] font-bold text-white/90 hidden sm:block">{(pct * 100).toFixed(1)}%</span>
                </motion.div>
              ))}
            </div>
            <div className="flex gap-5 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />H.O. {(PP_HO_PERCENTUAL * 100).toFixed(2)}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Coren {(PP_COREN_PERCENTUAL * 100).toFixed(2)}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />Cofen {(PP_COFEN_PERCENTUAL * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
