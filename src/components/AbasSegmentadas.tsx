// src/components/AbasSegmentadas.tsx
/**
 * A régua de abas em grupo segmentado.
 *
 * A página Analítico tinha DOIS vocabulários de aba a 40px um do outro: o
 * alternador de visão, um grupo segmentado com fundo elevado no item ativo, e a
 * régua de abas logo abaixo, sublinhada com `border-b-2`. Os dois faziam a mesma
 * coisa — escolher entre opções mutuamente exclusivas — com desenhos que não se
 * pareciam.
 *
 * Este é o desenho que fica. O sublinhado sai.
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AbaSegmentada<K extends string> {
  key: K;
  label: string;
  Icon: LucideIcon;
  /** Contador ao lado do rótulo (ex.: nº de órfãos). Zero não desenha. */
  badge?: number;
}

interface AbasSegmentadasProps<K extends string> {
  abas: readonly AbaSegmentada<K>[];
  ativa: K | null;
  onTrocar: (k: K) => void;
  className?: string;
}

export function AbasSegmentadas<K extends string>({
  abas, ativa, onTrocar, className,
}: AbasSegmentadasProps<K>) {
  if (abas.length === 0) return null;
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1',
        'max-w-full overflow-x-auto',
        className,
      )}
    >
      {abas.map(({ key, label, Icon, badge }) => (
        <button
          key={key}
          role="tab"
          aria-selected={ativa === key}
          onClick={() => onTrocar(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
            'whitespace-nowrap transition-colors',
            ativa === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
          )}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {label}
          {!!badge && (
            <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-bold text-warning">
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
