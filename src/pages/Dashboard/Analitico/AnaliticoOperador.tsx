/**
 * AnaliticoOperador — visão do operador (cargo 1)
 * Aba "Meus recebimentos": lista os próprios acordos pagos no ERP com status
 * de tabulação. Aba "Ranking": pódio de recebimento de todos os operadores da
 * empresa no mês (via RPC fn_analitico_resumo_por_operador), com a posição do
 * próprio operador destacada.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { CalendarDays, X, ListChecks, Trophy, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useTenant } from '@/lib/tenant-config';
import { useAuth } from '@/hooks/useAuth';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { rotuloFormaPagamento, corFormaPagamento } from '@/lib/formaPagamento';
import { supabase } from '@/lib/supabase';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { TabulacaoCell } from './TabulacaoCell';
import { RankingView } from './RankingView';
import { DetalhamentoFormaPagamento } from './DetalhamentoFormaPagamento';
import {
  buscarResumoOperadoresAnalitico,
  type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { buscarSituacaoOperadores, idsOcultosRankingQuartil } from '@/services/situacaoUsuario.service';

interface AnaliticoOperadorProps {
  dados: AnaliticoRecebimento[];
  loading: boolean;
  operadorId: string;
  operadorNome: string;
  empresaId: string;
  /** Mês exibido ('yyyy-MM') — usado para carregar o ranking */
  mes: string;
  liderId?: string | null;
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
  // Rótulo e cor canônicos (fonte única) — BookPlay usa forma_detalhe.
  const texto = rotuloFormaPagamento(forma, detalhe);
  const cor = corFormaPagamento(texto);
  return (
    <Badge variant="outline" className="text-xs font-semibold rounded-full px-2.5 py-0.5"
      style={{ background: cor + '1e', borderColor: cor + '55', color: cor }}>
      {texto}
    </Badge>
  );
}

/** Badge de tipo de vínculo (Direto/Extra) — só quando o setor usa a lógica. */
function chipTipo(tipo: 'direto' | 'extra') {
  const isExtra = tipo === 'extra';
  return (
    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide"
      style={isExtra
        ? { borderColor: '#f59e0b66', color: '#f59e0b' }
        : { borderColor: '#3b82f666', color: '#3b82f6' }}>
      {isExtra ? 'Extra' : 'Direto'}
    </Badge>
  );
}

export function AnaliticoOperador({
  dados, loading, operadorId, operadorNome, empresaId, mes, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoOperadorProps) {
  const tenant = useTenant();
  const mostrarHO = tenant.isPaguePlay;   // HO só existe no relatório PaguePlay
  const { perfil } = useAuth();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();
  const [, setForceRender] = useState(0);
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');
  const [abaOp, setAbaOp] = useState<'meus' | 'detalhado' | 'ranking'>('meus');

  // Setor do operador usa direto/extra? → controla o badge de tipo
  const temDiretoExtra = isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as { equipe_id?: string | null } | null)?.equipe_id ?? null,
  );

  // tipo_vinculo por acordo vinculado (para o badge Direto/Extra) — busca em lote
  const [tipoPorAcordo, setTipoPorAcordo] = useState<Record<string, 'direto' | 'extra'>>({});
  useEffect(() => {
    if (!temDiretoExtra) { setTipoPorAcordo({}); return; }
    const ids = [...new Set(dados.map(d => d.acordo_id).filter((x): x is string => !!x))];
    if (!ids.length) { setTipoPorAcordo({}); return; }
    let cancelado = false;
    void supabase.from('acordos').select('id, tipo_vinculo').in('id', ids)
      .then(({ data }) => {
        if (cancelado || !data) return;
        const map: Record<string, 'direto' | 'extra'> = {};
        for (const a of data as { id: string; tipo_vinculo: 'direto' | 'extra' | null }[]) {
          if (a.tipo_vinculo) map[a.id] = a.tipo_vinculo;
        }
        setTipoPorAcordo(map);
      });
    return () => { cancelado = true; };
  }, [dados, temDiretoExtra]);

  /** Badge de tipo da linha, quando aplicável. */
  const tipoDaLinha = (l: AnaliticoRecebimento) =>
    temDiretoExtra && l.acordo_id ? (tipoPorAcordo[l.acordo_id] ?? null) : null;

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
      buscarSituacaoOperadores(empresaId),
    ]);
    if (error) toast.error(`Erro ao carregar ranking: ${error}`);
    setRanking(data);
    setOperadoresOcultos(idsOcultosRankingQuartil(situacaoMap));
    setLoadingRanking(false);
  }, [empresaId, mes]);

  useEffect(() => {
    if (abaOp === 'ranking') void carregarRanking();
  }, [abaOp, carregarRanking]);

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
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'meus',      label: 'Meus recebimentos',  Icon: ListChecks },
          { key: 'detalhado', label: 'Detalhado',          Icon: Wallet },
          { key: 'ranking',   label: 'Ranking',            Icon: Trophy },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setAbaOp(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              abaOp === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

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
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-medium">Período:</span>
              <input
                type="date"
                value={filtroInicio}
                onChange={e => setFiltroInicio(e.target.value)}
                className="h-7 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={filtroFim}
                onChange={e => setFiltroFim(e.target.value)}
                className="h-7 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {(filtroInicio || filtroFim) && (
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs text-muted-foreground" onClick={limparFiltro}>
                  <X className="w-3 h-3" /> Limpar
                </Button>
              )}
              {(filtroInicio || filtroFim) && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({dadosFiltrados.length} de {dados.length} registros)
                </span>
              )}
            </div>

            {/* Resumo */}
            <div className={cn('grid gap-3', mostrarHO ? 'grid-cols-3' : 'grid-cols-2')}>
              <Card className="border-border">
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-primary">{formatBRL(totalRecebido)}</p>
                  <p className="text-xs text-muted-foreground">Total recebido</p>
                </CardContent>
              </Card>
              {mostrarHO && (
                <Card className="border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold">{formatBRL(totalHO)}</p>
                    <p className="text-xs text-muted-foreground">Total HO</p>
                  </CardContent>
                </Card>
              )}
              <Card className="border-border">
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">
                    {tabulados}/{dadosFiltrados.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Tabulados</p>
                </CardContent>
              </Card>
            </div>

            {dadosFiltrados.length === 0 && (filtroInicio || filtroFim) && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nenhum recebimento no período selecionado.</p>
              </div>
            )}

            {/* Tabela detalhada — cliente em destaque, Nr documento, forma, tipo */}
            {dadosFiltrados.length > 0 && (
              <Card className="border-border overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Cliente</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Nr Documento</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Forma</th>
                          {temDiretoExtra && <th className="text-left px-3 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>}
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Dt.Pgto</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Recebido</th>
                          {mostrarHO && <th className="text-right px-3 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Total HO</th>}
                          <th className="text-right px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wide">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {dadosFiltrados.flatMap(linha => {
                          const rowClass = cn('hover:bg-muted/40 transition-colors', !linha.visto && 'bg-primary/[0.04]');
                          const pagamentos = linha.pagamentos_detalhados;
                          const tipo = tipoDaLinha(linha);

                          // Célula de cliente em destaque (nome grande + instituição)
                          const celulaCliente = (
                            <div className="flex items-start gap-1.5">
                              {!linha.visto && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" title="Novo" />
                              )}
                              <div className="min-w-0">
                                <span className="block font-semibold text-sm text-foreground leading-tight truncate max-w-[240px]">
                                  {linha.nome_cliente ?? '—'}
                                </span>
                                {linha.instituicao && (
                                  <span className="block text-[10px] text-muted-foreground/70 uppercase tracking-wide leading-tight mt-0.5">
                                    {linha.instituicao}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                          const celulaDoc = <span className="font-mono font-semibold text-primary">{linha.codigo}</span>;
                          const celulaAcao = (
                            <TabulacaoCell
                              linha={linha} empresaId={empresaId}
                              operadorId={operadorId} operadorNome={operadorNome}
                              liderId={liderId}
                              onAbrirNovoAcordo={onAbrirNovoAcordo}
                              onVerAcordo={onVerAcordo}
                              onRefetch={() => { setForceRender(v => v + 1); onRefetch(); }}
                            />
                          );

                          if (!pagamentos || pagamentos.length <= 1) {
                            return [
                              <tr key={linha.id} className={rowClass}>
                                <td className="px-4 py-3">{celulaCliente}</td>
                                <td className="px-3 py-3">{celulaDoc}</td>
                                <td className="px-3 py-3">{chipForma(linha.forma_pagamento, linha.forma_detalhe)}</td>
                                {temDiretoExtra && <td className="px-3 py-3">{tipo ? chipTipo(tipo) : <span className="text-muted-foreground/50">—</span>}</td>}
                                <td className="px-3 py-3 tabular-nums text-muted-foreground">
                                  {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-3 py-3 text-right font-mono font-bold text-foreground">{formatBRL(linha.valor_recebido)}</td>
                                {mostrarHO && <td className="px-3 py-3 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>}
                                <td className="px-4 py-3 text-right">{celulaAcao}</td>
                              </tr>,
                            ];
                          }

                          // Múltiplos pagamentos: cliente/doc/forma/tipo/ação com rowSpan; valor+data por pagamento
                          return pagamentos.map((p, idx) => (
                            <tr key={`${linha.id}::${idx}`} className={rowClass}>
                              {idx === 0 && <td rowSpan={pagamentos.length} className="px-4 py-3 align-top">{celulaCliente}</td>}
                              {idx === 0 && <td rowSpan={pagamentos.length} className="px-3 py-3 align-top">{celulaDoc}</td>}
                              {idx === 0 && <td rowSpan={pagamentos.length} className="px-3 py-3 align-top">{chipForma(linha.forma_pagamento, linha.forma_detalhe)}</td>}
                              {idx === 0 && temDiretoExtra && (
                                <td rowSpan={pagamentos.length} className="px-3 py-3 align-top">
                                  {tipo ? chipTipo(tipo) : <span className="text-muted-foreground/50">—</span>}
                                </td>
                              )}
                              <td className="px-3 py-3 tabular-nums text-muted-foreground">
                                {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-foreground">{formatBRL(p.valor)}</td>
                              {mostrarHO && <td className="px-3 py-3 text-right font-mono text-muted-foreground">{formatBRL(p.total_ho)}</td>}
                              {idx === 0 && <td rowSpan={pagamentos.length} className="px-4 py-3 text-right align-top">{celulaAcao}</td>}
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}

      {/* ── Aba: Detalhado (forma de pagamento — só o próprio operador) ────── */}
      {abaOp === 'detalhado' && (
        <DetalhamentoFormaPagamento
          modo="operador"
          dados={dados}
          loading={loading}
          operadorNome={operadorNome}
        />
      )}

      {/* ── Aba: Ranking ──────────────────────────────────────────────────── */}
      {abaOp === 'ranking' && (
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
