/**
 * PainelResumo — o topo da Meus Chips 2.0: saúde dos chips, semáforo e os
 * contadores (que são o filtro da lista).
 *
 * A saúde é o percentual de chips Ativos, com a barra dividida pelas cores dos
 * status. Os contadores continuam sendo botões de filtro, como desde 21/09:
 * a primeira pergunta de quem cuida do setor («quantos banidos?») já leva à
 * lista.
 */
import type { ReactNode } from 'react';
import { Activity, BellRing, Radio, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  saudeDosChips, type FiltroStatusChip, type ResumoChips, type StatusChip,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { Semaforo } from './Semaforo';
import { LUZ_STATUS } from './coresStatusChip';

const ROTULO: Record<StatusChip, string> = {
  ativo: 'Ativos', restricao: 'Restrição', banido: 'Banidos', recuperar: 'Recuperar',
};

/** A ordem na tela: do bom ao ruim, igual ao semáforo. */
const ORDEM: StatusChip[] = ['ativo', 'recuperar', 'restricao', 'banido'];

const BARRA: Record<StatusChip, string> = {
  ativo: 'bg-emerald-500', recuperar: 'bg-yellow-400', restricao: 'bg-orange-500', banido: 'bg-red-500',
};

export interface PainelResumoProps {
  resumo: ResumoChips;
  /** Chips para o semáforo do topo (só na visão do operador). */
  chipsDoSemaforo?: readonly { id: string; status: StatusChip; numero: string }[];
  /** Quantas pessoas a visão de grupo mostra, e quantas têm chip banido. */
  pessoas?: { total: number; comBanido: number };
  filtro: FiltroStatusChip;
  onFiltro: (f: FiltroStatusChip) => void;
  recursos2: boolean;
}

export function PainelResumo({
  resumo, chipsDoSemaforo, pessoas, filtro, onFiltro, recursos2,
}: PainelResumoProps) {
  const saude = saudeDosChips(resumo);
  const tom = resumo.total === 0 ? 'text-muted-foreground'
    : saude >= 80 ? 'text-emerald-600 dark:text-emerald-400'
    : saude >= 50 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <section className="space-y-4 rounded-2xl border bg-gradient-to-br from-card via-card to-muted/50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden /> Saúde dos chips
          </p>
          <div className="flex items-baseline gap-3">
            <span className={cn('text-4xl font-bold tabular-nums leading-none', tom)}>{saude}%</span>
            <span className="text-sm text-muted-foreground">
              <strong className="text-foreground tabular-nums">{resumo.ativo}</strong> de{' '}
              <strong className="text-foreground tabular-nums">{resumo.total}</strong> ativos
              {pessoas && pessoas.total > 0 && (
                <> · {pessoas.total} {pessoas.total === 1 ? 'pessoa' : 'pessoas'}
                  {pessoas.comBanido > 0 && (
                    <span className="text-red-600 dark:text-red-400"> · {pessoas.comBanido} com banido</span>
                  )}
                </>
              )}
            </span>
          </div>
          <div
            className="flex h-2.5 w-full min-w-[220px] overflow-hidden rounded-full bg-muted sm:w-80"
            role="img"
            aria-label={ORDEM.map(s => `${resumo[s]} ${ROTULO[s].toLowerCase()}`).join(', ')}
          >
            {resumo.total > 0 && ORDEM.map(s => (
              <div
                key={s}
                className={cn('h-full transition-[width] duration-700', BARRA[s])}
                style={{ width: `${(resumo[s] / resumo.total) * 100}%` }}
              />
            ))}
          </div>
        </div>
        {chipsDoSemaforo && chipsDoSemaforo.length > 0 && (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Semáforo</span>
            <Semaforo chips={chipsDoSemaforo} tamanho="lg" maximo={16} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" role="group" aria-label="Filtrar por status">
        <Contador rotulo="Todos" valor={resumo.total} marcado={filtro === 'todos'}
                  icone={<Smartphone className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => onFiltro('todos')} />
        {ORDEM.map(s => (
          <Contador
            key={s}
            rotulo={ROTULO[s]}
            valor={resumo[s]}
            luz={LUZ_STATUS[s]}
            marcado={filtro === s}
            onClick={() => onFiltro(filtro === s ? 'todos' : s)}
          />
        ))}
        <Contador
          rotulo="Tempo encerrado"
          valor={resumo.tempoEncerrado}
          icone={<BellRing className="h-3.5 w-3.5 text-sky-500" aria-hidden />}
          marcado={filtro === 'tempo_encerrado'}
          destaque={resumo.tempoEncerrado > 0}
          onClick={() => onFiltro(filtro === 'tempo_encerrado' ? 'todos' : 'tempo_encerrado')}
        />
        {recursos2 && (
          <Contador
            rotulo="Movimentando"
            valor={resumo.movimentando}
            icone={<Radio className="h-3.5 w-3.5 text-emerald-500" aria-hidden />}
            marcado={filtro === 'movimentando'}
            onClick={() => onFiltro(filtro === 'movimentando' ? 'todos' : 'movimentando')}
          />
        )}
        {recursos2 && (
          <div className="flex flex-col justify-center rounded-xl border border-dashed px-3 py-2 text-left">
            <span className="text-2xl font-bold leading-tight tabular-nums">{resumo.lembreteVencido}</span>
            <span className={cn('text-xs', resumo.lembreteVencido > 0 ? 'font-medium text-violet-600 dark:text-violet-300' : 'text-muted-foreground')}>
              Lembretes vencidos
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function Contador({
  rotulo, valor, luz, icone, marcado, destaque, onClick,
}: {
  rotulo: string; valor: number; luz?: string; icone?: ReactNode; marcado: boolean;
  destaque?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start rounded-xl border bg-card/80 px-3 py-2 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        marcado ? 'border-primary shadow-sm ring-1 ring-primary' : 'hover:-translate-y-0.5 hover:bg-muted/60 hover:shadow-sm',
      )}
    >
      <span className="text-2xl font-bold leading-tight tabular-nums">{valor}</span>
      <span className={cn(
        'flex items-center gap-1.5 text-xs',
        destaque ? 'font-medium text-sky-700 dark:text-sky-300' : 'text-muted-foreground',
      )}>
        {luz && <span className={cn('h-2 w-2 rounded-full', luz)} aria-hidden />}
        {icone}
        {rotulo}
      </span>
    </button>
  );
}
