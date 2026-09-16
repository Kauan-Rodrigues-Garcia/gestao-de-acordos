/**
 * FiltroDePeriodo — o «até o dia N» dos painéis de diretoria.
 *
 * Saiu de `DiretoriaVisaoGeral` em 16/09/2026, quando o Painel Diretoria do
 * Comercial passou a seguir o desenho do da BookPlay e precisou do mesmo
 * botão. Um só componente para as duas telas: o gesto de escolher o corte é o
 * mesmo, e duas cópias divergiriam no primeiro ajuste.
 */
import { CalendarRange, RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * O botão de período e o que ele abre.
 *
 * Duas maneiras de dizer a mesma coisa porque são dois gestos diferentes:
 * arrastar responde «e se fosse outro dia?» varrendo o mês; digitar a data
 * responde «quero exatamente o dia 12». Uma barra sozinha obriga a mirar o
 * pixel, e um campo de data sozinho não deixa varrer.
 *
 * `corte` é sempre o corte EFETIVO (o que o banco devolveu), não a escolha —
 * assim o botão mostra o dia real mesmo antes de alguém mexer em qualquer
 * coisa, que é o estado em que a tela quase sempre está.
 */
export function FiltroDePeriodo({
  mes, corte, diasNoMes, escolhido, onEscolher,
}: {
  mes: string; corte: number; diasNoMes: number;
  escolhido: number | null; onEscolher: (dia: number | null) => void;
}) {
  const dataIso = `${mes}-${String(corte).padStart(2, '0')}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors',
            escolhido !== null
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border/70 bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          <span>
            {corte >= diasNoMes ? 'Mês inteiro' : `Até o dia ${corte}`}
          </span>
          {escolhido !== null && (
            <span className="rounded bg-primary/20 px-1 text-[9px] uppercase tracking-wide">
              filtrado
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] space-y-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Período analisado</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Do dia 1 até o dia escolhido — e o mês anterior é medido até esse
            mesmo dia.
          </p>
        </div>

        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Analisar até
          </span>
          <input
            type="date"
            value={dataIso}
            min={`${mes}-01`}
            max={`${mes}-${String(diasNoMes).padStart(2, '0')}`}
            onChange={e => {
              const v = e.target.value;
              // Fora do mês em foco não é corte: o seletor de mês do cabeçalho
              // é quem troca de mês, e aceitar aqui deixaria a tela mostrando
              // um mês no título e outro nos números.
              if (!v.startsWith(`${mes}-`)) return;
              const dia = Number(v.slice(8, 10));
              if (Number.isFinite(dia) && dia >= 1) onEscolher(Math.min(dia, diasNoMes));
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Ou arraste pelo mês
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
              dia {corte}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={diasNoMes}
            value={corte}
            onChange={e => onEscolher(Number(e.target.value))}
            aria-label="Comparar os dois meses até este dia"
            className="mt-1.5 h-1 w-full cursor-pointer accent-primary"
          />
        </div>

        {escolhido !== null && (
          <button
            type="button"
            onClick={() => onEscolher(null)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Voltar para o dia de hoje
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
