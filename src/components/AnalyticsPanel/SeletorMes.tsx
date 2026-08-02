/**
 * SeletorMes — navegação de mês do painel de métricas.
 *
 * Fica no lugar do rótulo fixo "Agosto 2026" que existia antes. Sem ele, todo o
 * painel só sabia falar do mês corrente: no dia 02 o dashboard aparece zerado
 * porque o mês mal começou, e não havia como conferir o mês que fechou.
 *
 * Disponível para qualquer cargo — é leitura dos MESMOS dados que o usuário já
 * enxerga hoje, só que com outra data. O escopo (operador/equipe/setor) continua
 * decidido pela RLS e pelos filtros do dashboard, não por aqui.
 */
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  deslocarMes, ehMesAtual, mesAtual, podeAvancar, podeVoltar, rotuloDoMes,
} from '@/lib/mesReferencia';

interface SeletorMesProps {
  mes: string;
  onChange: (mes: string) => void;
  /** Some com os controles enquanto o painel carrega pela primeira vez. */
  desabilitado?: boolean;
}

export function SeletorMes({ mes, onChange, desabilitado = false }: SeletorMesProps) {
  const noMesAtual = ehMesAtual(mes);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
        disabled={desabilitado || !podeVoltar(mes)}
        onClick={() => onChange(deslocarMes(mes, -1))}
        title="Mês anterior"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </Button>

      <span
        className={cn(
          'text-[11px] leading-none min-w-[92px] text-center tabular-nums',
          noMesAtual ? 'text-muted-foreground' : 'font-semibold text-primary',
        )}
      >
        {rotuloDoMes(mes)}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
        disabled={desabilitado || !podeAvancar(mes)}
        onClick={() => onChange(deslocarMes(mes, 1))}
        title="Próximo mês"
        aria-label="Próximo mês"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>

      {/* Só aparece fora do mês corrente: é o caminho de volta, e ao mesmo tempo
          o aviso de que os números na tela NÃO são os de hoje. */}
      {!noMesAtual && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          disabled={desabilitado}
          onClick={() => onChange(mesAtual())}
          title="Voltar para o mês atual"
        >
          <CalendarDays className="w-3 h-3" /> Mês atual
        </Button>
      )}
    </div>
  );
}
