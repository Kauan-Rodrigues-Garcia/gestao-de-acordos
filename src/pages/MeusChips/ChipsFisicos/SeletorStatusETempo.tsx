/**
 * SeletorStatusETempo — os três status e, em Banido ou Recuperar, o tempo.
 *
 * Serve às duas janelas: a do status e a do cadastro (que já deixa o chip
 * nascer banido, sem precisar de um segundo passo).
 *
 * O tempo é opcional e vai até 12 horas. Os atalhos cobrem o comum; os campos
 * de hora e minuto cobrem o resto. A janela mostra QUANDO termina, e não só
 * quanto dura — «termina às 22:40» é o que a pessoa confere no relógio.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  STATUS_CHIP, STATUS_CHIP_DESCRICAO, STATUS_CHIP_LABELS, TEMPO_MAXIMO_MINUTOS,
  TEMPOS_RAPIDOS_MINUTOS, aceitaTempo, erroDoTempo, formatarDuracao, type StatusChip,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { PONTO_STATUS_CHIP } from './coresStatusChip';

export interface ValorStatusETempo {
  status: StatusChip;
  /** `null` = sem tempo. */
  minutos: number | null;
}

function inteiro(valor: string): number {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function quandoTermina(minutos: number): string {
  const fim = new Date(Date.now() + minutos * 60_000);
  const hoje = new Date();
  const mesmoDia = fim.toDateString() === hoje.toDateString();
  const hora = fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return mesmoDia ? `hoje às ${hora}` : `amanhã às ${hora}`;
}

export interface SeletorStatusETempoProps {
  valor: ValorStatusETempo;
  onMudar: (v: ValorStatusETempo) => void;
  /** Prefixo dos ids, para duas instâncias na mesma página não colidirem. */
  idBase: string;
}

export function SeletorStatusETempo({ valor, onMudar, idBase }: SeletorStatusETempoProps) {
  const { status, minutos } = valor;
  const horas = minutos === null ? '' : String(Math.floor(minutos / 60));
  const mins  = minutos === null ? '' : String(minutos % 60);
  const erro  = erroDoTempo(status, minutos);

  function escolherStatus(s: StatusChip) {
    // Ativo não leva tempo; entre Banido e Recuperar o tempo escolhido fica.
    onMudar({ status: s, minutos: aceitaTempo(s) ? minutos : null });
  }

  function digitar(h: string, m: string) {
    const total = inteiro(h) * 60 + inteiro(m);
    onMudar({ status, minutos: total > 0 ? total : null });
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {STATUS_CHIP.map(s => {
            const marcado = s === status;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => escolherStatus(s)}
                className={cn(
                  'rounded-md border px-3 py-2.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  marcado ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn('h-2.5 w-2.5 rounded-full', PONTO_STATUS_CHIP[s])} aria-hidden />
                  {STATUS_CHIP_LABELS[s]}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {STATUS_CHIP_DESCRICAO[s]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {aceitaTempo(status) && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Tempo <span className="font-normal text-muted-foreground">(opcional, até 12 horas)</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <BotaoTempo marcado={minutos === null} onClick={() => onMudar({ status, minutos: null })}>
              Sem tempo
            </BotaoTempo>
            {TEMPOS_RAPIDOS_MINUTOS.map(t => (
              <BotaoTempo key={t} marcado={minutos === t} onClick={() => onMudar({ status, minutos: t })}>
                {formatarDuracao(t)}
              </BotaoTempo>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="w-20 space-y-1">
              <Label htmlFor={`${idBase}-horas`} className="text-xs">Horas</Label>
              <Input
                id={`${idBase}-horas`} type="number" inputMode="numeric" min={0} max={12}
                value={horas} placeholder="0"
                onChange={e => digitar(e.target.value, mins)}
                className="h-9 tabular-nums"
              />
            </div>
            <div className="w-20 space-y-1">
              <Label htmlFor={`${idBase}-minutos`} className="text-xs">Minutos</Label>
              <Input
                id={`${idBase}-minutos`} type="number" inputMode="numeric" min={0} max={59}
                value={mins} placeholder="0"
                onChange={e => digitar(horas, e.target.value)}
                className="h-9 tabular-nums"
              />
            </div>
            <p className="pb-2 text-xs text-muted-foreground" aria-live="polite">
              {erro
                ? <span className="text-destructive">{erro}</span>
                : minutos !== null && minutos <= TEMPO_MAXIMO_MINUTOS
                  ? `Termina ${quandoTermina(minutos)}`
                  : 'Sem contagem.'}
            </p>
          </div>
        </fieldset>
      )}
    </div>
  );
}

function BotaoTempo({
  marcado, onClick, children,
}: { marcado: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        marcado
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
