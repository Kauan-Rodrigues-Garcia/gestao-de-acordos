import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Hoje à meia-noite — o primeiro dia que `semPassado` ainda aceita. */
function inicioDeHoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const TIPOS_PAGUEPLAY = [
  { value: 'boleto_pix', label: 'Boleto / PIX',       parcelado: true  },
  { value: 'cartao',     label: 'Cartão de Crédito',   parcelado: false },
];

// BookPlay: as formas de pagamento parcelam. A trava em 'pix' e 'cartao' foi
// retirada em 05/08/2026 — na prática o cliente paga em parcelas
// independentemente da forma, e a forma pode até variar entre as parcelas do
// mesmo acordo (ver `tipo` por parcela em AcordoDetalheInline).
//
// As duas exceções são PIX Automático e Cartão Recorrente, `parcelado: false`
// desde 05/09/2026: o que se lança ali é a AUTORIZAÇÃO da cobrança, e quem
// parcela é a recorrência. Ver `lib/formasRecorrentes.ts` para a regra inteira
// — a mesma decisão também proíbe vencimento no passado.
export const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto',            parcelado: true  },
  { value: 'pix_automatico',    label: 'PIX Automático',    parcelado: false },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente', parcelado: false },
  { value: 'cartao',            label: 'Cartão de Crédito', parcelado: true  },
  { value: 'pix',               label: 'PIX',               parcelado: true  },
];

export const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente' },
  { value: 'pago',               label: 'Pago'     },
  { value: 'nao_pago',           label: 'Não Pago' },
];

export const PARCELAS_PP = Array.from({ length: 12 }, (_, i) => i + 1);

export function DatePickerField({
  value, onChange, label, required, semPassado,
}: {
  value:    string;
  onChange: (v: string) => void;
  label:    string;
  required?: boolean;
  /**
   * Fecha os dias anteriores a hoje no calendário.
   *
   * Usado por PIX Automático e Cartão Recorrente, que não se agendam para trás
   * — ver `lib/formasRecorrentes.ts`. É só a porta da frente: `validar()`
   * recusa a data de novo antes de gravar, porque o campo também é preenchido
   * pela leitura de imagem, que não passa pelo calendário.
   */
  semPassado?: boolean;
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
            disabled={semPassado ? { before: inicioDeHoje() } : undefined}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
