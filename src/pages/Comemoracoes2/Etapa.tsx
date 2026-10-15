/**
 * Etapa — um passo do estúdio, que abre e fecha.
 *
 * Uma etapa aberta por vez: a montagem tem sete perguntas, e mostrar todas de
 * uma vez era o que deixava a aba antiga pesada de ler. Fechada, a etapa diz
 * em uma linha o que foi escolhido, então dá para conferir tudo sem abrir nada.
 */
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Etapa({
  numero, titulo, resumo, aberta, onAbrir, alerta, children,
}: {
  numero:   number;
  titulo:   string;
  resumo:   ReactNode;
  aberta:   boolean;
  onAbrir:  () => void;
  /** Falta algo nesta etapa para dar para enviar. */
  alerta?:  boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn(
      'rounded-2xl border bg-card transition-shadow',
      aberta ? 'border-primary/40 shadow-sm' : 'border-border',
    )}>
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
          aberta ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}>
          {numero}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titulo}</span>
          {!aberta && (
            <span className={cn('block truncate text-xs', alerta ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
              {resumo}
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

/** Fileira de escolhas curtas (modelo, letra, entrada...). */
export function Opcoes<T extends string>({
  opcoes, valor, onEscolher, colunas = 4, rotulo,
}: {
  opcoes:     readonly { id: T; nome: string; descricao?: string }[];
  valor:      T | null;
  onEscolher: (id: T) => void;
  colunas?:   2 | 3 | 4;
  rotulo:     string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div role="radiogroup" aria-label={rotulo}
        className={cn('grid gap-1.5', colunas === 2 ? 'grid-cols-2' : colunas === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            title={o.descricao}
            onClick={() => onEscolher(o.id)}
            className={cn(
              'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              valor === o.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-accent',
            )}
          >
            {o.nome}
          </button>
        ))}
      </div>
    </div>
  );
}
