/**
 * A pílula do Desafio do Vale na barra de cima: «9 médias · vale até R$ 120»
 * e, depois de aberta, o progresso. Mesmo molde das outras (h-9, uma linha).
 * Pisca («ABRA!») até a pessoa abrir uma vez neste navegador.
 */
import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DesafioVale } from '@/services/desafioVale/desafioVale.service';
import { faixasOrdenadas, faseDoPeriodo, reais } from '@/services/desafioVale/regras';
import { hojeEmSaoPaulo, medias } from '@/services/desafioCobranca/regras';

export function PilulaVale({ d, chamando, onAbrir }: { d: DesafioVale; chamando: boolean; onAbrir: () => void }) {
  const maior = faixasOrdenadas(d.faixas)[0]?.valor ?? 0;
  const fase = faseDoPeriodo(d.inicio, d.fim, hojeEmSaoPaulo());
  return (
    <button
      type="button" onClick={onAbrir}
      title={`${d.titulo}${d.previa ? ' (prévia: só você vê)' : ''}`}
      aria-label={chamando ? `Nova campanha: abra o ${d.titulo}` : `Abrir o ${d.titulo}: vale de até ${reais(maior)}`}
      className={cn(
        'relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-orange-400/50 bg-card pl-1 pr-3 shadow-sm transition-shadow hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        d.previa && 'border-dashed',
        chamando && 'dc-chamando',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-400/20 text-orange-600 dark:text-orange-300">
        <Ticket className="h-4 w-4" aria-hidden />
      </span>
      {chamando ? (
        <span className="text-xs font-semibold text-foreground"><span className="hidden sm:inline">Campanha especial · </span>abra!</span>
      ) : fase === 'depois' ? (
        <span className="text-xs font-semibold text-muted-foreground">{medias(d.medias)} · {d.fechado_em ? 'resultado' : 'encerrado'}</span>
      ) : (
        <span className="text-xs font-semibold text-foreground">
          {medias(d.medias)}<span className="hidden text-muted-foreground sm:inline"> · vale até </span><span className="hidden font-bold sm:inline">{reais(maior)}</span>
        </span>
      )}
      {chamando && <span className="dc-abra" aria-hidden>ABRA!</span>}
    </button>
  );
}
