/**
 * CardDiasUteisGeral — os dias úteis do mês para a empresa inteira: feriados
 * e «contar o dia de hoje». Os setores que trabalham diferente têm a exceção
 * deles (`CardDiasUteisSetor`).
 *
 * Saiu de `pages/MetasConfig.tsx` (22/10/2026). O estado continua na página:
 * a régua do setor, as equipes de treinamento e a gravação dependem dele.
 */
import { useState } from 'react';
import { CalendarDays, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from './SectionCard';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface Props {
  mes: number;
  ano: number;
  feriados: string[];
  onFeriados: (feriados: string[]) => void;
  contarDiaAtual: boolean;
  onContarDiaAtual: (v: boolean) => void;
  totalDiasUteis: number;
  /** `null` fora do mês atual. */
  diasTrabalhados: number | null;
  podeEditar: boolean;
  className?: string;
}

export function CardDiasUteisGeral({
  mes, ano, feriados, onFeriados, contarDiaAtual, onContarDiaAtual,
  totalDiasUteis, diasTrabalhados, podeEditar, className,
}: Props) {
  const [feriadoNovo, setFeriadoNovo] = useState('');

  function adicionarFeriado() {
    if (!feriadoNovo) return;
    const [y, m] = feriadoNovo.split('-').map(Number);
    if (y !== ano || m !== mes) {
      toast.warning(`O feriado deve estar em ${MESES[mes - 1]}/${ano}.`);
      return;
    }
    if (!feriados.includes(feriadoNovo)) onFeriados([...feriados, feriadoNovo].sort());
    setFeriadoNovo('');
  }

  return (
    <SectionCard
      title="Dias úteis do mês (geral)"
      description="Segunda a sexta, menos os feriados cadastrados. Usado para calcular a meta diária. Vale para todos os setores, menos os que têm dias úteis próprios."
      icon={<CalendarDays className="h-4 w-4" />}
      className={className}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">{totalDiasUteis}</p>
            <p className="text-[11px] text-muted-foreground">dias úteis em {MESES[mes - 1]}</p>
          </div>
          <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums">
              {diasTrabalhados !== null ? diasTrabalhados : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {diasTrabalhados !== null ? 'já trabalhados' : 'mês não atual'}
            </p>
          </div>
        </div>

        {/* O dia de hoje ainda está acontecendo: contá-lo infla o esperado
            e derruba a projeção/quartil de todo mundo durante o dia. */}
        <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={contarDiaAtual}
            disabled={!podeEditar}
            onChange={e => onContarDiaAtual(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-primary cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-[11px] leading-tight">
            <span className="font-medium text-foreground">Contar o dia de hoje</span>
            <span className="block text-muted-foreground">
              Desmarcado, os dias trabalhados consideram só os dias já fechados — o
              analítico de hoje ainda está entrando. Afeta a meta diária, a projeção
              e os quartis.
            </span>
          </span>
        </label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Feriados (a operação não trabalha)</Label>
          {podeEditar && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-8 text-sm max-w-[170px]"
                value={feriadoNovo}
                onChange={(e) => setFeriadoNovo(e.target.value)}
              />
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                onClick={adicionarFeriado} disabled={!feriadoNovo}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          )}
          {feriados.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {feriados.map(f => (
                <Badge key={f} variant="secondary" className="gap-1 text-xs font-normal">
                  {f.split('-').reverse().join('/')}
                  {podeEditar && (
                    <button type="button" className="hover:text-destructive"
                      aria-label={`Tirar ${f.split('-').reverse().join('/')}`}
                      onClick={() => onFeriados(feriados.filter(x => x !== f))}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nenhum feriado neste mês.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
