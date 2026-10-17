// src/pages/Analitico/Extrato/ExtratoRecebimentos.tsx
/**
 * O extrato de recebimentos — a lista do analítico em formato de extrato.
 *
 * Substitui as duas tabelas que a aba tinha (a do operador e a de dentro do
 * card do operador, na visão do líder), escritas em separado e já diferentes
 * uma da outra. Agora as duas visões leem a mesma lista, do mesmo jeito:
 *
 *   • um bloco por dia, com o total do dia no cabeçalho;
 *   • o trilho colorido à esquerda é a forma de pagamento (`corDaForma`, a
 *     mesma cor do gráfico de formas e do Painel Diretoria);
 *   • o selo EXTRA / DIRETO vem da coluna "Tipo comissão" do relatório e só
 *     aparece quando a lista tem algum Extra — ver `temExtra`;
 *   • os filtros «A tabular» e «Direto/Extra» trazem a contagem e o valor,
 *     para que filtrar já responda "quanto".
 *
 * A ação da linha (tabular, ver acordo, divergente) continua sendo de quem
 * chama: o extrato não sabe quem é o operador da linha nem para onde navegar.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link2, X } from 'lucide-react';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { corDaForma, rotuloDaForma } from '@/lib/formasPagamento';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  agruparPorDia, filtrarExtrato, precisaTabular, resumirVinculos, rotuloDoDia,
  temExtra, vinculoDaLinha, type FiltroStatus, type FiltroVinculo, type VinculoDaLinha,
} from './extrato';

interface ExtratoRecebimentosProps {
  linhas: AnaliticoRecebimento[];
  mostrarHO: boolean;
  hojeISO: string;
  renderAcao: (linha: AnaliticoRecebimento) => ReactNode;
  /** Texto quando a lista chega vazia (antes de qualquer filtro do extrato). */
  vazio?: string;
  /** Botões à direita da barra de filtros (ex.: «Copiar lista»). */
  acoes?: ReactNode;
  /** Sem borda própria — quando o extrato mora dentro de outro card. */
  embutido?: boolean;
  className?: string;
}

const ESTILO_SELO =
  'inline-flex items-center gap-0.5 rounded border px-1.5 py-px text-[9.5px] font-bold uppercase leading-tight tracking-wide whitespace-nowrap';

export function SeloVinculo({ vinculo }: { vinculo: VinculoDaLinha }) {
  if (vinculo === 'extra') {
    return (
      <span
        className={cn(ESTILO_SELO, 'border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300')}
        title="Extra: cliente vinculado a outro operador (coluna Tipo comissão do relatório)"
      >
        <Link2 className="h-2.5 w-2.5" aria-hidden="true" /> Extra
      </span>
    );
  }
  if (vinculo === 'direto') {
    return (
      <span
        className={cn(ESTILO_SELO, 'border-border bg-muted/50 text-muted-foreground')}
        title="Direto: cliente da carteira do próprio operador (Integral no relatório)"
      >
        Direto
      </span>
    );
  }
  return null;
}

interface OpcaoFiltro<K extends string> {
  key: K;
  rotulo: string;
  detalhe?: string;
  tom?: 'alerta' | 'extra';
}

function GrupoFiltro<K extends string>({
  rotulo, opcoes, ativa, onTrocar,
}: { rotulo: string; opcoes: OpcaoFiltro<K>[]; ativa: K; onTrocar: (k: K) => void }) {
  return (
    <div role="group" aria-label={rotulo}
      className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {opcoes.map(o => {
        const on = o.key === ativa;
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => onTrocar(o.key)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}>
            {o.tom === 'extra' && <Link2 className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            {o.rotulo}
            {o.detalhe && (
              <span className={cn(
                'font-mono text-[10px] tabular-nums',
                o.tom === 'alerta' ? 'font-bold text-warning' : 'text-muted-foreground',
              )}>
                {o.detalhe}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function dataCurta(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ExtratoRecebimentos({
  linhas, mostrarHO, hojeISO, renderAcao, vazio, acoes, embutido, className,
}: ExtratoRecebimentosProps) {
  const [status, setStatus] = useState<FiltroStatus>('todos');
  const [vinculo, setVinculo] = useState<FiltroVinculo>('todos');

  const mostrarVinculo = useMemo(() => temExtra(linhas), [linhas]);
  const vinculoEfetivo: FiltroVinculo = mostrarVinculo ? vinculo : 'todos';
  const resumo = useMemo(() => resumirVinculos(linhas), [linhas]);
  const qtdATabular = useMemo(() => linhas.filter(precisaTabular).length, [linhas]);

  const filtradas = useMemo(
    () => filtrarExtrato(linhas, status, vinculoEfetivo),
    [linhas, status, vinculoEfetivo],
  );
  const dias = useMemo(() => agruparPorDia(filtradas), [filtradas]);
  const maiorDia = dias.reduce((m, d) => Math.max(m, d.total), 0);
  const filtrando = status !== 'todos' || vinculoEfetivo !== 'todos';

  const opcoesStatus: OpcaoFiltro<FiltroStatus>[] = [
    { key: 'todos', rotulo: 'Todos', detalhe: String(linhas.length) },
    { key: 'a_tabular', rotulo: 'A tabular', detalhe: String(qtdATabular), tom: qtdATabular > 0 ? 'alerta' : undefined },
    { key: 'tabulados', rotulo: 'Tabulados', detalhe: String(linhas.length - qtdATabular) },
  ];
  const opcoesVinculo: OpcaoFiltro<FiltroVinculo>[] = [
    { key: 'todos', rotulo: 'Direto + Extra' },
    { key: 'direto', rotulo: 'Direto', detalhe: formatBRL(resumo.direto) },
    { key: 'extra', rotulo: 'Extra', detalhe: formatBRL(resumo.extra), tom: 'extra' },
  ];

  return (
    <div className={cn(!embutido && 'overflow-hidden rounded-xl border border-border bg-card', className)}>
      {/* Barra do extrato: filtros à esquerda, ações de quem chama à direita */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
        <GrupoFiltro rotulo="Situação da tabulação" opcoes={opcoesStatus} ativa={status} onTrocar={(k: FiltroStatus) => setStatus(k)} />
        {mostrarVinculo && (
          <GrupoFiltro rotulo="Direto ou Extra" opcoes={opcoesVinculo} ativa={vinculoEfetivo} onTrocar={(k: FiltroVinculo) => setVinculo(k)} />
        )}
        {acoes && <div className="ml-auto flex items-center gap-1.5">{acoes}</div>}
      </div>

      {linhas.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">{vazio ?? 'Sem registros.'}</p>
      ) : filtradas.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          <p>Nenhum recebimento com esse filtro.</p>
          <button type="button"
            className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/5"
            onClick={() => { setStatus('todos'); setVinculo('todos'); }}>
            <X className="h-3 w-3" /> Limpar filtros
          </button>
        </div>
      ) : (
        <div>
          {dias.map(d => {
            const { principal, semana } = rotuloDoDia(d.dia, hojeISO);
            return (
              <section key={d.dia} aria-label={`Recebimentos de ${dataCurta(d.dia)}`}>
                {/* Cabeçalho do dia. A barrinha é o peso do dia dentro do que
                    está na tela — o dia forte salta sem ler número. */}
                <header className="flex items-center gap-2 border-b border-border/70 bg-muted/35 px-3 py-1.5">
                  <span className="text-xs font-semibold text-foreground">{principal}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {semana}{principal === 'Hoje' || principal === 'Ontem' ? ` · ${dataCurta(d.dia)}` : ''}
                  </span>
                  <span className="ml-auto hidden h-1 w-16 overflow-hidden rounded-full bg-border/70 sm:block" aria-hidden="true">
                    <span className="block h-full rounded-full bg-primary/60"
                      style={{ width: `${maiorDia > 0 ? Math.max(4, (d.total / maiorDia) * 100) : 0}%` }} />
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground sm:ml-0">
                    {d.linhas.length} {d.linhas.length === 1 ? 'recebimento' : 'recebimentos'}
                  </span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                    {formatBRL(d.total)}
                  </span>
                </header>

                <ul className="divide-y divide-border/70">
                  {d.linhas.map(l => {
                    const forma = rotuloDaForma(l.forma_pagamento, l.forma_detalhe);
                    const cor = corDaForma(forma);
                    const pagamentos = l.pagamentos_detalhados && l.pagamentos_detalhados.length > 1
                      ? l.pagamentos_detalhados : null;
                    return (
                      <li key={l.id}
                        className={cn(
                          'relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-2.5 pl-4 pr-3',
                          'sm:grid-cols-[minmax(0,1fr)_auto_minmax(9.5rem,auto)] transition-colors hover:bg-muted/25',
                          !l.visto && 'bg-primary/[0.035]',
                        )}>
                        <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full"
                          style={{ backgroundColor: cor }} />

                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {!l.visto && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Novo" />
                            )}
                            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                              {l.codigo}
                            </span>
                            {mostrarVinculo && <SeloVinculo vinculo={vinculoDaLinha(l)} />}
                          </div>
                          {(l.nome_cliente || l.instituicao) && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {l.nome_cliente}
                              {l.nome_cliente && l.instituicao && <span className="text-muted-foreground/60"> · </span>}
                              {l.instituicao && <span className="text-muted-foreground/75">{l.instituicao}</span>}
                            </p>
                          )}
                          {/* Pagamentos consolidados (ex.: boleto + pix do mesmo
                              NR): cada um com valor e dia, em vez de N linhas
                              repetindo o mesmo código. */}
                          {pagamentos && (
                            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground">
                              {pagamentos.map((p, i) => (
                                <li key={i} className="tabular-nums">
                                  {p.tpdoc || forma} <span className="font-mono text-foreground/80">{formatBRL(p.valor)}</span> · {dataCurta(p.data)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                            {formatBRL(l.valor_recebido)}
                          </p>
                          <p className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} aria-hidden="true" />
                            <span className="truncate">{forma}</span>
                            {mostrarHO && <span className="font-mono">· HO {formatBRL(l.total_ho)}</span>}
                          </p>
                        </div>

                        <div className="col-span-2 flex justify-end sm:col-span-1">
                          {renderAcao(l)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {filtrando && (
            <p className="border-t border-border bg-muted/20 px-3 py-1.5 text-right text-[11px] text-muted-foreground">
              {filtradas.length} de {linhas.length} · {formatBRL(filtradas.reduce((s, l) => s + l.valor_recebido, 0))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
