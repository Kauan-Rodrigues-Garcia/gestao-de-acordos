/**
 * BonusDaPessoa — os bônus de uma pessoa no «Ver comissão».
 *
 * Cada bônus responde as mesmas três perguntas da escada de faixas: quanto
 * paga, o que falta e se já está garantido. A situação vem ESCRITA ao lado do
 * ícone — cor sozinha não diz nada a quem não a distingue.
 *
 * O bônus não soma na comissão: o «garantido» do cabeçalho é a soma só dos
 * bônus atingidos.
 */
import { CalendarClock, CheckCircle2, Circle, Clock, Gift, MinusCircle } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { BonusCalculado, SituacaoBonus } from '@/services/comissao/bonus';
import { condicaoDoBonus, SITUACAO_BONUS } from './bonusTexto';

const ESTILO: Record<SituacaoBonus, { Icone: typeof Circle; classe: string }> = {
  atingido:     { Icone: CheckCircle2,  classe: 'text-emerald-600 dark:text-emerald-400' },
  em_andamento: { Icone: Clock,         classe: 'text-sky-600 dark:text-sky-400' },
  aguardando:   { Icone: CalendarClock, classe: 'text-muted-foreground' },
  nao_atingido: { Icone: Circle,        classe: 'text-muted-foreground' },
  sem_meta:     { Icone: MinusCircle,   classe: 'text-muted-foreground' },
};

function CartaoBonus({ bonus: b, faltaRotulo }: { bonus: BonusCalculado; faltaRotulo: string }) {
  const s = ESTILO[b.situacao];
  const progresso = b.alvo && b.realizado !== null ? Math.min(100, (b.realizado / b.alvo) * 100) : null;

  return (
    <li className={cn(
      'flex flex-col gap-1.5 rounded-xl border p-3',
      b.atingido ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card',
    )}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-base font-bold tabular-nums">{formatBRL(b.valorBonus)}</p>
        <p className={cn('flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide', s.classe)}>
          <s.Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {SITUACAO_BONUS[b.situacao]}
        </p>
      </div>
      <p className="text-xs">{condicaoDoBonus(b)}</p>
      {b.descricao && <p className="text-[11px] text-muted-foreground">{b.descricao}</p>}
      {progresso !== null && (
        <div
          role="progressbar"
          aria-label="Realizado em relação ao alvo do bônus"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progresso)}
          className="h-1.5 rounded-full bg-muted"
        >
          <div
            className={cn('h-full rounded-full', b.atingido ? 'bg-emerald-500' : 'bg-primary')}
            style={{ width: `${progresso}%` }}
          />
        </div>
      )}
      {b.alvo !== null && b.realizado !== null && (
        <p className="text-[11px] text-muted-foreground">
          {`${b.tipo === 'especial' ? 'No período' : 'Realizado'}: ${formatBRL(b.realizado)} de ${formatBRL(b.alvo)}`}
        </p>
      )}
      {b.falta !== null && b.situacao !== 'aguardando' && (
        <p className="text-xs font-medium text-sky-700 dark:text-sky-300">{`${faltaRotulo} ${formatBRL(b.falta)}`}</p>
      )}
    </li>
  );
}

export function BonusDaPessoa({ bonus, totalBonus, mesFechado }: {
  bonus: readonly BonusCalculado[];
  totalBonus: number;
  mesFechado: boolean;
}) {
  if (bonus.length === 0) return null;
  const faltaRotulo = mesFechado ? 'Faltou' : 'Faltam';

  return (
    <section aria-label="Bônus" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {bonus.length === 1 ? 'Bônus' : `Bônus (${bonus.length})`}
        </p>
        <p className="text-xs text-muted-foreground">
          {totalBonus > 0
            ? <>Garantido <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{formatBRL(totalBonus)}</span> · pago à parte da comissão</>
            : 'Pago à parte da comissão'}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bonus.map(b => <CartaoBonus key={b.id} bonus={b} faltaRotulo={faltaRotulo} />)}
      </ul>
    </section>
  );
}
