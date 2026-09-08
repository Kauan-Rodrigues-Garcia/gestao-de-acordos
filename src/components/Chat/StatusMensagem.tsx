import { Check, CheckCheck, Clock3, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EstadoMensagem } from './estadoMensagem';

interface Props {
  estado: EstadoMensagem;
  /** No balão colorido, o tom neutro precisa herdar o contraste do texto. */
  noBalao?: boolean;
  className?: string;
}

const ROTULOS: Record<EstadoMensagem, string> = {
  pendente: 'Enviando',
  erro: 'Não enviada',
  enviada: 'Enviada',
  entregue: 'Entregue',
  lida: 'Visualizada',
};

export function StatusMensagem({ estado, noBalao = false, className }: Props) {
  const Icone = estado === 'pendente' ? Clock3 : estado === 'erro' ? CircleAlert : estado === 'enviada' ? Check : CheckCheck;
  const rotulo = ROTULOS[estado];

  return (
    <span
      role="img"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'inline-flex shrink-0 items-center',
        estado === 'lida'
          ? (noBalao ? 'text-amber-300' : 'text-amber-600 dark:text-amber-400')
          : (noBalao ? 'text-primary-foreground/65' : 'text-muted-foreground'),
        className,
      )}
    >
      <Icone aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
    </span>
  );
}
