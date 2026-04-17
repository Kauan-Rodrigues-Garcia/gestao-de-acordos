/**
 * DatePickerField.tsx
 * Componente de seleção de data com calendário visual (popover).
 * Usado em formulários de acordo para substituir <input type="date">.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerFieldProps {
  /** Valor no formato ISO (yyyy-MM-dd) */
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  /** Classes extras para o label */
  labelClassName?: string;
  /** Classes extras para o botão trigger */
  triggerClassName?: string;
  /** Tamanho do botão: 'sm' (h-8 text-xs) ou 'md' (h-10 text-sm) */
  size?: 'sm' | 'md';
  /** Data mínima no formato ISO (yyyy-MM-dd) */
  minDate?: string;
  disabled?: boolean;
}

export function DatePickerField({
  value,
  onChange,
  label,
  required,
  labelClassName,
  triggerClassName,
  size = 'sm',
  minDate,
  disabled = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const fromDate = minDate ? parseISO(minDate) : undefined;

  const isSm = size === 'sm';

  return (
    <div className="space-y-1">
      {label && (
        <Label className={cn(isSm ? 'text-xs' : 'text-xs font-semibold text-primary', labelClassName)}>
          {label}{required && ' *'}
        </Label>
      )}
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start gap-2 font-mono',
              isSm ? 'h-8 text-xs px-2' : 'h-10 text-sm px-3',
              !value && 'text-muted-foreground',
              triggerClassName,
            )}
          >
            <CalendarIcon className={cn('shrink-0 text-muted-foreground', isSm ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
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
            fromDate={fromDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
