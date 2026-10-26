/**
 * CardQuartis — as faixas de % da projeção diária, da empresa no mês.
 *
 * Os quartis valem para todos os setores, então quem os muda é a gestão
 * (super admin e administrador). Para os outros o cartão é só leitura
 * (22/10/2026): um líder mexendo aqui mudava o quartil da empresa inteira.
 */
import { Target } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { QuartilConfig } from '@/lib/supabase';
import { ordenarQuartis } from '@/lib/diasUteis';
import { SectionCard } from './SectionCard';

interface Props {
  quartis: QuartilConfig[];
  onChange: (quartis: QuartilConfig[]) => void;
  podeEditar: boolean;
  /** Só leitura por ser da gestão (e não por falta de permissão): explica. */
  daGestao?: boolean;
  className?: string;
}

export function CardQuartis({ quartis, onChange, podeEditar, daGestao = false, className }: Props) {
  function setPct(quartil: number, pct: string) {
    const num = parseInt(pct.replace(/\D/g, ''), 10);
    onChange(quartis.map(q => (q.quartil === quartil ? { ...q, min_pct: isNaN(num) ? 0 : num } : q)));
  }

  return (
    <SectionCard
      title="Quartis de projeção"
      description="Faixas de % da projeção diária (realizado ÷ esperado até hoje). 1º quartil = melhor."
      icon={<Target className="h-4 w-4" />}
      className={className}
    >
      <div className="space-y-2">
        {ordenarQuartis(quartis).map((q, i, arr) => {
          const tetoAcima = i > 0 ? arr[i - 1].min_pct - 1 : null;
          return (
            <div key={q.quartil} className="flex items-center gap-3">
              <span className="text-sm font-semibold w-20 shrink-0">{q.quartil}º quartil</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">a partir de</span>
                <Input
                  className="h-8 w-20 text-sm text-center"
                  value={String(q.min_pct)}
                  disabled={!podeEditar}
                  onChange={(e) => setPct(q.quartil, e.target.value)}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {tetoAcima !== null ? `${q.min_pct}% – ${tetoAcima}%` : `≥ ${q.min_pct}%`}
              </span>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground pt-1">
          {daGestao
            ? 'Os quartis valem para todos os setores e são definidos pela gestão.'
            : 'Com meta + dias úteis configurados, cada operador vê no dashboard a meta diária, a projeção e o quartil em que está.'}
        </p>
      </div>
    </SectionCard>
  );
}
