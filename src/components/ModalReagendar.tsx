import { useState, useEffect } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/DatePickerField';
import { Acordo } from '@/lib/supabase';
import { parseCurrencyInput, formatDate } from '@/lib/index';
import { toast } from 'sonner';
import { vencimentoSugerido } from '@/lib/vencimentos';

/**
 * As funções de data moram em `lib/vencimentos.ts` desde que o modal de
 * ADICIONAR parcelas passou a precisar da mesma regra — duas telas calculando
 * vencimento por conta própria acabariam divergindo. Reexportadas aqui para os
 * imports antigos seguirem valendo.
 */
export {
  ultimoDiaProxMes, trintaDiasDepois, mesmoDiaProxMes, vencimentoSugerido,
} from '@/lib/vencimentos';

export interface ReagendarParams {
  novoVencimento: string;
  novoValor: number;
}

export interface ModalReagendarProps {
  aberto: boolean;
  parcelaAtual: Acordo;
  proximaNumero: number;
  totalParcelas: number;
  salvando: boolean;
  /** Valor pré-calculado da próxima parcela (corrige regra dos 40%). */
  valorProxima?: number;
  /** Decide a data sugerida: PaguePlay = fim do mês seguinte; BookPlay = +30 dias. */
  isPaguePlay?: boolean;
  onConfirm: (params: ReagendarParams) => Promise<void>;
  onClose: () => void;
}

export function ModalReagendar({
  aberto,
  parcelaAtual,
  proximaNumero,
  totalParcelas,
  salvando,
  valorProxima,
  isPaguePlay = true,
  onConfirm,
  onClose,
}: ModalReagendarProps) {
  const defaultVencimento = vencimentoSugerido(parcelaAtual.vencimento, isPaguePlay, proximaNumero);
  const defaultValor = (valorProxima ?? parcelaAtual.valor).toFixed(2).replace('.', ',');

  const [novoVencimento, setNovoVencimento] = useState(defaultVencimento);
  const [novoValorStr,   setNovoValorStr]   = useState(defaultValor);

  useEffect(() => {
    if (!aberto) return;
    setNovoVencimento(vencimentoSugerido(parcelaAtual.vencimento, isPaguePlay, proximaNumero));
    setNovoValorStr((valorProxima ?? parcelaAtual.valor).toFixed(2).replace('.', ','));
  }, [aberto, parcelaAtual.id, parcelaAtual.vencimento, parcelaAtual.valor, valorProxima, isPaguePlay, proximaNumero]);

  async function handleConfirm() {
    const novoValor = parseCurrencyInput(novoValorStr);
    if (isNaN(novoValor) || novoValor <= 0) {
      toast.error('Informe um valor válido para a próxima parcela');
      return;
    }
    if (!novoVencimento) {
      toast.error('Informe a data de vencimento da próxima parcela');
      return;
    }
    await onConfirm({ novoVencimento, novoValor });
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open && !salvando) onClose(); }}>
      <DialogContent className="max-w-sm" aria-describedby="modal-reagendar-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary text-sm">
            <CalendarClock className="w-4 h-4 shrink-0" />
            Reagendar Próxima Parcela
          </DialogTitle>
          <DialogDescription id="modal-reagendar-desc" asChild>
            <div className="pt-1 space-y-1">
              <p className="text-sm text-foreground/80">
                Parcela{' '}
                <strong className="font-mono text-foreground">{proximaNumero}/{totalParcelas}</strong>
                {' '}— defina data e valor.
              </p>
              <p className="text-xs text-muted-foreground">
                Parcela atual ({parcelaAtual.numero_parcela ?? 1}/{totalParcelas}) venceu em{' '}
                <strong>{formatDate(parcelaAtual.vencimento)}</strong>.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <DatePickerField
            label="Vencimento da próxima parcela *"
            value={novoVencimento}
            onChange={setNovoVencimento}
            disabled={salvando}
          />

          <div className="space-y-1">
            <Label className="text-xs">Valor (R$) *</Label>
            <Input
              value={novoValorStr}
              onChange={(e) => setNovoValorStr(e.target.value)}
              placeholder="0,00"
              className="h-8 text-xs font-mono"
              disabled={salvando}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={salvando}
            size="sm"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={salvando || !novoVencimento}
            size="sm"
            className="gap-1.5"
          >
            {salvando ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <CalendarClock className="w-3 h-3" />
            )}
            {salvando ? 'Reagendando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
