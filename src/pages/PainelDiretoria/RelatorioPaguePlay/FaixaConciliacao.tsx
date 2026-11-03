/**
 * FaixaConciliacao — os últimos dias do relatório de conciliação, um quadrado
 * por dia, no mesmo desenho da faixa do 945 (aba Pagamento).
 *
 *   verde   completo: um arquivo o cobriu depois que o dia acabou
 *   verde   claro, sem movimento: completo e sem linha (fim de semana, feriado)
 *   âmbar   em andamento: só foi coberto no próprio dia
 *   cinza   sem importação
 */

import { CalendarCheck2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataBR, diaDaSemana, horaDoCorte } from '@/services/relatorio945/modelo';
import {
  faixaConciliacao, inicioRecomendado, type EstadoDiaConciliacao, type ResumoSalvo,
} from '@/services/relatorioPaguePlay/modelo';

const COR: Readonly<Record<EstadoDiaConciliacao, string>> = {
  completo: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
  sem_movimento: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
  andamento: 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
  sem_importacao: 'bg-muted text-muted-foreground',
};

const ROTULO: Readonly<Record<EstadoDiaConciliacao, string>> = {
  completo: 'Importado',
  sem_movimento: 'Importado · sem conciliação (dia não útil)',
  andamento: 'Em andamento',
  sem_importacao: 'Não importado',
};

const LEGENDA: readonly EstadoDiaConciliacao[] = ['completo', 'sem_movimento', 'andamento', 'sem_importacao'];

export function FaixaConciliacao({ resumo, dias = 14 }: { resumo: ResumoSalvo | null; dias?: number }) {
  if (!resumo) return <div className="h-14 animate-pulse rounded-lg bg-muted" />;

  const faixa = faixaConciliacao(resumo.hoje, resumo.dias, dias);
  const desde = inicioRecomendado(resumo.hoje, resumo.primeiraImportacaoPendente, resumo.dias);
  const pendentes = faixa.filter(d => d.data < resumo.hoje && (d.estado === 'andamento' || d.estado === 'sem_importacao'));

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          <CalendarCheck2 className="h-3.5 w-3.5 text-primary" /> Dias da conciliação
        </span>
        <span className="text-muted-foreground">Última importação: {horaDoCorte(resumo.ultimaImportacao)}</span>
      </div>
      <ol className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap" aria-label="Situação de cada dia">
        {faixa.map(d => (
          <li
            key={d.data}
            title={[
              `${diaDaSemana(d.data)} ${dataBR(d.data)} · ${ROTULO[d.estado]}`,
              d.quantidade ? `${d.quantidade} pagamentos` : null,
            ].filter(Boolean).join('\n')}
            className={cn(
              'flex min-w-[2.75rem] flex-col items-center rounded-md px-1.5 py-1 text-[10px] leading-tight tabular-nums',
              COR[d.estado],
              d.data === resumo.hoje && 'ring-2 ring-primary/60',
            )}
          >
            <span className="uppercase opacity-80">{diaDaSemana(d.data)}</span>
            <span className="font-semibold">{dataBR(d.data).slice(0, 5)}</span>
          </li>
        ))}
      </ol>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {LEGENDA.map(e => (
          <li key={e} className="flex items-center gap-1">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', COR[e])} />{ROTULO[e]}
          </li>
        ))}
      </ul>
      {pendentes.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Pendente: {pendentes.map(d => `${dataBR(d.data).slice(0, 5)} (${d.estado === 'andamento' ? 'em andamento' : 'não importado'})`).join(', ')}.
        </p>
      )}
      <p className="text-xs">
        <span className="font-medium">Próxima importação:</span>{' '}
        {desde
          ? `exporte a conciliação com data inicial ${dataBR(desde)} (${diaDaSemana(desde)}) até hoje. A conciliação só anda em dia útil — arquivo só com linhas de hoje é normal depois de fim de semana ou feriado.`
          : 'hoje já foi atualizado: as próximas importações podem conter somente hoje.'}
      </p>
    </div>
  );
}
