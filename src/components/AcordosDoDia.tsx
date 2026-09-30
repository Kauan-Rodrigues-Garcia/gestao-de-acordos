/**
 * Peças visuais que as listas de acordos da cobrança (BookPlay e PaguePlay)
 * herdaram da lista de Vendas em 28/09/2026: a linha-título de cada dia e a
 * setinha que abre o detalhe do acordo.
 */
import { useEffect, useRef } from 'react';
import { CalendarDays, ChevronDown, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { rotuloDoDia } from '@/lib/rotuloDoDia';
import { contarPorStatus, type SelecaoDoDia } from '@/lib/acordosPorDia';
import type { StatusAcordo } from '@/lib/supabase';

/**
 * A caixinha que marca o dia inteiro. Fica no mesmo alinhamento da caixinha de
 * cada linha, logo abaixo, e mostra «meio marcado» quando só parte do dia está.
 */
function CaixaDoDia({ total, marcados, rotulo, onAlternar }: {
  total: number;
  marcados: number;
  rotulo: string;
  onAlternar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const parcial = marcados > 0 && marcados < total;
  // `indeterminate` não existe como atributo HTML — só pela propriedade.
  useEffect(() => { if (ref.current) ref.current.indeterminate = parcial; }, [parcial]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="rounded border-border"
      checked={total > 0 && marcados === total}
      onChange={onAlternar}
      aria-label={`Selecionar todos os acordos de ${rotulo}`}
      title={`Selecionar todos os acordos de ${rotulo}`}
    />
  );
}

/**
 * «Terça-feira · 15/09/2026 ········ 12 acordos · 7 pendentes · 4 pagos · 1 não pago»
 *
 * Só quantidades, sem valor: o pedido foi para a linha não poluir a lista.
 * `dia === null` é o bloco dos acordos com CPF, que fica acima de todos.
 *
 * Com `selecao` (30/09/2026), a linha ganha a caixinha que marca o dia inteiro
 * e, quando há acordo do dia marcado, o valor somado dos marcados no fim da
 * contagem — marcar o dia todo dá o total do operador naquele dia. Sem nada
 * marcado, a linha continua só com quantidades.
 */
export function LinhaDoDiaAcordos({
  dia, acordos, colSpan, hoje, selecao,
}: {
  dia: string | null;
  acordos: readonly { status: StatusAcordo | string }[];
  colSpan: number;
  hoje: string;
  selecao?: SelecaoDoDia & { onAlternar: () => void };
}) {
  const c = contarPorStatus(acordos);
  const ehHoje = dia === hoje;
  const rotulo = dia === null ? 'acordos com CPF' : rotuloDoDia(dia, hoje);
  return (
    <tr className={cn('border-b border-border', dia === null ? 'bg-destructive/10' : ehHoje ? 'bg-primary/10' : 'bg-muted/40')}>
      <td colSpan={colSpan} className="px-3 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-6">
            {selecao && (
              <CaixaDoDia total={c.total} marcados={selecao.marcados} rotulo={rotulo} onAlternar={selecao.onAlternar} />
            )}
            {dia === null ? (
              <span className="flex items-center gap-1.5 font-semibold text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                Com CPF no cadastro — corrigir primeiro
              </span>
            ) : (
              <span className={cn('flex items-center gap-1.5 font-semibold', ehHoje ? 'text-primary' : 'text-foreground')}>
                <CalendarDays className={cn('h-3.5 w-3.5', ehHoje ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                {rotulo}
              </span>
            )}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {c.total} acordo{c.total === 1 ? '' : 's'}
            {' · '}<strong className="font-semibold text-warning">{c.pendentes} pendente{c.pendentes === 1 ? '' : 's'}</strong>
            {' · '}<strong className="font-semibold text-success">{c.pagos} pago{c.pagos === 1 ? '' : 's'}</strong>
            {' · '}<strong className="font-semibold text-destructive">{c.naoPagos} não pago{c.naoPagos === 1 ? '' : 's'}</strong>
            {selecao && selecao.marcados > 0 && (
              <>
                {' · '}
                <strong
                  className="font-mono font-semibold text-primary"
                  title={selecao.marcados === c.total
                    ? `Valor total dos ${c.total} acordos do dia`
                    : `Valor dos ${selecao.marcados} acordos marcados neste dia`}
                >
                  {formatCurrency(selecao.valor)}
                </strong>
              </>
            )}
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
