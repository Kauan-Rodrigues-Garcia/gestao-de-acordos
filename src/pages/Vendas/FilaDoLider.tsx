/**
 * FilaDoLider — onde a régua acontece.
 *
 * ## Duas gavetas, e a segunda vale dinheiro
 *
 * Venda **aberta** espera a decisão de confirmar. Venda **confirmada sem
 * assinatura** espera o contrato — e essa é a que custa: «falta de assinatura
 * do contrato» é o maior motivo de cancelamento no relatório de prospecção,
 * 27 dos 44 de setembro. São vendas que já foram fechadas e caem por uma
 * pendência de papel.
 *
 * Por isso a fila não se limita ao mês em foco. Uma venda de agosto esperando
 * assinatura continua sendo trabalho de hoje, e sumir com ela na virada do mês
 * seria perdê-la exatamente onde ela vira cancelamento.
 *
 * ## Situação e assinatura vão juntas
 *
 * O botão «Confirmar e assinar» manda as duas de uma vez, porque é o par que
 * decide se a venda conta. Dois botões separados deixariam a venda existir,
 * entre um clique e outro, num estado que ninguém pediu.
 *
 * «Só confirmar» existe para o caso real de a venda estar fechada e o contrato
 * ainda não ter voltado — ela sai da fila de confirmação e entra na de
 * assinatura, sem entrar no placar.
 */
import { useState } from 'react';
import { ClipboardCheck, PenTool, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatBRL } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { classificarVenda, GAVETA_COLORS, GAVETA_LABELS } from '@/lib/vendas';
import type { Venda } from '@/services/vendas/vendas.service';
import type { SituacaoVenda } from '@/lib/vendas';

interface Props {
  vendas: Venda[];
  onConfirmar: (params: {
    id: string;
    situacao: SituacaoVenda;
    assinado: boolean;
    dataConfirmacao: string | null;
    valorRecebido: number | null;
    motivo: string | null;
  }) => Promise<{ ok: boolean; erro: string | null }>;
}

export function FilaDoLider({ vendas, onConfirmar }: Props) {
  const [recusando, setRecusando] = useState<Venda | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function decidir(
    venda: Venda,
    situacao: SituacaoVenda,
    assinado: boolean,
    mensagem: string,
  ) {
    setOcupado(venda.id);
    const r = await onConfirmar({
      id: venda.id,
      situacao,
      assinado,
      dataConfirmacao: situacao === 'confirmada'
        ? (venda.data_confirmacao?.slice(0, 10) ?? getTodayISO())
        : null,
      valorRecebido: null,
      motivo: null,
    });
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a decisão.'); return; }
    toast.success(mensagem);
  }

  const aguardandoAssinatura = vendas.filter(v => v.situacao === 'confirmada').length;

  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/[0.04]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 px-3 py-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <ClipboardCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
          Esperando você
          <Badge variant="outline" className="text-[10px]">{vendas.length}</Badge>
        </h2>
        {aguardandoAssinatura > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {aguardandoAssinatura} já confirmada{aguardandoAssinatura > 1 ? 's' : ''} sem
            contrato assinado — é o maior motivo de cancelamento.
          </p>
        )}
      </header>

      <div>
        {vendas.map(venda => {
          const gaveta = classificarVenda(venda);
          const soFaltaAssinar = venda.situacao === 'confirmada';
          const travado = ocupado === venda.id;

          return (
            <div key={venda.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-500/20 px-3 py-2 last:border-b-0">
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {venda.nr_documento}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {venda.cliente || <span className="text-muted-foreground">sem cliente</span>}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(venda.data_venda)}
              </span>
              <Badge variant="outline" className={cn('text-[10px]', GAVETA_COLORS[gaveta])}>
                {GAVETA_LABELS[gaveta]}
              </Badge>
              <span className="w-28 text-right text-[13px] font-semibold tabular-nums">
                {formatBRL(venda.valor_total)}
              </span>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" className="h-7 text-[12px]" disabled={travado}
                  onClick={() => void decidir(
                    venda, 'confirmada', true,
                    soFaltaAssinar ? 'Contrato assinado. A venda entrou na meta.'
                                   : 'Confirmada e assinada. A venda entrou na meta.',
                  )}>
                  {soFaltaAssinar
                    ? <><PenTool className="mr-1 h-3.5 w-3.5" /> Marcar assinado</>
                    : <><ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Confirmar e assinar</>}
                </Button>

                {!soFaltaAssinar && (
                  <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={travado}
                    onClick={() => void decidir(
                      venda, 'confirmada', false,
                      'Confirmada. Ainda falta o contrato assinado para entrar na meta.',
                    )}>
                    Só confirmar
                  </Button>
                )}

                <Button size="sm" variant="ghost" disabled={travado}
                  className="h-7 text-[12px] text-muted-foreground hover:text-destructive"
                  onClick={() => setRecusando(venda)}>
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Recusar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={recusando !== null} onOpenChange={o => { if (!o) setRecusando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar esta venda?</AlertDialogTitle>
            <AlertDialogDescription>
              {recusando && <>
                O NR {recusando.nr_documento} passa a <strong>cancelada</strong> e sai do placar.
                A venda continua na lista, e o registro da recusa fica guardado para
                acompanhamento — nada é apagado.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const v = recusando;
                setRecusando(null);
                if (v) void decidir(v, 'cancelada', v.contrato_assinado, 'Venda recusada.');
              }}>
              Recusar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
