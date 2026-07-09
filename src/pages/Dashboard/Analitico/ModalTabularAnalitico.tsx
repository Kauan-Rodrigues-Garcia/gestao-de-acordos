/**
 * ModalTabularAnalitico — perguntas que o relatório analítico não responde
 * (PaguePlay). Boleto/Pix informa só o valor DA PARCELA; aqui o operador diz
 * quantas parcelas o acordo tem, qual é esta, e se a 1ª usa a regra dos 40%.
 * O estado só é perguntado quando o código não tem profissional com UF no banco.
 * Cartão: abre apenas para perguntar o estado (valor já é o total).
 */
import { useEffect, useState } from 'react';
import { HelpCircle, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ESTADOS_BRASIL } from '@/lib/index';
import { calcularTotalAnalitico, calcularParcelas, formatBRL } from '@/lib/money';
import { toast } from 'sonner';

export interface DadosTabulacaoAnalitico {
  instituicao:    string;
  nomeCliente:    string;
  forma:          'boleto_pix' | 'cartao';
  valor:          number;
  dataPagamento?: string;
}

export interface RespostaTabulacaoAnalitico {
  totalParcelas: number;
  parcelaAtual:  number;
  quarentaPct:   boolean;
  /** UF respondida ('' quando já era conhecida no banco) */
  estado:        string;
  valorTotal:    number;
}

const NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

export function ModalTabularAnalitico({
  aberto, dados, estadoConhecido, onConfirm, onClose,
}: {
  aberto:          boolean;
  dados:           DadosTabulacaoAnalitico | null;
  estadoConhecido: string | null;
  onConfirm:       (r: RespostaTabulacaoAnalitico) => void;
  onClose:         () => void;
}) {
  const [totalStr,    setTotalStr]    = useState('1');
  const [atualStr,    setAtualStr]    = useState('1');
  const [quarentaPct, setQuarentaPct] = useState(false);
  const [estado,      setEstado]      = useState('');

  useEffect(() => {
    if (!aberto) return;
    setTotalStr('1'); setAtualStr('1'); setQuarentaPct(false); setEstado('');
  }, [aberto]);

  if (!dados) return null;

  const isCartao = dados.forma === 'cartao';
  const total    = Math.max(1, parseInt(totalStr) || 1);
  const atual    = Math.min(Math.max(1, parseInt(atualStr) || 1), total);
  const q40      = quarentaPct && total > 2;
  const valorTotal = isCartao
    ? dados.valor
    : calcularTotalAnalitico(dados.valor, total, atual, q40);
  const parcelasCalc = !isCartao && total > 1
    ? calcularParcelas(valorTotal, total, q40)
    : null;
  const perguntaEstado = !estadoConhecido;

  function confirmar() {
    if (perguntaEstado && !estado) { toast.error('Selecione o estado do cliente'); return; }
    onConfirm({ totalParcelas: total, parcelaAtual: atual, quarentaPct: q40, estado, valorTotal });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby="modal-tabular-analitico-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary text-sm">
            <HelpCircle className="w-4 h-4" />
            Completar dados do acordo
          </DialogTitle>
          <DialogDescription id="modal-tabular-analitico-desc" className="text-xs">
            Código <strong>{dados.instituicao}</strong> · recebido {formatBRL(dados.valor)}
            {isCartao
              ? ' no cartão. Só falta o estado do cliente.'
              : ' em boleto/Pix. O relatório não informa o parcelamento — complete abaixo.'}
          </DialogDescription>
        </DialogHeader>

        {!isCartao && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Acordo feito em quantas parcelas?</Label>
                <Select value={totalStr} onValueChange={(v) => { setTotalStr(v); if (parseInt(v) <= 2) setQuarentaPct(false); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NUMS.map(n => <SelectItem key={n} value={String(n)}>{n === 1 ? '1 (à vista)' : `${n}x`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {total > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Quantas parcelas pagas?</Label>
                  <Select value={String(atual)} onValueChange={setAtualStr}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NUMS.slice(0, total).map(n => <SelectItem key={n} value={String(n)}>{n}ª</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {total > 1 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Conte <strong>incluindo esta que você está tabulando agora</strong>: se este pagamento do analítico é a 4ª parcela, responda 4.</span>
              </div>
            )}

            {total > 2 && (
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none w-fit">
                <input type="checkbox" checked={quarentaPct} onChange={e => setQuarentaPct(e.target.checked)} className="accent-primary" />
                Primeira parcela com 40% do total
              </label>
            )}

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1.5">
              <p>Valor total calculado: <strong className="font-mono">{formatBRL(valorTotal)}</strong></p>
              {parcelasCalc && (
                <div className="flex flex-wrap gap-1.5">
                  {parcelasCalc.map((v, i) => (
                    <span key={i} className={`text-[11px] rounded px-1.5 py-0.5 font-mono ${i + 1 === atual ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted'}`}>
                      {i + 1}ª {formatBRL(v)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground">Confira se o total bate com a negociação antes de confirmar.</p>
            </div>
          </div>
        )}

        {perguntaEstado && (
          <div className="space-y-1">
            <Label className="text-xs">Estado do cliente *</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar Estado" /></SelectTrigger>
              <SelectContent>
                {([...ESTADOS_BRASIL] as string[]).map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Este código ainda não tem estado no sistema — a resposta fica salva para as próximas tabulações.</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={confirmar}>Confirmar e tabular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
