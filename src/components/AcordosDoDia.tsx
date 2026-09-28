/**
 * Peças visuais que as listas de acordos da cobrança (BookPlay e PaguePlay)
 * herdaram da lista de Vendas em 28/09/2026: a linha-título de cada dia e a
 * setinha que abre o detalhe do acordo.
 */
import { CalendarDays, ChevronDown, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rotuloDoDia } from '@/lib/rotuloDoDia';
import { contarPorStatus } from '@/lib/acordosPorDia';
import type { StatusAcordo } from '@/lib/supabase';

/**
 * «Terça-feira · 15/09/2026 ········ 12 acordos · 7 pendentes · 4 pagos · 1 não pago»
 *
 * Só quantidades, sem valor: o pedido foi para a linha não poluir a lista.
 * `dia === null` é o bloco dos acordos com CPF, que fica acima de todos.
 */
export function LinhaDoDiaAcordos({
  dia, acordos, colSpan, hoje,
}: {
  dia: string | null;
  acordos: readonly { status: StatusAcordo | string }[];
  colSpan: number;
  hoje: string;
}) {
  const c = contarPorStatus(acordos);
  const ehHoje = dia === hoje;
  return (
    <tr className={cn('border-b border-border', dia === null ? 'bg-destructive/10' : ehHoje ? 'bg-primary/10' : 'bg-muted/40')}>
      <td colSpan={colSpan} className="px-3 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {dia === null ? (
            <span className="flex items-center gap-1.5 font-semibold text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              Com CPF no cadastro — corrigir primeiro
            </span>
          ) : (
            <span className={cn('flex items-center gap-1.5 font-semibold', ehHoje ? 'text-primary' : 'text-foreground')}>
              <CalendarDays className={cn('h-3.5 w-3.5', ehHoje ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
              {rotuloDoDia(dia, hoje)}
            </span>
          )}
          <span className="tabular-nums text-muted-foreground">
            {c.total} acordo{c.total === 1 ? '' : 's'}
            {' · '}<strong className="font-semibold text-warning">{c.pendentes} pendente{c.pendentes === 1 ? '' : 's'}</strong>
            {' · '}<strong className="font-semibold text-success">{c.pagos} pago{c.pagos === 1 ? '' : 's'}</strong>
            {' · '}<strong className="font-semibold text-destructive">{c.naoPagos} não pago{c.naoPagos === 1 ? '' : 's'}</strong>
          </span>
        </div>
      </td>
    </tr>
  );
}

/**
 * A setinha ao lado da lixeira, como em Vendas: gira ao abrir o detalhe.
 * Clicar na linha continua abrindo também — a setinha é o convite visível.
 */
export function SetaDetalhe({
  aberto, onClick, disabled, rotulo,
}: {
  aberto: boolean;
  onClick: () => void;
  disabled?: boolean;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={aberto}
      aria-label={aberto ? `Fechar detalhes de ${rotulo}` : `Ver detalhes de ${rotulo}`}
      title={aberto ? 'Fechar detalhes' : 'Ver detalhes'}
      className="ml-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', aberto && 'rotate-180')} aria-hidden />
    </button>
  );
}
