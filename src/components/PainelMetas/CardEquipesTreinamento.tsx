/**
 * CardEquipesTreinamento — as equipes que começaram no meio do mês: a data de
 * início encurta os dias úteis delas (e a meta diária e a projeção).
 *
 * Saiu de `pages/MetasConfig.tsx` (22/10/2026). Os feriados são os do setor
 * em tela (a exceção dele, se tiver); a gravação da data fica na página.
 */
import { GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { diasUteisDoMes } from '@/lib/diasUteis';
import { SectionCard } from './SectionCard';

interface EquipeTreinamento { id: string; nome: string; treinamento_inicio: string | null }

interface Props {
  equipes: EquipeTreinamento[];
  mes: number;
  ano: number;
  /** Os feriados do setor em tela. */
  feriados: string[];
  /** Dias úteis do mês cheio, para a equipe ainda sem data. */
  diasUteisDoMesCheio: number;
  onInicio: (equipeId: string, dataISO: string) => void;
  /** A equipe cuja data está sendo gravada. */
  salvando: string | null;
  podeEditar: boolean;
}

export function CardEquipesTreinamento({
  equipes, mes, ano, feriados, diasUteisDoMesCheio, onInicio, salvando, podeEditar,
}: Props) {
  return (
    <SectionCard
      title="Equipes de treinamento"
      description="Equipes que começaram no meio do mês. Informe a data de início — os dias úteis (e a meta diária/projeção da equipe e dos operadores) passam a contar a partir dela."
      icon={<GraduationCap className="h-4 w-4" />}
      badge={equipes.length}
    >
      <div className="space-y-2">
        {equipes.map(eq => {
          const inicio = eq.treinamento_inicio ?? '';
          const uteis = diasUteisDoMes(ano, mes, feriados, inicio || undefined);
          return (
            <div key={eq.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-2 sm:w-52 shrink-0">
                <GraduationCap className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm font-medium truncate">{String(eq.nome ?? '')}</p>
              </div>
              <div className="flex flex-1 items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Início das atividades</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm max-w-[170px]"
                    value={inicio}
                    disabled={!podeEditar || salvando === eq.id}
                    onChange={e => onInicio(eq.id, e.target.value)}
                  />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-center">
                  <p className="text-base font-bold tabular-nums">{inicio ? uteis : diasUteisDoMesCheio}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {inicio ? 'dias úteis no treino' : 'sem data — mês cheio'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground pt-1">
          Feriados antes do início são ignorados; feriados após entram no cálculo.
          Marque/desmarque uma equipe como treinamento na aba <strong>Equipes</strong>.
        </p>
      </div>
    </SectionCard>
  );
}
