import { cn } from '@/lib/utils';
import './somAmbiente.css';

/** Três barras subindo e descendo fora de compasso (CSS em `somAmbiente.css`). */
export function Equalizador({ className }: { className?: string }) {
  return (
    <span className={cn('som-eq', className)} aria-hidden>
      <span /><span /><span />
    </span>
  );
}
