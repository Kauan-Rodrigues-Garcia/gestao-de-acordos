import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * O aviso de `regra.condicaoPremio`: o que é preciso, além da colocação, para
 * levar o prêmio. Aparece na aba Desafios e no painel do menu lateral.
 *
 * É informativo — o ranking não esconde ninguém por causa dele.
 */
export function CondicaoPremio({ texto, className }: { texto: string | null; className?: string }) {
  if (!texto) return null;
  return (
    <aside
      aria-label="Regra para levar o prêmio"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-amber-950',
        'dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100',
        className,
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/15" aria-hidden="true">
        <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-300">
          Regra para levar o prêmio
        </p>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{texto}</p>
      </div>
    </aside>
  );
}
