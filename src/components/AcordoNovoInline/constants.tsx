import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TIPOS_PAGUEPLAY = [
  { value: 'boleto_pix', label: 'Boleto / PIX',       parcelado: true  },
  { value: 'cartao',     label: 'Cartão de Crédito',   parcelado: false },
];

// BookPlay: TODAS as formas de pagamento parcelam. A trava em 'pix' e 'cartao'
// foi retirada em 05/08/2026 — na prática o cliente paga em parcelas
// independentemente da forma, e a forma pode até variar entre as parcelas do
// mesmo acordo (ver `tipo` por parcela em AcordoDetalheInline).
export const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto',            parcelado: true },
  { value: 'pix_automatico',    label: 'PIX Automático',    parcelado: true },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente', parcelado: true },
  { value: 'cartao',            label: 'Cartão de Crédito', parcelado: true },
  { value: 'pix',               label: 'PIX',               parcelado: true },
];

export const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente' },
  { value: 'pago',               label: 'Pago'     },
  { value: 'nao_pago',           label: 'Não Pago' },
];

export const PARCELAS_PP = Array.from({ length: 12 }, (_, i) => i + 1);

export function DatePickerField({
  value, onChange, label, required,
}: {
  value:    string;
  onChange: (v: string) => void;
  label:    string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && ' *'}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn('w-full h-8 text-xs justify-start gap-2 font-mono px-2', !value && 'text-muted-foreground')}
          >
            <CalendarIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
            {selected ? format(selected, 'dd/MM/yyyy') : 'Selecionar data'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (day) { onChange(format(day, 'yyyy-MM-dd')); setOpen(false); }
            }}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
