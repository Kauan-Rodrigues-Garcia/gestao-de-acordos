/**
 * Indicadores — os quatro números grandes do topo (Ativos, Recuperar,
 * Restrição, Banidos). Clicar filtra; clicar de novo limpa.
 */
import { Ban, CheckCircle2, Hourglass, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';
import type { Contagem } from '@/services/chipsFisicos/chipsPainel';
import { DESCRICAO_STATUS, ORDEM_STATUS, ROTULO_STATUS_PLURAL, TOM_STATUS } from './cores';

const ICONE: Record<StatusChip, LucideIcon> = {
  ativo: CheckCircle2, recuperar: RotateCcw, restricao: Hourglass, banido: Ban,
};

export function Indicadores({ contagem, filtro, onFiltro }: {
  contagem: Contagem;
  filtro: StatusChip | null;
  onFiltro: (s: StatusChip | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Filtrar por status">
      {ORDEM_STATUS.map(s => {
        const Icone = ICONE[s];
        const tom = TOM_STATUS[s];
        const n = contagem[s];
        const pct = contagem.total > 0 ? Math.round((n / contagem.total) * 100) : 0;
        const marcado = filtro === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={marcado}
            aria-label={`${n} ${ROTULO_STATUS_PLURAL[s]}`}
            onClick={() => onFiltro(marcado ? null : s)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              marcado ? cn('ring-2', tom.borda, 'ring-offset-2 ring-offset-background') : 'hover:-translate-y-0.5 hover:shadow-md',
            )}
          >
            <span className={cn('absolute inset-x-0 top-0 h-1', tom.solido)} aria-hidden />
            <div className="flex items-start justify-between gap-2">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tom.fundo, tom.texto)}>
                <Icone className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <p className="mt-3 text-4xl font-bold leading-none tabular-nums">{n}</p>
            <p className="mt-1.5 text-base font-semibold">{ROTULO_STATUS_PLURAL[s]}</p>
            <p className="text-sm text-muted-foreground">{DESCRICAO_STATUS[s]}</p>
          </button>
        );
      })}
    </div>
  );
}
