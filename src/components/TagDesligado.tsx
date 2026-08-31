/**
 * TagDesligado — a etiqueta de quem saiu mas ainda conta no mês.
 *
 * Desligar alguém não muda mais nada no mês corrente: a pessoa segue na equipe,
 * no analítico e nos cards, e o recebimento dela continua sendo da equipe. Quem
 * trabalhou até o dia 20 produziu até o dia 20.
 *
 * Só que uma lista onde nada distingue quem saiu de quem ficou é uma armadilha:
 * o líder cobra meta de alguém que não está mais lá. A etiqueta resolve isso
 * sem mexer em número nenhum — informa, não filtra.
 *
 * Na virada do mês a pessoa é ARQUIVADA e some das listas; a etiqueta deixa de
 * aparecer porque não há mais linha para etiquetar. Ver 20260831160000.
 */
import { cn } from '@/lib/utils';

export function TagDesligado({
  situacao, className,
}: {
  situacao: string | null | undefined;
  className?: string;
}) {
  if (situacao !== 'desligado') return null;
  return (
    <span
      title="Desligado — sai das listas na virada do mês"
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide',
        'bg-muted text-muted-foreground ring-1 ring-border',
        className,
      )}
    >
      Desligado
    </span>
  );
}
