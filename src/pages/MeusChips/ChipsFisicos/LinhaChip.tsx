/**
 * LinhaChip — o cartão de um chip físico (2.0, 17/11/2026).
 *
 * Faixa de cor do status na borda, número em destaque, operadora, etiquetas,
 * status com o tempo, lembrete, e os dias em que o chip ficou ativo.
 *
 * `memo` porque a seção redesenha a cada segundo (o contador «Tempo encerrado»
 * depende do relógio) e o cartão não precisa: os pedaços que contam o tempo
 * assinam o relógio sozinhos (`TempoDoChip`, `LembreteDoChip`, `DiasAtivo`).
 */
import { memo } from 'react';
import {
  AlarmClock, BellRing, CalendarCheck, MoreHorizontal, Pencil, RefreshCw, Tag, Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAgora } from '@/hooks/useAgora';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { formatarRestante } from '@/services/numeros/numerosRegras';
import {
  ETIQUETA_CHIP_LABELS, OPERADORA_LABELS, estadoDoLembrete, etiquetasDoChip, rotuloDias,
  tempoAtivoMs,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import type { ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { StatusDoChip } from './StatusDoChip';
import { COR_ETIQUETA, COR_LEMBRETE, FAIXA_STATUS_CHIP } from './coresStatusChip';

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export interface LinhaChipProps {
  chip: ChipFisicoRow;
  podeCuidar: boolean;
  /** As colunas da 2.0 existem no banco (etiquetas, lembrete, dias). */
  recursos2?: boolean;
  onStatus: (chip: ChipFisicoRow) => void;
  onCorrigir: (chip: ChipFisicoRow) => void;
  onExcluir: (chip: ChipFisicoRow) => void;
  onEtiquetas?: (chip: ChipFisicoRow) => void;
  onLembrete?: (chip: ChipFisicoRow) => void;
}

/** «Ativo há 12 dias · 30 dias ativo no total». */
function DiasAtivo({ chip }: { chip: ChipFisicoRow }) {
  const agora = useAgora();
  const total = tempoAtivoMs(chip, agora);
  const atual = chip.status === 'ativo' ? Math.max(agora - new Date(chip.status_desde).getTime(), 0) : 0;
  const acumulado = (chip.ativo_acumulado_seg ?? 0) > 0;
  if (chip.status !== 'ativo' && !acumulado) return null;
  return (
    <span className="inline-flex items-center gap-1" title="Dias em que o chip ficou marcado como Ativo">
      <CalendarCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      {chip.status === 'ativo' && <>Ativo há <strong className="font-semibold text-foreground">{rotuloDias(atual)}</strong></>}
      {acumulado && (
        <span className="text-muted-foreground">
          {chip.status === 'ativo' ? ' · ' : ''}{rotuloDias(total)} ativo no total
        </span>
      )}
    </span>
  );
}

function LembreteDoChip({ chip }: { chip: ChipFisicoRow }) {
  const agora = useAgora();
  const l = estadoDoLembrete(chip, agora);
  if (l.tipo === 'sem_lembrete') return null;
  if (l.tipo === 'vencido') {
    return (
      <Badge variant="outline" className={cn('gap-1 font-semibold', COR_LEMBRETE, 'animate-pulse')} title={l.texto}>
        <BellRing className="h-3 w-3" aria-hidden /> Lembrete: {l.texto}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('max-w-full gap-1', COR_LEMBRETE)} title={`${l.texto} — termina em ${dataHora(chip.lembrete_ate!)}`}>
      <AlarmClock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{l.texto}</span>
      <span className="font-mono tabular-nums">{formatarRestante(l.restanteMs)}</span>
    </Badge>
  );
}

export const LinhaChip = memo(function LinhaChip({
  chip, podeCuidar, recursos2 = false, onStatus, onCorrigir, onExcluir, onEtiquetas, onLembrete,
}: LinhaChipProps) {
  const numero = mascararNumero(chip.numero);
  const etiquetas = etiquetasDoChip(chip);

  return (
    <div
      className={cn(
        'relative flex flex-wrap items-start justify-between gap-x-3 gap-y-2 overflow-hidden rounded-lg border bg-card py-3 pl-4 pr-3',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        FAIXA_STATUS_CHIP[chip.status],
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight">{numero}</span>
          {chip.operadora && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {OPERADORA_LABELS[chip.operadora]}
            </span>
          )}
          {etiquetas.map(e => (
            <span key={e} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', COR_ETIQUETA[e])}>
              {ETIQUETA_CHIP_LABELS[e]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusDoChip chip={chip} />
          <LembreteDoChip chip={chip} />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <DiasAtivo chip={chip} />
          <span>
            Desde {dataHora(chip.status_desde)}
            {chip.status_por_nome ? ` · por ${chip.status_por_nome}` : ''}
          </span>
        </p>
        {chip.observacao && (
          <p className="break-words text-sm font-bold text-foreground">{chip.observacao}</p>
        )}
      </div>

      {podeCuidar && (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onStatus(chip)}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Status
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Mais ações para ${numero}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {recursos2 && onEtiquetas && (
                <DropdownMenuItem onSelect={() => onEtiquetas(chip)}>
                  <Tag className="mr-2 h-3.5 w-3.5" aria-hidden /> Etiquetas
                </DropdownMenuItem>
              )}
              {recursos2 && onLembrete && (
                <DropdownMenuItem onSelect={() => onLembrete(chip)}>
                  <AlarmClock className="mr-2 h-3.5 w-3.5" aria-hidden />
                  {chip.lembrete_ate ? 'Lembrete (trocar)' : 'Criar lembrete'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onCorrigir(chip)}>
                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden /> Corrigir
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onExcluir(chip)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});
