// src/pages/Analitico/SeletorRecorte.tsx
/**
 * O controle da lente: Mês · Dia · Período.
 *
 * Substitui dois controles que viviam em telas diferentes — o seletor de mês da
 * aba Analítico e o seletor de dia da aba Recebimento diário.
 *
 * O modo Dia só aparece para quem tem `analitico_sub_recebimento_diario`. Era a
 * chave que ligava a aba; hoje liga a lente, e continua querendo dizer a mesma
 * coisa: quem tem, vê o recebimento diário.
 */
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { DatePickerField } from '@/components/DatePickerField';
import { getTodayISO } from '@/lib/index';
import {
  primeiroDiaDoMes, ultimoDiaDoMes, rotuloDoMes,
} from '@/lib/mesReferencia';
import {
  deslocarRecorte, mesDoRecorte, trocarModo,
  type ModoRecorte, type Recorte,
} from './recorte';

interface SeletorRecorteProps {
  recorte: Recorte;
  onMudar: (r: Recorte) => void;
  /** `analitico_sub_recebimento_diario` — sem ela, não há modo Dia. */
  podeVerDia: boolean;
}

export function SeletorRecorte({ recorte, onMudar, podeVerDia }: SeletorRecorteProps) {
  const hoje = getTodayISO();
  const mes  = mesDoRecorte(recorte);

  const modos: AbaSegmentada<ModoRecorte>[] = [
    { key: 'mes',     label: 'Mês',     Icon: Calendar },
    ...(podeVerDia ? [{ key: 'dia' as const, label: 'Dia', Icon: CalendarDays }] : []),
    { key: 'periodo', label: 'Período', Icon: CalendarRange },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <AbasSegmentadas
        abas={modos}
        ativa={recorte.modo}
        rotulo="Recorte de tempo"
        onTrocar={m => onMudar(trocarModo(recorte, m, hoje))}
      />

      {recorte.modo !== 'periodo' && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Anterior"
            className="h-8 w-8 rounded-lg"
            onClick={() => onMudar(deslocarRecorte(recorte, -1))}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="min-w-[136px] text-center text-sm font-semibold tabular-nums">
            {recorte.modo === 'mes'
              ? rotuloDoMes(recorte.mes)
              : new Date(recorte.dia + 'T12:00:00').toLocaleDateString('pt-BR', {
                  weekday: 'short', day: '2-digit', month: 'short',
                })}
          </span>
          <Button variant="outline" size="icon" aria-label="Próximo"
            className="h-8 w-8 rounded-lg"
            disabled={recorte.modo === 'dia' && recorte.dia >= hoje}
            onClick={() => onMudar(deslocarRecorte(recorte, 1))}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-muted-foreground"
            onClick={() => onMudar(
              recorte.modo === 'dia'
                ? { modo: 'dia', dia: hoje }
                : { modo: 'mes', mes: hoje.slice(0, 7) },
            )}>
            {recorte.modo === 'dia' ? 'Hoje' : 'Mês atual'}
          </Button>
        </div>
      )}

      {recorte.modo === 'periodo' && (
        <div className="flex items-center gap-1.5">
          <DatePickerField
            value={recorte.inicio}
            onChange={v => onMudar({ ...recorte, inicio: v })}
            placeholder="Data início" triggerClassName="w-32 rounded-lg"
            minDate={primeiroDiaDoMes(mes)} maxDate={recorte.fim || ultimoDiaDoMes(mes)}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePickerField
            value={recorte.fim}
            onChange={v => onMudar({ ...recorte, fim: v })}
            placeholder="Data fim" triggerClassName="w-32 rounded-lg"
            minDate={recorte.inicio || primeiroDiaDoMes(mes)} maxDate={ultimoDiaDoMes(mes)}
          />
        </div>
      )}
    </div>
  );
}
