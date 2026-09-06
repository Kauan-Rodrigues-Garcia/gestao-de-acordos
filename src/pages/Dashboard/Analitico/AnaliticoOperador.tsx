/**
 * AnaliticoOperador — visão do operador (cargo 1)
 * Aba "Meus recebimentos": lista os próprios acordos pagos no ERP com status
 * de tabulação. Aba "Ranking": pódio de recebimento de todos os operadores da
 * empresa no mês (via RPC fn_analitico_resumo_por_operador), com a posição do
 * próprio operador destacada.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { CalendarDays, X, ListChecks, Trophy, TrendingUp, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KpiTile } from '@/components/KpiTile';
import { AbasSegmentadas } from '@/components/AbasSegmentadas';
import { DatePickerField } from '@/components/DatePickerField';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useTenant } from '@/lib/tenant-config';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { TabulacaoCell } from './TabulacaoCell';
import { RankingView } from './RankingView';
import {
  buscarResumoOperadoresAnalitico,
  type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { buscarSituacaoOperadores, idsOcultosRankingQuartil } from '@/services/situacaoUsuario.service';
import {
  intervaloDoRecorte, mesDoRecorte, type Recorte,
} from '@/pages/Analitico/recorte';

type AbaOperador = 'meus' | 'ranking';

interface AnaliticoOperadorProps {
  dados: AnaliticoRecebimento[];
  loading: boolean;
  operadorId: string;
  operadorNome: string;
  empresaId: string;
  /** O recorte da lente. O mês sai dele; o intervalo limita o filtro de data. */
  recorte: Recorte;
  liderId?: string | null;
  podeVerRanking: boolean;
  onAbrirNovoAcordo: (dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
    dataPagamento?: string;
  }) => void;
  onVerAcordo: (acordoId: string, codigo?: string) => void;
  onRefetch: () => void;
}

function chipForma(forma: AnaliticoRecebimento['forma_pagamento'], detalhe?: string | null) {
  const isCartao = forma === 'cartao';
  // BookPlay traz o rótulo real (Boleto, Pix, Pix Automático…); PaguePlay usa o genérico.
  const texto = detalhe || (isCartao ? 'Cartão' : 'Boleto/Pix');
  return (
    <Badge variant="outline" className={cn(
      'text-xs',
      isCartao
        ? 'border-purple-300 text-purple-700 dark:text-purple-400'
        : 'border-blue-300 text-blue-700 dark:text-blue-400',
    )}>
      {texto}
    </Badge>
  );
}

export function AnaliticoOperador({
  dados, loading, operadorId, operadorNome, empresaId, recorte, liderId, podeVerRanking,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoOperadorProps) {
  const tenant = useTenant();
  const mostrarHO = tenant.isPaguePlay;   // HO só existe no relatório PaguePlay
  const mes = mesDoRecorte(recorte);
  const { inicio: pisoDoRecorte, fim: tetoDoRecorte } = intervaloDoRecorte(recorte);
  const [, setForceRender] = useState(0);
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');
  const [abaOp, setAbaOp] = useState<AbaOperador>('meus');

  // ── Ranking (carregado sob demanda ao abrir a aba / trocar de mês) ──────────
  const [ranking, setRanking] = useState<ResumoOperadorAnalitico[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);

  // Item 5: férias/desligado somem do ranking (recebimento deles segue nos totais).
  const [operadoresOcultos, setOperadoresOcultos] = useState<Set<string>>(new Set());

  const carregarRanking = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingRanking(true);
    const [{ data, error }, situacaoMap] = await Promise.all([
      buscarResumoOperadoresAnalitico(empresaId, mes),
      buscarSituacaoOperadores(empresaId, mes),
    ]);
    if (error) toast.error(`Erro ao carregar ranking: ${error}`);
    setRanking(data);
    setOperadoresOcultos(idsOcultosRankingQuartil(situacaoMap));
    setLoadingRanking(false);
  }, [empresaId, mes]);

  useEffect(() => {
    if (!podeVerRanking && abaOp === 'ranking') {
      setAbaOp('meus');
      return;
    }
    if (podeVerRanking && abaOp === 'ranking') void carregarRanking();
  }, [abaOp, carregarRanking, podeVerRanking]);

  /*
   * A posição já é sabida por quem tem o ranking liberado. Mostrá-la no topo
   * custa nada e evita a viagem à outra aba só para responder "onde eu estou?".
   */
  useEffect(() => {
    if (podeVerRanking && ranking.length === 0) void carregarRanking();
  }, [podeVerRanking, ranking.length, carregarRanking]);

  const minhaPosicao = useMemo(() => {
    if (!podeVerRanking || ranking.length === 0) return null;
    const visiveis = ranking
      .filter(r => !operadoresOcultos.has(r.operador_id))
      .sort((a, b) => b.total_recebido - a.total_recebido);
    const i = visiveis.findIndex(r => r.operador_id === operadorId);
    if (i < 0) return null;
    return {
      posicao: i + 1,
      de:      visiveis.length,
      // Quanto falta para o degrau de cima. `null` no primeiro lugar.
      faltam:  i === 0 ? null : visiveis[i - 1].total_recebido - visiveis[i].total_recebido,
    };
  }, [podeVerRanking, ranking, operadoresOcultos, operadorId]);

  const dadosFiltrados = useMemo(() => {
    if (!filtroInicio && !filtroFim) return dados;
    return dados.filter(d => {
      if (filtroInicio && d.data_pagamento < filtroInicio) return false;
      if (filtroFim   && d.data_pagamento > filtroFim)    return false;
      return true;
    });
  }, [dados, filtroInicio, filtroFim]);

  function limparFiltro() {
    setFiltroInicio('');
    setFiltroFim('');
  }

  const totalRecebido = dadosFiltrados.reduce((s, d) => s + d.valor_recebido, 0);
  const totalHO       = dadosFiltrados.reduce((s, d) => s + d.total_ho, 0);
  const tabulados     = dadosFiltrados.filter(d => d.status_tabulacao === 'tabulado').length;

  return (
    <div className="space-y-4">
      {/* Abas internas: Meus recebimentos × Ranking */}
      <AbasSegmentadas<AbaOperador>
        abas={[
          { key: 'meus', label: 'Meus recebimentos', Icon: ListChecks },
          ...(podeVerRanking ? [{ key: 'ranking' as const, label: 'Ranking', Icon: Trophy }] : []),
        ]}
        ativa={abaOp}
        onTrocar={setAbaOp}
        rotulo="Visão do operador"
      />

      {/* ── Aba: Meus recebimentos ────────────────────────────────────────── */}
      {abaOp === 'meus' && (
        loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded-lg" />
            ))}
          </div>
        ) : !dados.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Nenhum recebimento encontrado para este mês.</p>
            <p className="text-xs mt-1">Aguarde o líder importar o relatório de recebimentos.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filtro de data */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <CalendarDays className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Período:</span>
              <DatePickerField
                value={filtroInicio} onChange={setFiltroInicio}
                placeholder="Data início" triggerClassName="w-32 rounded-lg"
                minDate={pisoDoRecorte} maxDate={filtroFim || tetoDoRecorte}
              />
              <span className="text-xs text-muted-foreground">até</span>
              <DatePickerField
                value={filtroFim} onChange={setFiltroFim}
                placeholder="Data fim" triggerClassName="w-32 rounded-lg"
                minDate={filtroInicio || pisoDoRecorte} maxDate={tetoDoRecorte}
              />
              {(filtroInicio || filtroFim) && (
                <>
                  <Button size="sm" variant="ghost"
                    className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
                    onClick={limparFiltro}>
                    <X className="w-3 h-3" /> Limpar
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {dadosFiltrados.length} de {dados.length} registros
                  </span>
                </>
              )}
            </div>

            {/* Resumo */}
            <div className={cn('grid gap-3', mostrarHO ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
              <KpiTile
                rotulo={recorte.modo === 'dia' ? 'Recebido no dia' : 'Total recebido'}
                Icon={TrendingUp} tom="primario"
                valor={formatBRL(totalRecebido)}
                valorNumerico={totalRecebido} formatar={formatBRL}
                sub={recorte.modo === 'dia' ? 'Recebimento vivo' : undefined}
              />
              {mostrarHO && (
                <KpiTile
                  rotulo="Total HO" Icon={CreditCard} tom="neutro"
                  valor={formatBRL(totalHO)}
                  valorNumerico={totalHO} formatar={formatBRL}
                />
              )}
              <div className="rounded-xl border border-success/20 bg-gradient-to-br from-success/[0.06] to-transparent p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Tabulados
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold leading-tight text-success">
                      {tabulados}<span className="text-muted-foreground">/{dadosFiltrados.length}</span>
                    </p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success ring-1 ring-success/20">
                    <ListChecks className="h-4 w-4" />
                  </div>
                </div>
                {/* A fração exige conta de cabeça; a barra, não. */}
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-[width]"
                    style={{
                      width: dadosFiltrados.length
                        ? `${((tabulados / dadosFiltrados.length) * 100).toFixed(0)}%`
                        : '0%',
                    }} />
                </div>
              </div>
            </div>

            {minhaPosicao && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-gradient-to-br from-muted/40 to-transparent px-3 py-2">
                <Trophy className="w-4 h-4 shrink-0 text-warning" />
                <span className="text-xs text-muted-foreground">Sua posição no mês:</span>
                <strong className="font-mono text-sm text-foreground">{minhaPosicao.posicao}º</strong>
                <span className="text-xs text-muted-foreground">de {minhaPosicao.de}</span>
                {minhaPosicao.faltam !== null && (
                  <span className="text-xs text-muted-foreground">
                    · faltam{' '}
                    <strong className="font-mono text-foreground">{formatBRL(minhaPosicao.faltam)}</strong>{' '}
                    para o {minhaPosicao.posicao - 1}º
                  </span>
                )}
              </div>
            )}

            {dadosFiltrados.length === 0 && (filtroInicio || filtroFim) && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nenhum recebimento no período selecionado.</p>
              </div>
            )}

            {/* Tabela */}
            {dadosFiltrados.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="sticky top-0 z-10 border-b border-border bg-muted/60 backdrop-blur">
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CÓDIGO</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">FORMA</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">RECEBIDO</th>
                          {mostrarHO && <th className="text-right px-3 py-3 font-semibold text-muted-foreground">TOTAL HO</th>}
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">DATA PGT.</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {dadosFiltrados.flatMap(linha => {
                          const rowClass = cn('hover:bg-muted/30 transition-colors', !linha.visto && 'bg-primary/3');
                          const pagamentos = linha.pagamentos_detalhados;

                          if (!pagamentos || pagamentos.length <= 1) {
                            return [
                              <tr key={linha.id} className={rowClass}>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    {!linha.visto && (
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Novo" />
                                    )}
                                    <div>
                                      <span className="font-semibold">{linha.codigo}</span>
                                      {linha.nome_cliente && (
                                        <span className="block text-muted-foreground leading-tight truncate max-w-[150px]">
                                          {linha.nome_cliente}
                                        </span>
                                      )}
                                      {linha.instituicao && (
                                        <span className="block text-[10px] text-muted-foreground/70 leading-tight truncate max-w-[150px]">
                                          {linha.instituicao}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">{chipForma(linha.forma_pagamento, linha.forma_detalhe)}</td>
                                <td className="px-3 py-2.5 text-right font-mono font-medium">{formatBRL(linha.valor_recebido)}</td>
                                {mostrarHO && <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>}
                                <td className="px-3 py-2.5 tabular-nums">
                                  {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <TabulacaoCell
                                    linha={linha} empresaId={empresaId}
                                    operadorId={operadorId} operadorNome={operadorNome}
                                    liderId={liderId}
                                    onAbrirNovoAcordo={onAbrirNovoAcordo}
                                    onVerAcordo={onVerAcordo}
                                    onRefetch={() => { setForceRender(v => v + 1); onRefetch(); }}
                                  />
                                </td>
                              </tr>,
                            ];
                          }

                          // Múltiplos pagamentos: uma linha por pagamento, código e ação com rowSpan
                          return pagamentos.map((p, idx) => (
                            <tr key={`${linha.id}::${idx}`} className={rowClass}>
                              {idx === 0 && (
                                <td rowSpan={pagamentos.length} className="px-3 py-2.5 align-top">
                                  <div className="flex items-center gap-1.5">
                                    {!linha.visto && (
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Novo" />
                                    )}
                                    <div>
                                      <span className="font-semibold">{linha.codigo}</span>
                                      {linha.nome_cliente && (
                                        <span className="block text-muted-foreground leading-tight truncate max-w-[150px]">
                                          {linha.nome_cliente}
                                        </span>
                                      )}
                                      {linha.instituicao && (
                                        <span className="block text-[10px] text-muted-foreground/70 leading-tight truncate max-w-[150px]">
                                          {linha.instituicao}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              )}
                              <td className="px-3 py-2.5">{chipForma(linha.forma_pagamento, linha.forma_detalhe)}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-medium">{formatBRL(p.valor)}</td>
                              {mostrarHO && <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatBRL(p.total_ho)}</td>}
                              <td className="px-3 py-2.5 tabular-nums">
                                {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </td>
                              {idx === 0 && (
                                <td rowSpan={pagamentos.length} className="px-3 py-2.5 text-right align-top">
                                  <TabulacaoCell
                                    linha={linha} empresaId={empresaId}
                                    operadorId={operadorId} operadorNome={operadorNome}
                                    liderId={liderId}
                                    onAbrirNovoAcordo={onAbrirNovoAcordo}
                                    onVerAcordo={onVerAcordo}
                                    onRefetch={() => { setForceRender(v => v + 1); onRefetch(); }}
                                  />
                                </td>
                              )}
                            </tr>
                          ));
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Aba: Ranking ──────────────────────────────────────────────────── */}
      {podeVerRanking && abaOp === 'ranking' && (
        <div className="space-y-4">
          {loadingRanking ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
            </div>
          ) : ranking.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para exibir neste mês.</p>
            </div>
          ) : (
            <RankingView resumos={ranking} destaqueOperadorId={operadorId} operadoresOcultos={operadoresOcultos} />
          )}
        </div>
      )}
    </div>
  );
}
