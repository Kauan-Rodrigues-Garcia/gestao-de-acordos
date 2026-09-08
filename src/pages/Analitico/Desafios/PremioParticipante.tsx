import { useId, useState } from 'react';
import { ChevronDown, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PremioPorPosicao } from '@/services/desafios/types';
import './ranking-desafio.css';

/** O prêmio pertence à posição e acompanha quem chega nela. */
export function PremioParticipante({ premio, compacto = false }: { premio: PremioPorPosicao; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();

  return (
    <div className="desafio-premio w-full rounded-xl border border-amber-400/40 bg-amber-50 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={`Prêmio do ${premio.posicao}º lugar: ${premio.premio}`}
        onClick={() => setAberto(v => !v)}
        className={cn('relative flex w-full items-center rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card', compacto ? 'min-h-[68px] gap-1.5 px-2 py-2.5' : 'gap-3 px-3.5 py-3')}
      >
        <span className={cn('flex shrink-0 items-center justify-center rounded-lg bg-amber-400/15', compacto ? 'h-6 w-6 text-sm' : 'h-9 w-9 text-lg')} aria-hidden="true">
          {premio.icone || <Gift className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block font-semibold uppercase text-amber-800 dark:text-amber-300', compacto ? 'text-[8px] tracking-wider' : 'text-[9px] tracking-[0.16em]')}>Prêmio da posição</span>
          <span className={cn('mt-0.5 block break-words font-semibold leading-snug', compacto ? 'text-xs' : 'text-sm')}>{premio.premio}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 motion-safe:transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
      </button>
      <p id={id} hidden={!aberto} className="relative px-4 pb-3 text-left text-xs leading-relaxed text-amber-900 dark:text-amber-200">
        Prêmio previsto para o {premio.posicao}º lugar. Durante a campanha, a premiação acompanha as mudanças na classificação.
      </p>
    </div>
  );
}
