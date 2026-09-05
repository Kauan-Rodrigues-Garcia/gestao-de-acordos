// src/components/KpiTile.tsx
/**
 * KpiTile — o card de número do sistema.
 *
 * O Analítico desenhava essa grade em quatro lugares, cada um com um `<Card>`
 * chapado escrito à mão. O padrão que o resto da plataforma adotou (Pix
 * Automático) tem profundidade: borda arredondada, fundo em gradiente sutil e o
 * ícone dentro de uma caixa tingida pelo tom do número. Aqui ele vira um
 * componente, para não haver uma quinta versão.
 *
 * `valorNumerico` liga a animação: o número anda até o novo valor em vez de
 * saltar. Sem ele o tile mostra `valor` como texto e fica parado — é o certo
 * para contagens, onde a animação seria ruído.
 */
import type { LucideIcon } from 'lucide-react';
import { ValorAnimado } from '@/components/ValorAnimado';
import { cn } from '@/lib/utils';

export type TomKpi = 'primario' | 'neutro' | 'sucesso' | 'alerta';

const TONS: Record<TomKpi, { caixa: string; fundo: string; valor: string }> = {
  primario: {
    caixa: 'bg-primary/12 text-primary ring-1 ring-primary/20',
    fundo: 'from-primary/[0.06] to-transparent border-primary/20',
    valor: 'text-primary',
  },
  neutro: {
    caixa: 'bg-muted text-muted-foreground ring-1 ring-border',
    fundo: 'from-muted/40 to-transparent border-border',
    valor: 'text-foreground',
  },
  sucesso: {
    caixa: 'bg-success/12 text-success ring-1 ring-success/20',
    fundo: 'from-success/[0.06] to-transparent border-success/20',
    valor: 'text-success',
  },
  alerta: {
    caixa: 'bg-warning/15 text-warning ring-1 ring-warning/25',
    fundo: 'from-warning/[0.07] to-transparent border-warning/25',
    valor: 'text-warning',
  },
};

interface KpiTileProps {
  rotulo: string;
  /** O que aparece quando não há animação. */
  valor: string | number;
  /** Presente = o número anda até o novo valor. Use com `formatar`. */
  valorNumerico?: number;
  formatar?: (v: number) => string;
  sub?: string;
  Icon: LucideIcon;
  tom: TomKpi;
  className?: string;
}

export function KpiTile({
  rotulo, valor, valorNumerico, formatar, sub, Icon, tom, className,
}: KpiTileProps) {
  const t = TONS[tom];
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br p-4 h-full', t.fundo, className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {rotulo}
          </p>
          {valorNumerico !== undefined && formatar ? (
            <ValorAnimado
              valor={valorNumerico} formatar={formatar}
              className={cn('block text-lg font-bold font-mono leading-tight mt-1 truncate', t.valor)}
            />
          ) : (
            <p className={cn('text-lg font-bold font-mono leading-tight mt-1 truncate', t.valor)}>
              {valor}
            </p>
          )}
          {sub && <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', t.caixa)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
