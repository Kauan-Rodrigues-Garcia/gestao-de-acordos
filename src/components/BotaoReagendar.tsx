/**
 * BotaoReagendar — o calendário azul da coluna de ações.
 *
 * O mesmo botão de ícone que a lista da PaguePlay sempre teve, agora nas duas
 * tabelas (Dashboard e aba Acordos) e no detalhe. Azul, não na cor primária do
 * tema, para não se confundir com o verde do «Marcar como pago» ao lado.
 *
 * Quem decide se ele aparece é `podeReagendar` (services/reagendamento): só
 * quando a próxima parcela ainda não foi agendada.
 */
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rotuloReagendar, type DecisaoReagendar } from '@/services/reagendamento/reagendamento';

interface Props {
  decisao: DecisaoReagendar;
  /** Nome de quem é o acordo — quando não é quem está clicando. */
  dono?: string | null;
  onClick: () => void;
  className?: string;
}

export function BotaoReagendar({ decisao, dono, onClick, className }: Props) {
  const dica = dono
    ? `${rotuloReagendar(decisao)} — no nome de ${dono}`
    : rotuloReagendar(decisao);
  return (
    <Button
      variant="ghost" size="icon"
      className={cn(
        'w-8 h-8 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700',
        'dark:text-blue-400 dark:hover:text-blue-300',
        className,
      )}
      title={dica}
      aria-label={dica}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <CalendarClock className="w-4 h-4" />
    </Button>
  );
}
