/**
 * DiarioOperador — visão do operador na aba Recebimento diário.
 *
 * Lista informativa dos próprios pagamentos do dia (código, nome, forma,
 * valor e data), com total ao final. Sem vínculo com acordos tabulados.
 *
 * "Novos": acordos que apareceram pela primeira vez na última importação do
 * dia (a partir do 2º relatório). A lista separa "Anteriores" × "Novos" e os
 * "novos" só deixam de ser destacados quando o próximo relatório é importado.
 */

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { useTenant } from '@/lib/tenant-config';
import { useDiario } from '@/hooks/useDiario';
import { AlertCircle } from 'lucide-react';
import { formaKindDiario, normDiario } from '@/services/diario/diarioComum';
import {
  linhasVivas, consolidarItens, dataLabel, fmtDataISO, type ItemDiario,
} from './helpers';
import { FormaChip } from './FormaChip';

interface DiarioOperadorProps {
  dia: string | null;
  operadorId: string;
}

function LinhasTabela({ itens, destaque, mostrarNR }: { itens: ItemDiario[]; destaque?: boolean; mostrarNR?: boolean }) {
  return (
    <>
      {itens.map(item => (
        <tr key={item.key} className={cn('hover:bg-muted/30 transition-colors', destaque && 'bg-primary/3')}>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              {destaque && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Novo" />
              )}
              <div>
                <span className="font-semibold tabular-nums">
                  {mostrarNR ? (item.acordo_codigo || '—') : (item.cliente_codigo || '—')}
                  {item.n > 1 && (
                    <span className="ml-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-400">
                      {item.n}x
                    </span>
                  )}
                </span>
                {item.nome_cliente && (
                  <span className="block text-muted-foreground leading-tight truncate max-w-[200px]">
                    {item.nome_cliente}
                  </span>
                )}
                {item.instituicao && (
                  <span className="block text-[10px] text-muted-foreground/70 leading-tight truncate max-w-[200px]">
                    {item.instituicao}
                  </span>
                )}
                {/* PaguePlay (código, não NR): acordo pago sem tabulação de
                    "acordo fechado" — mesma indicação da visão do líder,
                    agora visível também para o próprio operador. */}
                {!mostrarNR && normDiario(item.tabulacao) !== 'acordofechado' && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    title="Este acordo não está tabulado como Acordo Fechado">
                    <AlertCircle className="w-2.5 h-2.5" /> Tabular Acordo Fechado
                  </span>
                )}
              </div>
            </div>
          </td>
          <td className="px-3 py-2.5"><FormaChip forma={item.forma_pagamento} /></td>
          <td className="px-3 py-2.5 text-right font-mono font-medium">{formatBRL(item.valor)}</td>
          <td className="px-3 py-2.5 tabular-nums">{dataLabel(item)}</td>
        </tr>
      ))}
    </>
  );
}

export function DiarioOperador({ dia, operadorId }: DiarioOperadorProps) {
  const tenant = useTenant();
  const mostrarNR = !tenant.isPaguePlay;   // BookPlay usa NR no lugar do Cod.Cliente
  const { dados, loading } = useDiario({
    dia,
    operadorFiltro: operadorId,
    marcarVisto: true,
  });

  const hojeISO = getTodayISO();

  const { itens, novos, anteriores, totais } = useMemo(() => {
    const vivas = linhasVivas(dados, hojeISO);
    // Última importação do dia (entre os pagamentos do próprio operador)
    const maxImportIndex = dados.reduce((m, r) => Math.max(m, r.import_index), 0);
    const consolidados = consolidarItens(vivas, maxImportIndex);
    const nv  = consolidados.filter(i => i.novo);
    const ant = consolidados.filter(i => !i.novo);
    return {
      itens: consolidados,
      novos: nv,
      anteriores: ant,
      totais: {
        total:  consolidados.reduce((s, i) => s + i.valor, 0),
        pix:    vivas.filter(v => formaKindDiario(v.forma_pagamento) === 'pix').reduce((s, v) => s + v.valor_recebido, 0),
        boleto: vivas.filter(v => formaKindDiario(v.forma_pagamento) === 'boleto').reduce((s, v) => s + v.valor_recebido, 0),
        cartao: vivas.filter(v => formaKindDiario(v.forma_pagamento) === 'cartao').reduce((s, v) => s + v.valor_recebido, 0),
      },
    };
  }, [dados, hojeISO]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (!itens.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">
          Nenhum recebimento seu em {dia ? fmtDataISO(dia) : 'nenhum dia'}.
        </p>
        <p className="text-xs mt-1">Aguarde o líder importar o relatório diário.</p>
      </div>
    );
  }

  const separar = novos.length > 0 && anteriores.length > 0;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-primary">{formatBRL(totais.total)}</p>
            <p className="text-xs text-muted-foreground">Total recebido</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-emerald-600">{formatBRL(totais.pix)}</p>
            <p className="text-xs text-muted-foreground">Pix</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-amber-600">{formatBRL(totais.boleto)}</p>
            <p className="text-xs text-muted-foreground">Boleto</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-purple-600">{formatBRL(totais.cartao)}</p>
            <p className="text-xs text-muted-foreground">Cartão</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <span>
          {itens.length} acordo{itens.length !== 1 ? 's' : ''} pago{itens.length !== 1 ? 's' : ''}
        </span>
        {novos.length > 0 && (
          <span className="inline-flex items-center gap-1 text-primary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            {novos.length} novo{novos.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabela */}
      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">{mostrarNR ? 'NR / NOME' : 'CÓDIGO / NOME'}</th>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">FORMA</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR RECEBIDO</th>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">DATA PGT.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {separar ? (
                  <>
                    <tr className="bg-muted/40">
                      <td colSpan={4} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Anteriores
                        <span className="float-right font-mono normal-case">
                          {anteriores.length} · {formatBRL(anteriores.reduce((s, i) => s + i.valor, 0))}
                        </span>
                      </td>
                    </tr>
                    <LinhasTabela itens={anteriores} mostrarNR={mostrarNR} />
                    <tr className="bg-primary/5">
                      <td colSpan={4} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Novos pagamentos
                        <span className="float-right font-mono normal-case">
                          {novos.length} · {formatBRL(novos.reduce((s, i) => s + i.valor, 0))}
                        </span>
                      </td>
                    </tr>
                    <LinhasTabela itens={novos} destaque mostrarNR={mostrarNR} />
                  </>
                ) : (
                  <LinhasTabela itens={itens} destaque={novos.length === itens.length && novos.length > 0} mostrarNR={mostrarNR} />
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td colSpan={2} className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right font-mono text-primary">{formatBRL(totais.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
