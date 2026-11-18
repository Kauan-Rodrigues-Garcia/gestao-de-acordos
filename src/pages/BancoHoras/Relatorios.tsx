/**
 * Relatórios: o que chamou atenção no relatório em tela (a conferência) e a
 * lista dos relatórios guardados, um por data de saldo.
 */
import { AlertTriangle, Download, Info, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Aviso } from '@/lib/bancoHoras/calculos';
import { baixarArquivo } from '@/lib/bancoHoras/excel';
import { data as fmtData } from '@/lib/bancoHoras/formato';
import type { PosicaoBH } from '@/lib/bancoHoras/tipos';
import { apagarBancoHoras } from '@/services/bancoHoras/bancoHoras.service';

interface Props {
  avisos: Aviso[];
  dataEmTela: string;
  posicoes: PosicaoBH[];
  gerenciar: boolean;
  empresaId: string;
  onApagado: () => void;
  onAbrir: (data: string) => void;
}

const pessoasDa = (p: PosicaoBH) => new Set(Object.values(p.setores).flatMap(s => s.people.map(x => `${s.empresaCode}|${x.mat}`))).size;

export function Relatorios({ avisos, dataEmTela, posicoes, gerenciar, empresaId, onApagado, onAbrir }: Props) {
  const [apagar, setApagar] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  const confirmar = async () => {
    if (!apagar) return;
    setApagando(true);
    try {
      await apagarBancoHoras(empresaId, apagar);
      toast.success(`Relatório de ${fmtData(apagar)} apagado.`);
      onApagado();
    } catch (e) {
      toast.error('Não foi possível apagar', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setApagando(false);
      setApagar(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">O que chamou atenção</CardTitle>
          <p className="text-[11px] text-muted-foreground">Relatório com saldo em {fmtData(dataEmTela)}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {avisos.map(a => {
            const Icone = a.tom === 'alerta' ? AlertTriangle : Info;
            return (
              <div key={a.titulo} className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5',
                a.tom === 'alerta' ? 'border-warning/35 bg-warning/[0.06]' : 'border-border bg-muted/30')}>
                <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', a.tom === 'alerta' ? 'text-warning' : 'text-muted-foreground')} />
                <div className="min-w-0 text-[12.5px]">
                  <p className="font-semibold text-foreground">{a.titulo}</p>
                  {a.linhas.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>)}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm">Relatórios guardados</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Um por data do «Saldo Banco em». Importar de novo só troca o setor que mudou.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => baixarArquivo(
              new Blob([JSON.stringify({ app: 'banco-de-horas', versao: 1, exportadoEm: new Date().toISOString(), posicoes })], { type: 'application/json' }),
              `banco-de-horas-backup-${new Date().toISOString().slice(0, 10)}.json`,
            )}>
            <Download className="h-3.5 w-3.5" /> Baixar backup
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 text-[11px]">
                  <TableHead>Saldo em</TableHead>
                  <TableHead className="text-right">Setores</TableHead>
                  <TableHead className="text-right">Pessoas</TableHead>
                  <TableHead>Enviado pelo DP</TableHead>
                  <TableHead>Importado em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...posicoes].reverse().map(p => (
                  <TableRow key={p.date} className={cn('text-[12.5px]', p.date === dataEmTela && 'bg-primary/[0.05]')}>
                    <TableCell className="font-semibold">
                      {fmtData(p.date)}
                      {p.date === dataEmTela && <span className="ml-2 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">em tela</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Object.keys(p.setores).length}</TableCell>
                    <TableCell className="text-right tabular-nums">{pessoasDa(p)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtData(p.gerado)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.importadoEm ? new Date(p.importadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.date !== dataEmTela && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onAbrir(p.date)}>Ver</Button>
                        )}
                        {gerenciar && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                            onClick={() => setApagar(p.date)}>
                            <Trash2 className="h-3.5 w-3.5" /> Apagar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!apagar} onOpenChange={a => { if (!a && !apagando) setApagar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o relatório de {fmtData(apagar)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Some para todo mundo que vê o banco de horas, em todos os setores. Para ter de volta, é preciso importar os arquivos do DP de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void confirmar(); }} disabled={apagando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {apagando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
