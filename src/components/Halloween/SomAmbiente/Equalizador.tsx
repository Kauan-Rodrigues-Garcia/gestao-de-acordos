import { cn } from '@/lib/utils';

/** Três barras subindo e descendo fora de compasso (CSS em `index.css`, «Som ambiente»). */
export function Equalizador({ className }: { className?: string }) {
  return (
    <span className={cn('som-eq', className)} aria-hidden>
      <span /><span /><span />
    </span>
  );
}
