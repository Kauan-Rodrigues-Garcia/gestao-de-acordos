import { useId, useState } from 'react';
import { ChevronDown, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PremioPorPosicao } from '@/services/desafios/types';
import './ranking-desafio.css';

/** O prêmio pertence à posição e acompanha quem chega nela. */
export function PremioParticipante({ premio }: { premio: PremioPorPosicao }) {
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
        className="relative flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-lg" aria-hidden="true">
          {premio.icone || <Gift className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-300">Prêmio da posição</span>
          <span className="mt-0.5 block break-words text-sm font-semibold leading-snug">{premio.premio}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 motion-safe:transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
      </button>
      <p id={id} hidden={!aberto} className="relative px-4 pb-3 text-left text-xs leading-relaxed text-amber-900 dark:text-amber-200">
        Prêmio previsto para o {premio.posicao}º lugar. Durante a campanha, a premiação acompanha as mudanças na classificação.
      </p>
    </div>
  );
}
