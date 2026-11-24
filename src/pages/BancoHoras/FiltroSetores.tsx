/**
 * Filtro de setores do Banco de Horas (18/11/2026): marca VÁRIOS setores e a
 * página inteira (comparativo dos 3 meses, números, abas, Excel) mostra a soma
 * só dos marcados. Nenhum marcado = todos os setores.
 */
import { Building2, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function FiltroSetores({ setores, marcados, onTrocar }: {
  /** Os setores do relatório em tela, já em ordem. */
  setores: readonly string[];
  marcados: readonly string[];
  onTrocar: (marcados: string[]) => void;
}) {
  const escolhidos = new Set(marcados);
  const rotulo = marcados.length === 0 ? 'Todos os setores'
    : marcados.length === 1 ? marcados[0]
      : `${marcados.length} setores`;
  const alternar = (s: string) => {
    const n = new Set(escolhidos);
    if (n.has(s)) n.delete(s); else n.add(s);
    // Mantém a ordem da lista, não a ordem em que foram clicados.
    onTrocar(setores.filter(x => n.has(x)));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button"
          className={cn('inline-flex h-8 w-52 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-left text-xs',
            marcados.length > 0 && 'border-primary/50 bg-primary/[0.05]')}
          title={marcados.length > 1 ? marcados.join(' + ') : undefined}>
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{rotulo}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Marque os setores para somar</span>
          {marcados.length > 0 && (
            <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => onTrocar([])}>
              Todos
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto p-1" role="group" aria-label="Setores">
          {setores.map(s => (
            <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
              <Checkbox checked={escolhidos.has(s)} onCheckedChange={() => alternar(s)} />
              <span className="truncate">{s}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
