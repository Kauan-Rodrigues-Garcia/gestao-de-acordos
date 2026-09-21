/**
 * LinhaChip — um chip físico: número, operadora, status com o tempo, e as ações.
 *
 * `memo` porque a seção redesenha a cada segundo (o contador «Tempo encerrado»
 * depende do relógio) e a linha não precisa: o cronômetro dela assina o relógio
 * sozinho, dentro de `TempoDoChip`.
 */
import { memo } from 'react';
import { MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { OPERADORA_LABELS } from '@/services/chipsFisicos/chipsFisicosRegras';
import type { ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { StatusDoChip } from './StatusDoChip';

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export interface LinhaChipProps {
  chip: ChipFisicoRow;
  podeCuidar: boolean;
  onStatus: (chip: ChipFisicoRow) => void;
  onCorrigir: (chip: ChipFisicoRow) => void;
  onExcluir: (chip: ChipFisicoRow) => void;
}

export const LinhaChip = memo(function LinhaChip({
  chip, podeCuidar, onStatus, onCorrigir, onExcluir,
}: LinhaChipProps) {
  const numero = mascararNumero(chip.numero);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-md border px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm font-medium tabular-nums">{numero}</span>
          {chip.operadora && (
            <span className="text-xs text-muted-foreground">{OPERADORA_LABELS[chip.operadora]}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusDoChip chip={chip} />
        </div>
        <p className="text-xs text-muted-foreground">
          Desde {dataHora(chip.status_desde)}
          {chip.status_por_nome ? ` · por ${chip.status_por_nome}` : ''}
        </p>
        {chip.observacao && (
          <p className="break-words text-xs text-muted-foreground">{chip.observacao}</p>
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
