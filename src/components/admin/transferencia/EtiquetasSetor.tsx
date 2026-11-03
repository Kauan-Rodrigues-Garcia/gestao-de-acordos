/**
 * EtiquetasSetor — as duas marcas de um setor nas listas de transferência
 * (Cleber, 03/11/2026):
 *
 *   BookPlay / PaguePlay   a marca, pela cidade do setor (`lib/marca.ts`)
 *   Nosso produto / Cofen  a regra de negócio do setor (`lib/regraDoSetor.ts`)
 *
 * Marca e regra são coisas diferentes: o Conecta Play é PaguePlay (Marília)
 * com a regra Cofen.
 */
import { cn } from '@/lib/utils';
import { ROTULO_REGRA } from '@/lib/regraDoSetor';
import { etiquetasDoSetor, type SetorDaTransferencia } from '@/lib/transferenciaPedidos';

const COR_MARCA = {
  BookPlay: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  PaguePlay: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
} as const;

export function EtiquetasSetor({ setor, className }: {
  setor: Pick<SetorDaTransferencia, 'cidade' | 'regra'> | null | undefined;
  className?: string;
}) {
  const { marca, regra } = etiquetasDoSetor(setor);
  if (!marca && !regra) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 align-middle', className)}>
      {marca && (
        <span className={cn('rounded px-1 text-[10px] font-semibold leading-4', COR_MARCA[marca])}>{marca}</span>
      )}
      {regra && (
        <span className={cn(
          'rounded px-1 text-[10px] font-semibold leading-4',
          regra === 'cofen'
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
            : 'bg-muted text-muted-foreground',
        )}>
          {ROTULO_REGRA[regra]}
        </span>
      )}
    </span>
  );
}
