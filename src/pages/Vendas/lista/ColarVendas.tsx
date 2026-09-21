/**
 * ColarVendas — lançar o dia inteiro de uma vez.
 *
 * O operador que anota as vendas numa planilha ou no WhatsApp cola tudo aqui:
 * uma venda por linha, em qualquer ordem de colunas. `lerVendasColadas`
 * reconhece NR, valor, data e cliente pela forma; a tela mostra o que entendeu
 * ANTES de gravar, linha a linha, com o motivo de cada recusa.
 *
 * Grava uma por uma pela mesma RPC do lançamento (`fn_venda_salvar`), e não
 * num lote: cada venda passa pelas mesmas travas — alcance, NR único, valor —
 * e a que falhar diz por quê sem derrubar as outras.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPaste, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { lerVendasColadas } from '@/lib/vendasLista';
import type { EntradaVenda } from '@/services/vendas/vendas.service';
import type { OpcaoDeVendedor } from './NovaVendaInline';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  operadorPadrao: string;
  vendedores: readonly OpcaoDeVendedor[];
  nrsConhecidos: ReadonlyMap<string, string>;
  onSalvar: (entrada: Omit<EntradaVenda, 'empresaId'>) => Promise<{ ok: boolean; erro: string | null }>;
  onLancou?: (quantas: number) => void;
}

const EXEMPLO = `13073323	Maria Souza	5.572,00
13073324 - José Lima - R$ 3.087,20 - 18/09
4.990,00 13073325 Ana Paula`;

export function ColarVendas({
  aberto, onFechar, operadorPadrao, vendedores, nrsConhecidos, onSalvar, onLancou,
}: Props) {
  const [texto, setTexto] = useState('');
  const [operador, setOperador] = useState(operadorPadrao);
  const [gravando, setGravando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [falhas, setFalhas] = useState<Record<string, string>>({});

  const lidas = useMemo(() => lerVendasColadas(texto).map(v => ({
    ...v,
    erro: v.erro ?? (nrsConhecidos.has(v.nr) ? `já lançado (${nrsConhecidos.get(v.nr)})` : null),
  })), [texto, nrsConhecidos]);
  const boas = lidas.filter(v => !v.erro);
  const total = boas.reduce((s, v) => s + v.valor, 0);

  function fechar() {
    if (gravando) return;
    setTexto(''); setFeitas(0); setFalhas({});
    onFechar();
  }

  async function lancar() {
    setGravando(true); setFeitas(0); setFalhas({});
    const erros: Record<string, string> = {};
    let ok = 0;
    for (const v of boas) {
      const r = await onSalvar({
        id: null,
        operadorId: operador,
        nrDocumento: v.nr,
        cliente: v.cliente,
        uf: null,
        valorTotal: v.valor,
        valorEntrada: null,
        formaPagamento: null,
        dataVenda: v.data ?? getTodayISO(),
      });
      if (r.ok) ok += 1; else erros[v.nr] = r.erro ?? 'falhou';
      setFeitas(n => n + 1);
    }
    setGravando(false);
    setFalhas(erros);
    if (ok > 0) onLancou?.(ok);

    const nFalhas = Object.keys(erros).length;
    if (nFalhas === 0) {
      toast.success(`${ok} venda${ok > 1 ? 's' : ''} lançada${ok > 1 ? 's' : ''}.`);
      setTexto(''); setFeitas(0);
      onFechar();
    } else {
      toast.warning(`${ok} lançada${ok === 1 ? '' : 's'}, ${nFalhas} com problema — veja na lista.`);
      // Fica só o que falhou, para corrigir e tentar de novo.
      setTexto(lidas.filter(v => erros[v.nr] || v.erro).map(v => `${v.nr}\t${v.cliente ?? ''}\t${v.valor.toFixed(2).replace('.', ',')}`).join('\n'));
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) fechar(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4" /> Colar várias vendas
          </DialogTitle>
          <DialogDescription>
            Uma venda por linha, do Excel ou do WhatsApp. Cada linha precisa de <strong>NR</strong> e
            {' '}<strong>valor</strong>; cliente e data (dd/mm) são opcionais. A ordem não importa.
          </DialogDescription>
        </DialogHeader>

        {vendedores.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="colar-operador" className="text-xs">Em nome de</Label>
            <Select value={operador} onValueChange={setOperador} disabled={gravando}>
              <SelectTrigger id="colar-operador" className="h-8 w-[260px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {vendedores.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <Textarea
          value={texto} onChange={e => setTexto(e.target.value)} disabled={gravando}
          rows={6} placeholder={EXEMPLO} className="font-mono text-xs"
          aria-label="Vendas coladas"
        />

        {lidas.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1.5">Linha</th>
                  <th className="px-2 py-1.5">NR</th>
                  <th className="px-2 py-1.5">Cliente</th>
                  <th className="px-2 py-1.5">Data</th>
                  <th className="px-2 py-1.5 text-right">Valor</th>
                  <th className="px-2 py-1.5">Situação</th>
                </tr>
              </thead>
              <tbody>
                {lidas.map(v => {
                  const erro = v.erro ?? falhas[v.nr] ?? null;
                  return (
                    <tr key={`${v.linha}-${v.nr}`} className={cn('border-t border-border/60', erro && 'bg-destructive/5')}>
                      <td className="px-2 py-1 tabular-nums text-muted-foreground">{v.linha}</td>
                      <td className="px-2 py-1 font-mono">{v.nr || '—'}</td>
                      <td className="max-w-[180px] truncate px-2 py-1">{v.cliente ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-1 tabular-nums">{v.data ? formatDate(v.data) : 'hoje'}</td>
                      <td className="px-2 py-1 text-right font-mono">{v.valor > 0 ? formatBRL(v.valor) : '—'}</td>
                      <td className="px-2 py-1">
                        {erro
                          ? <span className="flex items-center gap-1 text-destructive"><TriangleAlert className="h-3 w-3" />{erro}</span>
                          : <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" />ok</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {gravando && (
          <div className="space-y-1">
            <Progress value={(feitas / Math.max(boas.length, 1)) * 100} />
            <p className="text-[11px] tabular-nums text-muted-foreground">{feitas} de {boas.length}</p>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {boas.length > 0
              ? <><strong className="text-foreground">{boas.length}</strong> pronta{boas.length > 1 ? 's' : ''} · {formatBRL(total)}</>
              : 'Cole as vendas acima.'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={fechar} disabled={gravando}>Cancelar</Button>
            <Button onClick={() => void lancar()} disabled={gravando || boas.length === 0}>
              {gravando ? 'Lançando…' : `Lançar ${boas.length || ''} venda${boas.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
