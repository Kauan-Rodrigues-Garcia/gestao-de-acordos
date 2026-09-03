/**
 * EditorPremios — o prêmio de cada colocação.
 *
 * ## Por que uma lista, e não um campo de texto
 *
 * Porque «1º Tablet, 2º Rodízio + acompanhante, 3º Rodízio + acompanhante, 4º
 * Almoço, 5º Almoço» escrito num campo só é um parágrafo: a tela não consegue
 * dizer quem está levando o quê agora, que é justamente a informação que
 * transforma a lista de brindes em placar.
 *
 * Com a lista, o painel de acompanhamento casa cada posição com quem está
 * nela — e o pódio sabe que o segundo e o terceiro ganham a mesma coisa.
 *
 * ## As posições não precisam ser contíguas
 *
 * 1º, 2º e 5º é uma premiação válida. Inventar o 3º e o 4º para tapar o buraco
 * mostraria dois prêmios que não existem.
 *
 * ## O campo de texto solto continua existindo
 *
 * `Desafio.premio` não morreu: a campanha com um prêmio único («um dia de
 * folga para quem bater a meta») não tem colocação nenhuma, e obrigá-la a
 * inventar uma primeira posição mentiria sobre a regra.
 */
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PremioPorPosicao } from '@/services/desafios/types';

export interface EditorPremiosProps {
  valor: PremioPorPosicao[];
  onChange: (valor: PremioPorPosicao[]) => void;
}

/** Cor da medalha nas três primeiras. Da quarta em diante, o cinza da tabela. */
const CORES = [
  'text-amber-500',
  'text-slate-400',
  'text-orange-600 dark:text-orange-400',
];

export function EditorPremios({ valor, onChange }: EditorPremiosProps) {
  /** A próxima posição livre — a maior existente mais um, ou 1 na lista vazia. */
  const proxima = valor.length ? Math.max(...valor.map(p => p.posicao)) + 1 : 1;

  function alterar(indice: number, campo: keyof PremioPorPosicao, bruto: string) {
    const copia = [...valor];
    if (campo === 'posicao') {
      const n = Number(bruto);
      copia[indice] = { ...copia[indice], posicao: Number.isInteger(n) && n > 0 ? n : 1 };
    } else {
      copia[indice] = { ...copia[indice], [campo]: bruto };
    }
    onChange(copia);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">Prêmio por colocação</Label>
        <span className="text-[11px] text-muted-foreground">
          {valor.length ? `${valor.length} colocaç${valor.length === 1 ? 'ão' : 'ões'}` : 'opcional'}
        </span>
      </div>

      {valor.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Sem colocações. A campanha usa o prêmio único escrito acima.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {valor.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />

              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  value={p.posicao}
                  onChange={e => alterar(i, 'posicao', e.target.value)}
                  className={cn(
                    'h-8 w-14 text-center text-xs font-semibold',
                    CORES[p.posicao - 1] ?? '',
                  )}
                  aria-label="Colocação"
                />
                <span className="text-xs text-muted-foreground">º</span>
              </div>

              <Input
                value={p.icone ?? ''}
                onChange={e => alterar(i, 'icone', e.target.value)}
                placeholder="🏆"
                maxLength={4}
                className="h-8 w-14 text-center text-xs"
                aria-label="Ícone da colocação"
              />

              <Input
                value={p.premio}
                onChange={e => alterar(i, 'premio', e.target.value)}
                placeholder="Tablet, rodízio com acompanhante, almoço…"
                className="h-8 flex-1 text-xs"
                aria-label="Prêmio"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(valor.filter((_, j) => j !== i))}
                className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remover a ${p.posicao}ª colocação`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...valor, { posicao: proxima, premio: '' }])}
        className="w-full gap-1.5 text-xs"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar colocação
      </Button>
    </div>
  );
}
