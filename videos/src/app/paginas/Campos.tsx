// Campos de formulário com as classes do shadcn do app (Input, SelectTrigger,
// o botão do DatePickerField e o Calendar), mais o que o vídeo precisa e um
// <input> de verdade não mostra num quadro parado: o foco e o cursor de texto
// piscando.

import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { entre, ms } from '../../movimento';

/** Texto sendo digitado: quantos caracteres já apareceram no frame `f`. */
export function digitado(texto: string, f: number, inicio: number, duracaoMs: number) {
  if (f < inicio) return '';
  const n = Math.ceil(texto.length * entre(f, inicio, inicio + ms(duracaoMs), 0, 1, (x) => x));
  return texto.slice(0, n);
}

const piscando = (f: number) => Math.floor(f / 32) % 2 === 0;

export const Rotulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-sm font-medium leading-none text-xs">{children}</label>
);

export const Campo: React.FC<{
  valor: string;
  placeholder?: string;
  foco?: boolean;
  f: number;
  mono?: boolean;
  alvo?: string;
  className?: string;
}> = ({ valor, placeholder, foco, f, mono, alvo, className }) => (
  <div
    data-alvo={alvo}
    className={cn(
      'flex w-full items-center rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background md:text-sm h-8 text-xs',
      mono && 'font-mono',
      foco && 'outline-none ring-2 ring-ring ring-offset-2',
      className,
    )}
  >
    {valor ? <span className="whitespace-pre">{valor}</span> : !foco && <span className="text-muted-foreground">{placeholder}</span>}
    {foco && <span className="ml-px inline-block w-px h-3.5 bg-foreground" style={{ opacity: piscando(f) ? 1 : 0 }} />}
    {foco && !valor && <span className="text-muted-foreground">{placeholder}</span>}
  </div>
);

export const Selecao: React.FC<{ valor: string; placeholder?: boolean; className?: string }> = ({ valor, placeholder, className }) => (
  <div className={cn('flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background h-8 text-xs', className)}>
    <span className={cn('line-clamp-1', placeholder && 'text-muted-foreground')}>{valor}</span>
    <ChevronDown className="h-4 w-4 opacity-50" />
  </div>
);

export const BotaoData: React.FC<{ valor: string | null; foco?: boolean; alvo?: string }> = ({ valor, foco, alvo }) => (
  <div
    data-alvo={alvo}
    className={cn(
      'inline-flex items-center rounded-md border border-input bg-transparent w-full h-8 text-xs justify-start gap-2 font-mono px-2 font-medium',
      !valor && 'text-muted-foreground',
      foco && 'bg-accent text-accent-foreground',
    )}
  >
    <CalendarIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
    {valor ?? 'Selecionar data'}
  </div>
);

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * O Calendar do app (react-day-picker com as classes do shadcn), em outubro de
 * 2026. `marcado` acende o dia escolhido; `hoje` fica com o fundo de destaque.
 */
export const Calendario: React.FC<{ hoje: number; marcado: number | null; alvoPrefixo?: string }> = ({ hoje, marcado, alvoPrefixo = 'cal-dia' }) => {
  // outubro de 2026 começa numa quinta (índice 4)
  const inicio = 4;
  const celulas: { dia: number; fora: boolean }[] = [];
  for (let i = 0; i < inicio; i++) celulas.push({ dia: 27 + i, fora: true });
  for (let d = 1; d <= 31; d++) celulas.push({ dia: d, fora: false });
  while (celulas.length % 7) celulas.push({ dia: celulas.length - 34, fora: true });
  const semanas: (typeof celulas)[] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return (
    <div className="p-3">
      <div className="space-y-4">
        <div className="flex justify-center pt-1 relative items-center">
          <div className="text-sm font-medium">outubro 2026</div>
          <div className="space-x-1 flex items-center">
            <span className="absolute left-1 inline-flex items-center justify-center rounded-md border border-input h-7 w-7 bg-transparent p-0 opacity-50"><ChevronLeft className="h-4 w-4" /></span>
            <span className="absolute right-1 inline-flex items-center justify-center rounded-md border border-input h-7 w-7 bg-transparent p-0 opacity-50"><ChevronRight className="h-4 w-4" /></span>
          </div>
        </div>
        <div className="w-full space-y-1">
          <div className="flex">
            {SEMANA.map((s) => (
              <div key={s} className="text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center">{s}</div>
            ))}
          </div>
          {semanas.map((sem, i) => (
            <div key={i} className="flex w-full mt-2">
              {sem.map((c, j) => (
                <div key={j} className="h-9 w-9 text-center text-sm p-0 relative">
                  <div
                    data-alvo={c.fora ? undefined : `${alvoPrefixo}-${c.dia}`}
                    className={cn(
                      'inline-flex items-center justify-center rounded-md h-9 w-9 p-0 font-normal text-sm',
                      c.fora && 'text-muted-foreground opacity-50',
                      !c.fora && c.dia === hoje && c.dia !== marcado && 'bg-accent text-accent-foreground',
                      !c.fora && c.dia === marcado && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {c.dia}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
