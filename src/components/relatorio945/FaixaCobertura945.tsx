/**
 * FaixaCobertura945 — os últimos dias do relatório 945, um quadrado por dia.
 *
 *   verde escuro  consolidado: um arquivo o cobriu 7+ dias depois (já com as
 *                 baixas retroativas)
 *   verde         completo: um arquivo o cobriu depois que o dia acabou
 *   âmbar         parcial: só foi coberto enquanto ainda estava acontecendo
 *   cinza         sem importação
 *
 * O anel vermelho marca dia em que o recebimento diário e o Relatório de
 * pagamento têm quantidades diferentes de baixas — as duas tabelas saem do
 * mesmo arquivo e deviam bater.
 */

import { AlertCircle, CalendarCheck2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ROTULO_ESTADO, dataBR, diaDaSemana, horaDoCorte, instrucaoDeExportacao,
  type Cobertura, type DiaCobertura, type EstadoDia,
} from '@/services/relatorio945/modelo';

const COR: Readonly<Record<EstadoDia, string>> = {
  consolidado: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
  completo: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
  parcial: 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
  sem_importacao: 'bg-muted text-muted-foreground',
};

function divergente(d: DiaCobertura, piso: string) {
  return d.data >= piso && d.diario !== d.diretoria;
}

export function FaixaCobertura945({ cobertura, erro, dias = 14, className }: {
  cobertura: Cobertura | null;
  erro?: string | null;
  dias?: number;
  className?: string;
}) {
  if (erro) {
    return (
      <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <AlertCircle className="h-3.5 w-3.5" /> Cobertura do 945 indisponível: {erro}
      </p>
    );
  }
  if (!cobertura) return <div className={cn('h-14 animate-pulse rounded-lg bg-muted', className)} />;

  const visiveis = cobertura.dias.slice(-dias);
  const comDivergencia = visiveis.filter(d => divergente(d, cobertura.piso_diario));

  return (
    <div className={cn('space-y-2 rounded-lg border border-border bg-card p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          <CalendarCheck2 className="h-3.5 w-3.5 text-primary" /> Cobertura do relatório 945
        </span>
        <span className="text-muted-foreground">
          Último arquivo vai até {horaDoCorte(cobertura.ultimo_corte)}
        </span>
      </div>
      <ol className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap" aria-label="Situação de cada dia">
        {visiveis.map(d => (
          <li
            key={d.data}
            title={[
              `${diaDaSemana(d.data)} ${dataBR(d.data)} · ${ROTULO_ESTADO[d.estado]}`,
              d.corte ? `arquivo até ${horaDoCorte(d.corte)}` : null,
              `recebimento diário: ${d.diario} · relatório de pagamento: ${d.diretoria}`,
              divergente(d, cobertura.piso_diario) ? 'as duas tabelas não batem neste dia' : null,
            ].filter(Boolean).join('\n')}
            className={cn(
              'flex min-w-[2.75rem] flex-col items-center rounded-md px-1.5 py-1 text-[10px] leading-tight tabular-nums',
              COR[d.estado],
              divergente(d, cobertura.piso_diario) && 'ring-2 ring-destructive',
            )}
          >
            <span className="uppercase opacity-80">{diaDaSemana(d.data)}</span>
            <span className="font-semibold">{dataBR(d.data).slice(0, 5)}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs">
        <span className="font-medium">Próxima importação:</span> {instrucaoDeExportacao(cobertura)}
      </p>
      {comDivergencia.length > 0 && (
        <p className="text-xs text-destructive">
          Recebimento diário e Relatório de pagamento não batem em {comDivergencia.map(d => dataBR(d.data).slice(0, 5)).join(', ')}.
          Importe o 945 cobrindo esses dias para realinhar.
        </p>
      )}
    </div>
  );
}
