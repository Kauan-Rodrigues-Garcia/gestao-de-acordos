/**
 * CartaoChip — um chip físico em cartão grande (Meus Chips 2.0).
 *
 * Desenho de chip de celular: o contato dourado no canto, o número grande, o
 * status em selo grande. Quando há tempo correndo, um anel conta para trás;
 * quando acaba, o cartão acende. Texto em tamanho de leitura — nada de
 * letrinha (pedido do Cleber, 17/11/2026).
 */
import { memo } from 'react';
import {
  AlarmClock, BellRing, CalendarCheck, MoreVertical, Pencil, RefreshCw, Tag, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAgora } from '@/hooks/useAgora';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { formatarRestante } from '@/services/numeros/numerosRegras';
import {
  ETIQUETA_CHIP_LABELS, OPERADORA_LABELS, STATUS_CHIP_LABELS, estadoDoLembrete, estadoDoTempo,
  etiquetasDoChip, rotuloDias, tempoAtivoMs,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import type { ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { COR_ETIQUETA } from '../ChipsFisicos/coresStatusChip';
import { HEX_STATUS, TOM_STATUS } from './cores';

export interface AcoesDoChip {
  onStatus: (c: ChipFisicoRow) => void;
  onCorrigir: (c: ChipFisicoRow) => void;
  onExcluir: (c: ChipFisicoRow) => void;
  onEtiquetas?: (c: ChipFisicoRow) => void;
  onLembrete?: (c: ChipFisicoRow) => void;
}

function hora(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** O anel do tempo do status: cheio no começo, vazio no fim. */
function AnelTempo({ chip }: { chip: ChipFisicoRow }) {
  const agora = useAgora();
  const t = estadoDoTempo(chip, agora);
  if (t.tipo === 'sem_tempo' || !chip.prazo_ate) return null;
  const inicio = new Date(chip.status_desde).getTime();
  const fim = new Date(chip.prazo_ate).getTime();
  const fracao = t.tipo === 'encerrado' ? 0 : Math.min(1, Math.max(0, (fim - agora) / Math.max(fim - inicio, 1)));
  const R = 26;
  const C = 2 * Math.PI * R;

  if (t.tipo === 'encerrado') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-sky-500/12 px-3 py-2 text-sky-700 dark:text-sky-300"
           title={`Terminou em ${hora(fim)}`}>
        <BellRing className="h-5 w-5 animate-pulse" aria-hidden />
        <span className="text-sm font-semibold">Tempo encerrado — mude o status</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`Faltam ${formatarRestante(t.restanteMs)}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 shrink-0" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        <circle
          cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          stroke={HEX_STATUS[chip.status]} strokeDasharray={C} strokeDashoffset={C * (1 - fracao)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div>
        <p className="font-mono text-xl font-bold tabular-nums leading-tight">{formatarRestante(t.restanteMs)}</p>
        <p className="text-sm text-muted-foreground">volta às {hora(fim)}</p>
      </div>
    </div>
  );
}

function Lembrete({ chip }: { chip: ChipFisicoRow }) {
  const agora = useAgora();
  const l = estadoDoLembrete(chip, agora);
  if (l.tipo === 'sem_lembrete') return null;
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
      l.tipo === 'vencido'
        ? 'bg-violet-500/15 font-semibold text-violet-700 dark:text-violet-300'
        : 'bg-violet-500/8 text-violet-700 dark:text-violet-300',
    )}>
      {l.tipo === 'vencido'
        ? <BellRing className="h-4 w-4 shrink-0 animate-pulse" aria-hidden />
        : <AlarmClock className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{l.texto}</span>
      <span className="shrink-0 font-mono tabular-nums">
        {l.tipo === 'vencido' ? 'agora' : formatarRestante(l.restanteMs)}
      </span>
    </div>
  );
}

function DiasAtivo({ chip }: { chip: ChipFisicoRow }) {
  const agora = useAgora();
  const total = tempoAtivoMs(chip, agora);
  const atual = chip.status === 'ativo' ? Math.max(agora - new Date(chip.status_desde).getTime(), 0) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <CalendarCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      {chip.status === 'ativo'
        ? <span>Ativo há <strong className="text-base">{rotuloDias(atual)}</strong></span>
        : <span className="text-muted-foreground">Fora de ativo desde {hora(new Date(chip.status_desde).getTime())}</span>}
      {(chip.ativo_acumulado_seg ?? 0) > 0 && (
        <span className="text-muted-foreground">· {rotuloDias(total)} no total</span>
      )}
    </div>
  );
}

export const CartaoChip = memo(function CartaoChip({
  chip, podeCuidar, recursos2, dono, acoes,
}: {
  chip: ChipFisicoRow;
  podeCuidar: boolean;
  recursos2: boolean;
  /** Nome da pessoa, quando o cartão aparece fora do bloco dela. */
  dono?: string | null;
  acoes: AcoesDoChip;
}) {
  const tom = TOM_STATUS[chip.status];
  const etiquetas = etiquetasDoChip(chip);
  const numero = mascararNumero(chip.numero);

  return (
    <article
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        estadoDoTempo(chip, Date.now()).tipo === 'encerrado' && 'ring-2 ring-sky-500/40',
      )}
      aria-label={`Chip ${numero}, ${STATUS_CHIP_LABELS[chip.status]}`}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1.5', tom.solido)} aria-hidden />

      <header className="flex items-start gap-3">
        {/* O contato dourado do chip. */}
        <span className="relative mt-0.5 h-10 w-8 shrink-0 rounded-md bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 shadow-inner" aria-hidden>
          <span className="absolute inset-1 grid grid-cols-2 gap-px rounded-sm opacity-60">
            <span className="rounded-sm border border-amber-700/40" /><span className="rounded-sm border border-amber-700/40" />
            <span className="rounded-sm border border-amber-700/40" /><span className="rounded-sm border border-amber-700/40" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold tabular-nums tracking-tight">{numero}</p>
          <p className="text-sm text-muted-foreground">
            {chip.operadora ? OPERADORA_LABELS[chip.operadora] : 'Operadora não informada'}
            {dono ? ` · ${dono}` : ''}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-3 py-1 text-sm font-semibold', tom.fundo, tom.texto, tom.borda)}>
          {STATUS_CHIP_LABELS[chip.status]}
        </span>
      </header>

      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map(e => (
            <span key={e} className={cn('rounded-full border px-2.5 py-0.5 text-sm font-medium', COR_ETIQUETA[e])}>
              {ETIQUETA_CHIP_LABELS[e]}
            </span>
          ))}
        </div>
      )}

      <AnelTempo chip={chip} />
      <DiasAtivo chip={chip} />
      <Lembrete chip={chip} />

      {chip.observacao && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm font-semibold">{chip.observacao}</p>
      )}

      {podeCuidar && (
        <footer className="mt-auto flex items-center gap-2 border-t pt-3">
          <Button className="flex-1" variant="secondary" onClick={() => acoes.onStatus(chip)}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Status
          </Button>
          {recursos2 && acoes.onLembrete && (
            <Button variant="outline" size="icon" onClick={() => acoes.onLembrete!(chip)}
                    aria-label="Lembrete" title={chip.lembrete_ate ? 'Trocar lembrete' : 'Criar lembrete'}>
              <AlarmClock className="h-4 w-4" />
            </Button>
          )}
          {recursos2 && acoes.onEtiquetas && (
            <Button variant="outline" size="icon" onClick={() => acoes.onEtiquetas!(chip)}
                    aria-label="Etiquetas" title="Etiquetas">
              <Tag className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Mais ações para ${numero}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => acoes.onCorrigir(chip)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden /> Corrigir dados
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => acoes.onExcluir(chip)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Excluir chip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </footer>
      )}
    </article>
  );
});
