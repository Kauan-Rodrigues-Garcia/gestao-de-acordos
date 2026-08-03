import { useState, useEffect } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePickerField } from '@/components/DatePickerField';
import { getTodayISO } from '@/lib/index';

export interface ModalConfirmarPagamentoProps {
  aberto: boolean;
  salvando: boolean;
  /** Data que pré-preenche o campo — normalmente o vencimento do acordo.
   *  A data confirmada é gravada no vencimento, alinhando o recebimento ao dia. */
  dataInicial?: string;
  onConfirm: (dataPagamento: string) => Promise<void>;
  onClose: () => void;
}

// `getTodayISO` e não `new Date().toISOString()`: este valor vira a DATA DE
// PAGAMENTO do acordo. Com o `toISOString`, um pagamento confirmado às 21h30
// no Brasil nascia com a data de amanhã — ver o comentário em lib/index.ts.
const hojeISO = () => getTodayISO();

export function ModalConfirmarPagamento({
  aberto, salvando, dataInicial, onConfirm, onClose,
}: ModalConfirmarPagamentoProps) {
  const [dataPagamento, setDataPagamento] = useState(dataInicial ?? hojeISO());

  useEffect(() => {
    if (!aberto) return;
    setDataPagamento(dataInicial ?? hojeISO());
  }, [aberto, dataInicial]);

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open && !salvando) onClose(); }}>
      <DialogContent className="max-w-sm" aria-describedby="modal-confirmar-pgto-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Confirmar data de pagamento
          </DialogTitle>
          <DialogDescription id="modal-confirmar-pgto-desc" className="text-sm text-foreground/80 pt-1">
            Selecione a data em que o pagamento foi realizado.
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <DatePickerField
            label="Data de pagamento *"
            value={dataPagamento}
            onChange={setDataPagamento}
            disabled={salvando}
          />
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={salvando} size="sm">
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(dataPagamento)}
            disabled={salvando || !dataPagamento}
            size="sm"
            className="gap-1.5 bg-success hover:bg-success/90 text-white"
          >
            {salvando
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <CheckCircle2 className="w-3 h-3" />}
            {salvando ? 'Salvando...' : 'Confirmar Pagamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
