/**
 * CamposDaSirene — as peças do formulário da sirene (11/11/2026): cor, dias,
 * duração, volume e as seções numeradas. Usadas no «Tocar agora» e no editor
 * de horário (`EditorDeHorario`). Só apresentação.
 */
import type { ReactNode } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CORES, DIAS_DA_SEMANA, DURACAO_MAX_S, DURACAO_MIN_S, corDaSirene, type CorDaSirene,
} from './horario';

export function Bolinha({ cor, tamanho = 12 }: { cor: CorDaSirene; tamanho?: number }) {
  const c = corDaSirene(cor);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border border-border"
      style={{ width: tamanho, height: tamanho, background: `linear-gradient(90deg, ${c.luz} 50%, ${c.luz2} 50%)` }}
    />
  );
}

/** Uma etapa do formulário: número, título e o conteúdo. */
export function Etapa({ n, titulo, dica, children }: { n: number; titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{n}</span>
        <h4 className="text-sm font-semibold">{titulo}</h4>
        {dica && <span className="text-xs text-muted-foreground">{dica}</span>}
      </div>
      <div className="pl-7">{children}</div>
    </section>
  );
}

export function EscolhaDeCor({ valor, onMudar }: { valor: CorDaSirene; onMudar: (c: CorDaSirene) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor da luz" className="flex flex-wrap gap-1.5">
      {CORES.map(c => (
        <button
          key={c.slug} type="button" role="radio" aria-checked={valor === c.slug} onClick={() => onMudar(c.slug)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
            valor === c.slug ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          <Bolinha cor={c.slug} tamanho={14} /> {c.nome}
        </button>
      ))}
    </div>
  );
}

const ATALHOS_DIAS: readonly [string, number[]][] = [
  ['Seg a Sex', [1, 2, 3, 4, 5]],
  ['Seg a Sáb', [1, 2, 3, 4, 5, 6]],
  ['Todos os dias', [0, 1, 2, 3, 4, 5, 6]],
];
const mesmosDias = (a: readonly number[], b: readonly number[]) => [...a].sort().join() === [...b].sort().join();

export function EscolhaDeDias({ valor, onMudar }: { valor: number[]; onMudar: (d: number[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {/* Segunda primeiro, domingo no fim: é como a semana de trabalho é lida. */}
        {[1, 2, 3, 4, 5, 6, 0].map(n => {
          const marcado = valor.includes(n);
          return (
            <button
              key={n} type="button" aria-pressed={marcado}
              onClick={() => onMudar(marcado ? valor.filter(d => d !== n) : [...valor, n])}
              className={cn(
                'h-9 w-12 rounded-md border text-sm transition-colors',
                marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {DIAS_DA_SEMANA[n]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {ATALHOS_DIAS.map(([nome, dias]) => (
          <button key={nome} type="button" onClick={() => onMudar(dias)}
            className={cn('underline-offset-2 hover:underline', mesmosDias(valor, dias) ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground')}>
            {nome}
          </button>
        ))}
        {valor.length > 0 && (
          <button type="button" onClick={() => onMudar([])} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Limpar</button>
        )}
      </div>
    </div>
  );
}

const DURACOES = [5, 10, 15, 30, 60];

export function EscolhaDeDuracao({ id, valor, onMudar }: { id: string; valor: string; onMudar: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DURACOES.map(s => (
        <button key={s} type="button" aria-pressed={Number(valor) === s} onClick={() => onMudar(String(s))}
          className={cn(
            'h-8 rounded-md border px-2.5 text-xs tabular-nums transition-colors',
            Number(valor) === s ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:bg-muted',
          )}>
          {s} s
        </button>
      ))}
      <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground" htmlFor={id}>
        outro:
        <Input id={id} type="number" min={DURACAO_MIN_S} max={DURACAO_MAX_S} value={valor}
          onChange={e => onMudar(e.target.value)} className="h-8 w-16 text-sm" aria-label="Duração em segundos" />
        s
      </label>
    </div>
  );
}

export function EscolhaDeVolume({ id, valor, onMudar }: { id: string; valor: number; onMudar: (v: number) => void }) {
  return (
    <div className="flex h-8 items-center gap-2">
      {valor === 0 ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
      <input
        id={id} type="range" min={0} max={100} step={5} value={valor} aria-label="Volume"
        onChange={e => onMudar(Number(e.target.value))}
        className="w-40 accent-primary"
      />
      <span className="w-10 text-right text-sm tabular-nums">{valor}%</span>
      {valor === 0 && <span className="text-xs text-muted-foreground">só a luz</span>}
    </div>
  );
}
