/**
 * LinhaSugestaoComissao — a comissão calculada, embaixo do valor da linha.
 *
 * É sugestão e se apresenta como tal: o número que vai para a folha é o da
 * coluna Valor. Quando os dois divergem, a linha avisa em âmbar — é a
 * conferência que a liderança faz antes de concluir a equipe.
 */
import { cn } from '@/lib/utils';
import type { SugestaoComissao } from '@/services/rh/rhComissao';

interface LinhaSugestaoComissaoProps {
  sugestao: SugestaoComissao | undefined;
  /** O valor lançado. `numeric`: chega como número ou como texto. */
  valor: number | string | null;
}

export default function LinhaSugestaoComissao({ sugestao, valor }: LinhaSugestaoComissaoProps) {
  if (!sugestao) return null;

  const lancado = valor === null || valor === '' ? null : Number(valor);
  const diverge = sugestao.valor !== null && lancado !== null
    && Math.round(lancado * 100) !== Math.round(sugestao.valor * 100);

  return (
    <p
      className={cn(
        'mt-0.5 text-[10px] leading-tight',
        diverge ? 'text-amber-500' : 'text-muted-foreground',
      )}
      title={diverge ? 'O valor lançado é diferente da comissão calculada' : undefined}
    >
      {sugestao.rotulo}
    </p>
  );
}
