/**
 * BotaoAgendarProxima — o «Agendar 2/5» da coluna de status.
 *
 * Morava como ícone solto na coluna de ações, e sumia de dois jeitos:
 *
 *  • a aba Acordos nunca teve o ícone — só o Dashboard;
 *  • a coluna de ações tem 176 px e, num acordo pendente, já carrega Marcar
 *    pago, WhatsApp, Editar, Excluir e a setinha. O calendário era o sexto, o
 *    segundo da esquerda num `justify-end` — cortado pela borda da célula.
 *
 * Aqui ele vira um rótulo com texto embaixo do status: dá para ver de longe
 * que falta agendar, e o clique está no mesmo lugar em que o olho procura.
 */
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DecisaoReagendar } from '@/services/reagendamento/reagendamento';

interface Props {
  decisao: DecisaoReagendar;
  /** Nome de quem é o acordo — quando não é quem está clicando. */
  dono?: string | null;
  onClick: () => void;
  className?: string;
}

export function BotaoAgendarProxima({ decisao, dono, onClick, className }: Props) {
  const rotulo = `Agendar ${decisao.proximaNumero}/${decisao.totalParcelas}`;
  const dica = dono
    ? `Agendar a parcela ${decisao.proximaNumero}/${decisao.totalParcelas} — ela nasce no nome de ${dono}`
    : `Agendar a parcela ${decisao.proximaNumero}/${decisao.totalParcelas}`;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={dica}
      aria-label={dica}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5',
        'text-[10px] font-semibold',
        'border-warning/40 bg-warning/10 text-warning',
        'hover:bg-warning/20 hover:border-warning/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50',
        'transition-colors',
        className,
      )}
    >
      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
      {rotulo}
    </button>
  );
}
