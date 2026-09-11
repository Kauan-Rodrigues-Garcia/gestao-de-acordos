/**
 * BotaoComissao — a entrada da comissão no menu lateral, logo abaixo do Desempenho do Dia.
 *
 * Mesmo desenho do botão vizinho: lado a lado, os dois dizem que abrem o mesmo
 * tipo de coisa — um painel por cima da página, e não uma rota.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotaoComissaoProps {
  aberto: boolean;
  /** Menu expandido: o rótulo aparece ao lado da moeda. */
  comRotulo: boolean;
  onClick: () => void;
}

export function BotaoComissao({ aberto, comRotulo, onClick }: BotaoComissaoProps) {
  return (
    <div className="px-2 pt-1">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={aberto}
        aria-label="Comissão"
        title="Comissão"
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
          aberto
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        )}
      >
        <Coins className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <AnimatePresence>
          {comRotulo && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 truncate text-left"
            >
              Comissão
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
