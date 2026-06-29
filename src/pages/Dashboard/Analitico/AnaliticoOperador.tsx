/**
 * AnaliticoOperador — visão do operador (cargo 1)
 * Lista os próprios acordos pagos no ERP com status de tabulação.
 */

import { useState, useMemo } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { TabulacaoCell } from './TabulacaoCell';

interface AnaliticoOperadorProps {
  dados: AnaliticoRecebimento[];
  loading: boolean;
  operadorId: string;
  operadorNome: string;
  empresaId: string;
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

function chipForma(forma: AnaliticoRecebimento['forma_pagamento']) {
  if (forma === 'cartao') {
    return (
      <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 dark:text-purple-400">
        Cartão
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:text-blue-400">
      Boleto/Pix
    </Badge>
  );
}

export function AnaliticoOperador({
  dados, loading, operadorId, operadorNome, empresaId, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoOperadorProps) {
  const [, setForceRender] = useState(0);
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');

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

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (!dados.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Nenhum recebimento encontrado para este mês.</p>
        <p className="text-xs mt-1">Aguarde o líder importar o relatório de recebimentos.</p>
      </div>
    );
  }

  const totalRecebido = dadosFiltrados.reduce((s, d) => s + d.valor_recebido, 0);
  const totalHO       = dadosFiltrados.reduce((s, d) => s + d.total_ho, 0);
  const tabulados     = dadosFiltrados.filter(d => d.status_tabulacao === 'tabulado').length;

  return (
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
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-primary">{formatBRL(totalRecebido)}</p>
            <p className="text-xs text-muted-foreground">Total recebido</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{formatBRL(totalHO)}</p>
            <p className="text-xs text-muted-foreground">Total HO</p>
          </CardContent>
        </Card>
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

      {/* Tabela */}
      {dadosFiltrados.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CÓDIGO</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">FORMA</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground">RECEBIDO</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground">TOTAL HO</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">DATA PGT.</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground">AÇÃO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dadosFiltrados.map(linha => (
                    <tr
                      key={linha.id}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        !linha.visto && 'bg-primary/3',
                      )}
                    >
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
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{chipForma(linha.forma_pagamento)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium">{formatBRL(linha.valor_recebido)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <TabulacaoCell
                          linha={linha}
                          empresaId={empresaId}
                          operadorId={operadorId}
                          operadorNome={operadorNome}
                          liderId={liderId}
                          onAbrirNovoAcordo={onAbrirNovoAcordo}
                          onVerAcordo={onVerAcordo}
                          onRefetch={() => { setForceRender(v => v + 1); onRefetch(); }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
