import { Trophy } from 'lucide-react';
import { useId } from 'react';
import { LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { PremioPorPosicao } from '@/services/desafios/types';
import type { EstiloTema } from './tema';
import { PodioDesafio } from './PodioDesafio';
import { RankingDesafio } from './RankingDesafio';

interface Props {
  lista: ResultadoParticipante[];
  premios: PremioPorPosicao[];
  tema: EstiloTema;
  mostrarFotos: boolean;
  animar: boolean;
  voceId?: string | null;
  corridaDeProjecao?: boolean;
  compacto?: boolean;
}

export function ClassificacaoDesafio({ lista, premios, compacto = false, ...visual }: Props) {
  // A aba e a gaveta podem coexistir: suas animações não devem compartilhar IDs.
  const grupo = useId();
  if (!lista.length) return null;
  const top5 = lista.slice(0, 5);
  const demais = lista.slice(5);

  return (
    <LayoutGroup id={grupo}>
      <div className="space-y-5">
        <section aria-label="Primeiros colocados" className={cn('rounded-2xl border border-border bg-card', compacto ? 'p-3' : 'p-3 sm:p-5')}>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-600 dark:text-amber-300"><Trophy className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">Primeiros colocados</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{premios.length ? 'Premiação por posição · classificação atual' : 'Classificação atual do desafio'}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">TOP {top5.length}</span>
          </div>
          <PodioDesafio top5={top5} premios={premios} compacto={compacto} {...visual} />
        </section>
        {demais.length > 0 && (
          <section aria-label="Demais colocados" className={cn('rounded-2xl border border-border bg-card', compacto ? 'p-3' : 'p-3 sm:p-5')}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Demais colocados</h3>
              <span className="text-xs tabular-nums text-muted-foreground">{demais.length} participante{demais.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mb-2 flex justify-between gap-3 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Participante</span><span>{visual.corridaDeProjecao ? 'Projeção' : 'Recebido'}</span>
            </div>
            <RankingDesafio lista={demais} premios={premios} {...visual} />
          </section>
        )}
      </div>
    </LayoutGroup>
  );
}
