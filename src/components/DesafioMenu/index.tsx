/**
 * A mídia mantém 40 px nos dois estados do menu.
 * Ao expandir, aparece apenas o rótulo de navegação "Desafios".
 */
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { estiloDaCampanha } from '@/pages/Analitico/Desafios/tema';
import type { Desafio } from '@/services/desafios/types';

export interface DesafioMenuProps {
  desafio: Desafio;
  expandido: boolean;
  aberto: boolean;
  onToggle: () => void;
}

export function DesafioMenu({ desafio, expandido, aberto, onToggle }: DesafioMenuProps) {
  const { Icone, destaque } = estiloDaCampanha(desafio.visual);
  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={onToggle}
        title="Desafios"
        aria-label="Desafios"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className={cn(
          'flex h-12 w-full items-center gap-2 overflow-hidden rounded-lg px-1 text-left text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          aberto ? 'text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground',
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          {desafio.midiaUrl ? (
            <img src={desafio.midiaUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
          ) : (
            <Icone className={cn('h-5 w-5', destaque)} aria-hidden="true" />
          )}
        </span>
        <AnimatePresence initial={false}>
          {expandido && (
            <motion.span
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="min-w-0 flex-1 truncate"
            >
              Desafios
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
