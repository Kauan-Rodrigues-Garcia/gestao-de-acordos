/**
 * Campo de data do formulário de NOVO acordo.
 *
 * Não é o `@/components/DatePickerField` global: este tem rótulo embutido e a
 * trava `soMesAtual` das formas recorrentes. Morava em `constants.tsx`, e um
 * arquivo que exporta constantes junto de um componente perde o Fast Refresh.
 */
import { useState } from 'react';
import { endOfMonth, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Hoje à meia-noite — o primeiro dia que `soMesAtual` ainda aceita. */
function inicioDeHoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DatePickerField({
  value, onChange, label, required, soMesAtual,
}: {
  value:    string;
  onChange: (v: string) => void;
  label:    string;
  required?: boolean;
  /**
   * Deixa aberto só de hoje até o último dia do mês corrente.
   *
   * Usado por PIX Automático e Cartão Recorrente — ver
   * `lib/formasRecorrentes.ts`. É só a porta da frente: `validar()` recusa a
   * data de novo antes de gravar, porque o campo também é preenchido pela
   * leitura de imagem, que não passa pelo calendário.
   */
  soMesAtual?: boolean;
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
            disabled={soMesAtual
              ? [{ before: inicioDeHoje() }, { after: endOfMonth(inicioDeHoje()) }]
              : undefined}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
