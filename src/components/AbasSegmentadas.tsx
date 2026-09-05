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
 *
 * ## Por que `role="group"` e não `role="tablist"`
 *
 * Porque `role="tab"` promete um contrato que este componente não cumpre. O
 * padrão ARIA de abas não é só `aria-controls`: é seta esquerda/direita andando
 * entre as abas, Home/End, e roving tabindex. Quem usa leitor de tela ouve
 * "tablist" e MUDA o próprio comportamento para o que o papel promete — aperta
 * a seta e não acontece nada. Anunciar um papel que não se honra é pior do que
 * não anunciar papel nenhum.
 *
 * E metade dos usos aqui nem são abas: a lente Mês · Dia · Período é um recorte
 * que filtra a página, e `lista`/`mapa` é um alternador de visão. `role="group"`
 * com `aria-pressed` é honesto nos dois casos e no das abas de verdade — é o
 * mesmo padrão de `PainelMetas/SeletorUnidade`, que já é a forma da casa.
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
  /**
   * O que este grupo escolhe — vira o `aria-label`. Obrigatório de propósito:
   * um componente compartilhado não sabe sozinho o que está selecionando, e um
   * grupo anônimo não ajuda ninguém.
   */
  rotulo: string;
  className?: string;
}

export function AbasSegmentadas<K extends string>({
  abas, ativa, onTrocar, rotulo, className,
}: AbasSegmentadasProps<K>) {
  if (abas.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1',
        'max-w-full overflow-x-auto',
        className,
      )}
    >
      {abas.map(({ key, label, Icon, badge }) => (
        <button
          key={key}
          type="button"
          aria-pressed={ativa === key}
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
