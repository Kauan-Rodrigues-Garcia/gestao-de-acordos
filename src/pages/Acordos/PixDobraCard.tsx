/**
 * PixDobraCard.tsx — o contador dos 18 acordos do operador.
 *
 * Regra da operação: 18 acordos Pix feitos no mês dobram a comissão. O card
 * existe para o operador acompanhar sozinho — antes ele só descobria onde tinha
 * parado somando as próprias linhas na tabela.
 *
 * A conta mora em `calcularDobraComissao` (pura, com teste). Aqui só o desenho.
 */
import { motion } from 'framer-motion';
import { Trophy, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { DobraComissao } from './pixAutomaticoView';

export function PixDobraCard({ dobra }: { dobra: DobraComissao }) {
  const pct = Math.min(Math.round((dobra.feitos / dobra.meta) * 100), 100);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className={cn(
        'rounded-xl border bg-gradient-to-br p-4',
        dobra.atingiu
          ? 'from-amber-500/20 to-orange-600/5 border-amber-500/40'
          : 'from-violet-500/15 to-fuchsia-600/5 border-violet-500/25',
      )}>
        <div className="flex items-start gap-3">
          {dobra.atingiu
            ? <Trophy className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            : <Target className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] text-muted-foreground">
                Comissão dobrada · acordos Pix no mês
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className={cn('font-mono font-bold text-sm',
                  dobra.atingiu ? 'text-amber-400' : 'text-violet-400')}>
                  {dobra.feitos}
                </span>
                <span className="font-mono"> / {dobra.meta}</span>
              </p>
            </div>

            {/* Barra de progresso — o número sozinho não dá a noção de distância */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  dobra.atingiu ? 'bg-amber-400' : 'bg-violet-400')}
                style={{ width: `${pct}%` }}
              />
            </div>

            {dobra.atingiu ? (
              <p className="text-xs font-semibold text-amber-400 mt-2">
                🏆 Meta batida — sua comissão do mês está <strong>dobrada</strong>:{' '}
                <span className="font-mono">{formatCurrency(dobra.comissao)}</span>
                {' → '}
                <span className="font-mono">{formatCurrency(dobra.comissaoFinal)}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">
                Faltam{' '}
                <strong className="text-foreground">
                  {dobra.faltam} acordo{dobra.faltam !== 1 ? 's' : ''}
                </strong>{' '}
                para dobrar a comissão. Hoje:{' '}
                <span className="font-mono font-semibold text-violet-400">
                  {formatCurrency(dobra.comissao)}
                </span>
                {dobra.comissao > 0 && (
                  <>
                    {' '}· dobrada seria{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(dobra.comissao * 2)}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
