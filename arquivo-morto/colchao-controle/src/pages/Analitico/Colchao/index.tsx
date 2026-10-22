import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Layers3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { copiarTexto } from '@/lib/clipboard';
import { formatBRL } from '@/lib/money';
import { toast } from 'sonner';
import {
  listarColchaoDoMes,
  type ColchaoForaMeta,
} from '@/services/analitico/colchao.service';
import { agruparColchaoPorOperador, formatarCopiaColchao, nrsUnicos } from './helpers';

interface AbaColchaoProps {
  empresaId: string;
  mes: string;
  setorId?: string | null;
  operadorId?: string | null;
}

function dataBR(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function AbaColchao({ empresaId, mes, setorId, operadorId }: AbaColchaoProps) {
  const [linhas, setLinhas] = useState<ColchaoForaMeta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState('');

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    listarColchaoDoMes(empresaId, mes, setorId, operadorId)
      .then(dados => {
        if (cancelado) return;
        setLinhas(dados);
        const datas = [...new Set(dados.map(l => l.data_pagamento))].sort();
        setDataSelecionada(atual => datas.includes(atual) ? atual : (datas[datas.length - 1] ?? ''));
      })
      .catch(e => {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Não foi possível carregar o Colchão.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [empresaId, mes, setorId, operadorId]);

  const datas = useMemo(
    () => [...new Set(linhas.map(l => l.data_pagamento))].sort(),
    [linhas],
  );
  const linhasDoDia = useMemo(
    () => linhas.filter(l => l.data_pagamento === dataSelecionada),
    [linhas, dataSelecionada],
  );
  const grupos = useMemo(() => agruparColchaoPorOperador(linhasDoDia), [linhasDoDia]);
  const totalMes = useMemo(
    () => linhas.reduce((soma, linha) => soma + Number(linha.valor_recebido), 0),
    [linhas],
  );
  const totalDia = useMemo(
    () => linhasDoDia.reduce((soma, linha) => soma + Number(linha.valor_recebido), 0),
    [linhasDoDia],
  );

  async function copiarDia() {
    if (!linhasDoDia.length) return;
    await copiarTexto(
      formatarCopiaColchao(dataSelecionada, linhasDoDia),
      `${nrsUnicos(linhasDoDia).length} NR(s) do Colchão copiados.`,
    );
  }

  async function exportarDia() {
    if (!linhasDoDia.length) return;
    try {
      const { utils, write } = await import('@e965/xlsx');
      const rows = linhasDoDia.map(l => ({
        Data: dataBR(l.data_pagamento),
        Cobradora: l.operador_usuario,
        Equipe: l.equipe,
        Código: l.codigo,
        Cliente: l.nome_cliente ?? '',
        NR: l.nr_documento,
        Título: l.titulo,
        Parcela: l.parcela,
        Forma: l.tpdoc_original,
        Recebido: Number(l.valor_recebido),
      }));
      const ws = utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 28 },
        { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 14 },
      ];
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, `Colchao ${dataSelecionada.slice(5)}`);
      const buffer = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `colchao_${dataSelecionada}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Excel do Colchão gerado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o Excel.');
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando Colchão…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar a aba Colchão: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <Layers3 className="w-5 h-5" />
          </span>
          <div>
            <p className="font-semibold">Colchão fora da meta</p>
            <p className="text-xs text-muted-foreground">
              Acompanhamento separado — estes valores não entram no Analítico, ranking ou projeção.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{nrsUnicos(linhas).length} NRs no mês</Badge>
          <Badge variant="outline">{formatBRL(totalMes)}</Badge>
        </div>
      </div>

      {datas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum registro de Colchão fora da meta neste mês.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Data:</span>
              <select
                value={dataSelecionada}
                onChange={e => setDataSelecionada(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {datas.map(data => <option key={data} value={data}>{dataBR(data)}</option>)}
              </select>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">
                {nrsUnicos(linhasDoDia).length} NRs · {formatBRL(totalDia)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void copiarDia()}>
                <Copy className="w-4 h-4 mr-1.5" /> Copiar NRs do dia
              </Button>
              <Button variant="outline" size="sm" onClick={() => void exportarDia()}>
                <Download className="w-4 h-4 mr-1.5" /> Exportar Excel
              </Button>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-center">NRs</TableHead>
                  <TableHead>Lista para copiar</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="w-[120px] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map(grupo => (
                  <TableRow key={grupo.operador}>
                    <TableCell className="font-mono font-medium">{grupo.operador}</TableCell>
                    <TableCell className="text-center">{grupo.nrs.length}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground break-all">
                        {grupo.nrs.join(', ') || 'Sem NR'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(grupo.total)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!grupo.nrs.length}
                        onClick={() => void copiarTexto(
                          formatarCopiaColchao(dataSelecionada, grupo.linhas),
                          `NRs de ${grupo.operador} copiados.`,
                        )}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
