/**
 * StatusDoChip — a etiqueta do status e, quando houver, o tempo dele.
 *
 * O tempo é o `prazo_ate` gravado, comparado com o relógio único da tela
 * (`useAgora`): duas telas abertas mostram a mesma contagem, e recarregar não
 * reinicia nada. Quando acaba, aparece «Tempo encerrado» — o status continua o
 * mesmo até alguém mudar.
 *
 * Só o componente do tempo assina o relógio: um chip sem tempo não redesenha a
 * cada segundo.
 */
import { BellRing, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgora } from '@/hooks/useAgora';
import { formatarRestante } from '@/services/numeros/numerosRegras';
import {
  STATUS_CHIP_LABELS, estadoDoTempo, type StatusChip,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { COR_TEMPO_ENCERRADO, CORES_STATUS_CHIP } from './coresStatusChip';

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function EtiquetaStatusChip({ status }: { status: StatusChip }) {
  return (
    <Badge variant="outline" className={cn('font-medium', CORES_STATUS_CHIP[status])}>
      {STATUS_CHIP_LABELS[status]}
    </Badge>
  );
}

export function TempoDoChip({ chip }: { chip: { status: StatusChip; prazo_ate: string | null } }) {
  const agora = useAgora();
  const tempo = estadoDoTempo(chip, agora);
  if (tempo.tipo === 'sem_tempo' || !chip.prazo_ate) return null;

  if (tempo.tipo === 'encerrado') {
    return (
      <Badge
        variant="outline"
        className={cn('gap-1 font-semibold', COR_TEMPO_ENCERRADO)}
        title={`O tempo terminou em ${dataHora(chip.prazo_ate)}`}
      >
        <BellRing className="h-3 w-3" aria-hidden />
        Tempo encerrado
      </Badge>
    );
  }

  const restante = formatarRestante(tempo.restanteMs);
  return (
    <Badge
      variant="outline"
      role="timer"
      className="gap-1 font-mono tabular-nums"
      title={`Termina em ${dataHora(chip.prazo_ate)}`}
      aria-label={`Faltam ${restante}. Termina em ${dataHora(chip.prazo_ate)}.`}
    >
      <Timer className="h-3 w-3" aria-hidden />
      {restante}
    </Badge>
  );
}

export function StatusDoChip({ chip }: { chip: { status: StatusChip; prazo_ate: string | null } }) {
  return (
    <>
      <EtiquetaStatusChip status={chip.status} />
      {chip.prazo_ate && <TempoDoChip chip={chip} />}
    </>
  );
}
