/**
 * SeletorFiltro — o filtro do Quadro de Pessoal, no lugar do `<select>` nativo.
 *
 * O Cleber achou feia a lista do navegador (13/11/2026): sem busca, sem
 * agrupamento, sem dizer quanto tem em cada opção. Aqui a lista abre num
 * painel com busca, as opções agrupadas (por cidade, no caso dos setores),
 * a contagem à direita e um selo opcional (Alternativo, marca…).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, X, type LucideIcon } from 'lucide-react';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
  /** Linha pequena embaixo do rótulo (ex.: «Birigui · BookPlay»). */
  detalhe?: string;
  /** Agrupa na lista; a ordem dos grupos é a da primeira aparição. */
  grupo?: string;
  contagem?: number;
  /** Selo à direita do rótulo (ex.: «Alternativo»). */
  selo?: ReactNode;
}

export function SeletorFiltro({
  valor, opcoes, onTrocar, Icone, rotuloTodos, placeholderBusca = 'Buscar…', vazio = 'Nada encontrado.',
  rotulo, className, largura = 'w-80', semTodos,
}: {
  valor: string | null;
  opcoes: readonly OpcaoFiltro[];
  onTrocar: (valor: string | null) => void;
  Icone: LucideIcon;
  /** O rótulo de «nenhum filtro» (ex.: «Todos os setores»). */
  rotuloTodos: string;
  placeholderBusca?: string;
  vazio?: string;
  /** Rótulo acessível do botão. */
  rotulo: string;
  className?: string;
  largura?: string;
  /** Sem a opção «todos» (o valor sempre é um dos itens). */
  semTodos?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find(o => o.valor === valor) ?? null;

  const grupos = useMemo(() => {
    const m = new Map<string, OpcaoFiltro[]>();
    for (const o of opcoes) {
      const g = o.grupo ?? '';
      m.set(g, [...(m.get(g) ?? []), o]);
    }
    return [...m.entries()];
  }, [opcoes]);

  const escolher = (v: string | null) => { onTrocar(v); setAberto(false); };
  const mostraBusca = opcoes.length > 7;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={rotulo}
          className={cn(
            'group inline-flex h-9 max-w-full items-center gap-2 rounded-md border bg-background pl-2.5 pr-2 text-sm transition',
            'hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            atual && !semTodos ? 'border-primary/50 bg-primary/5' : 'border-input',
            className,
          )}
        >
          <Icone className={cn('size-4 shrink-0', atual && !semTodos ? 'text-primary' : 'text-muted-foreground')} />
          <span className={cn('min-w-0 truncate', atual ? 'font-medium text-foreground' : 'text-foreground/80')}>
            {atual?.rotulo ?? rotuloTodos}
          </span>
          {atual && !semTodos ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Tirar filtro"
              onClick={e => { e.stopPropagation(); onTrocar(null); }}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-data-[state=open]:rotate-180" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-0', largura)} align="start">
        <Command>
          {mostraBusca && <CommandInput placeholder={placeholderBusca} />}
          <CommandList className="max-h-80">
            <CommandEmpty>{vazio}</CommandEmpty>
            {!semTodos && (
              <>
                <CommandGroup>
                  <CommandItem value={`__todos__ ${rotuloTodos}`} onSelect={() => escolher(null)} className="gap-2">
                    <Check className={cn('size-4', valor === null ? 'opacity-100 text-primary' : 'opacity-0')} />
                    <span className="font-medium">{rotuloTodos}</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {grupos.map(([grupo, lista]) => (
              <CommandGroup key={grupo || '_'} heading={grupo || undefined}>
                {lista.map(o => (
                  <CommandItem
                    key={o.valor}
                    value={`${o.rotulo} ${o.detalhe ?? ''} ${grupo} ${o.valor}`}
                    onSelect={() => escolher(o.valor)}
                    className="gap-2"
                  >
                    <Check className={cn('size-4 shrink-0', valor === o.valor ? 'opacity-100 text-primary' : 'opacity-0')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{o.rotulo}</span>
                        {o.selo}
                      </span>
                      {o.detalhe && <span className="block truncate text-[11px] text-muted-foreground">{o.detalhe}</span>}
                    </span>
                    {o.contagem !== undefined && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {o.contagem}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
