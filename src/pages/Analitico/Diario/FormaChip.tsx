/**
 * FormaChip — badge colorido para a forma de pagamento bruta do relatório
 * diário (Pix, Boleto, Cartão Padrão…), na paleta do restante do projeto.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formaKindDiario } from '@/services/diario/diarioComum';

const KIND_CLASS: Record<string, string> = {
  pix:    'border-emerald-300 text-emerald-700 dark:text-emerald-400',
  boleto: 'border-amber-300 text-amber-700 dark:text-amber-400',
  cartao: 'border-purple-300 text-purple-700 dark:text-purple-400',
  outro:  'border-border text-muted-foreground',
};

export function FormaChip({ forma, className }: { forma: string; className?: string }) {
  const kind = formaKindDiario(forma);
  return (
    <Badge variant="outline" className={cn('text-xs whitespace-nowrap', KIND_CLASS[kind], className)}>
      {forma || '—'}
    </Badge>
  );
}
