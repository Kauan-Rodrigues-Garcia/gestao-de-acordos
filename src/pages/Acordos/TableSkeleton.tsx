import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto da tabela de Acordos enquanto a primeira página carrega.
 *
 * As colunas imitam as da tabela real desta tela — por isso não é o mesmo
 * esqueleto da outra. Morava em `helpers.tsx`, e um arquivo de funções que
 * exporta um componente perde o Fast Refresh.
 */
export function TableSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded shrink-0" />
          <Skeleton className="h-4 w-14 shrink-0 font-mono" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full shrink-0" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
          <Skeleton className="h-4 w-10 shrink-0" />
          <div className="flex gap-1 shrink-0">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
