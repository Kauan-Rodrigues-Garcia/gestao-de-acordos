// src/pages/Analitico/Extrato/FitaDoMes.tsx
/**
 * A fita do mês — uma coluna por dia, altura pelo valor recebido.
 *
 * Mostra o ritmo do mês num relance (onde estão os dias fortes, onde o mês
 * parou) e serve de atalho: clicar num dia filtra o extrato abaixo para ele.
 * Clicar de novo no mesmo dia solta o filtro.
 */
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';

interface FitaDoMesProps {
  dias: { dia: string; total: number }[];
  hojeISO: string;
  selecionado: string | null;
  onSelecionar: (dia: string | null) => void;
  className?: string;
}

export function FitaDoMes({ dias, hojeISO, selecionado, onSelecionar, className }: FitaDoMesProps) {
  const maior = dias.reduce((m, d) => Math.max(m, d.total), 0);
  return (
    <div className={cn('min-w-0', className)}>
      <div role="group" aria-label="Recebido por dia do mês" className="flex h-12 items-end gap-[3px]">
        {dias.map(d => {
          const futuro = d.dia > hojeISO;
          const hoje = d.dia === hojeISO;
          const on = selecionado === d.dia;
          const altura = maior > 0 && d.total > 0 ? Math.max(10, (d.total / maior) * 100) : 0;
          const rotulo = `${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${formatBRL(d.total)}`;
          return (
            <button key={d.dia} type="button"
              disabled={d.total === 0}
              aria-pressed={on}
              aria-label={rotulo}
              title={rotulo}
              onClick={() => onSelecionar(on ? null : d.dia)}
              className={cn(
                'group relative flex h-full min-w-0 flex-1 items-end rounded-[3px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                d.total > 0 ? 'cursor-pointer' : 'cursor-default',
              )}>
              {/* O trilho vazio do dia — sem ele, o dia zerado sumiria da fita. */}
              <span aria-hidden="true" className={cn(
                'absolute inset-x-0 bottom-0 h-[3px] rounded-full',
                futuro ? 'bg-border/40' : 'bg-border',
                hoje && 'bg-primary/50',
              )} />
              {altura > 0 && (
                <span aria-hidden="true"
                  className={cn(
                    'relative w-full rounded-[3px] transition-[height,background-color] duration-300',
                    on ? 'bg-primary' : selecionado ? 'bg-primary/25 group-hover:bg-primary/45' : 'bg-primary/55 group-hover:bg-primary/80',
                  )}
                  style={{ height: `${altura}%` }} />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted-foreground" aria-hidden="true">
        <span>01</span>
        <span>{dias.length > 0 ? String(Math.ceil(dias.length / 2)).padStart(2, '0') : ''}</span>
        <span>{dias.length > 0 ? dias[dias.length - 1].dia.slice(8) : ''}</span>
      </div>
    </div>
  );
}
