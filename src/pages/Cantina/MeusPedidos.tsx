/**
 * MeusPedidos — os pedidos de hoje em destaque e o histórico, e o detalhe de
 * um pedido (linha do tempo, itens, conversa e cancelar no prazo).
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { BellRing, ChevronRight, Clock, History, MessageCircle, Receipt } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  emAndamento, formatarPreco, horaSP, limiteDeCancelamento, podeCancelar,
  type PedidoCantina,
} from '@/lib/cantina';
import { ChatPedido } from './ChatPedido';
import { LinhaDoTempo, SeloStatus } from './visual';

function dataCurta(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

/** Os pedidos de hoje, como cartões que chamam atenção. */
export function PedidosDeHoje({
  pedidos, onAbrir,
}: { pedidos: PedidoCantina[]; onAbrir: (id: string) => void }) {
  if (pedidos.length === 0) return null;
  return (
    <section aria-label="Seus pedidos de hoje" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Receipt className="w-4 h-4 text-primary" /> Seus pedidos de hoje
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {pedidos.map(p => (
          <motion.button
            key={p.id}
            type="button"
            layout
            whileTap={{ scale: 0.98 }}
            onClick={() => onAbrir(p.id)}
            className={cn(
              'snap-start shrink-0 w-[270px] text-left rounded-2xl border bg-card p-3.5 shadow-sm hover:shadow-md transition-shadow',
              p.status === 'pronto' && 'ring-2 ring-emerald-500 border-transparent bg-emerald-500/[0.06]',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Pedido</p>
                <p className="text-2xl font-black leading-none tracking-tight">#{p.numero}</p>
              </div>
              <SeloStatus status={p.status} />
            </div>
            <p className="mt-2 text-sm text-foreground line-clamp-1">
              {p.itens.map(i => `${i.quantidade}× ${i.nome}`).join(', ')}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> retirar {horaSP(p.retirada_em)}</span>
              <span className="inline-flex items-center gap-2">
                {p.nao_lidas > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-bold">
                    <MessageCircle className="w-3 h-3" />{p.nao_lidas}
                  </span>
                )}
                <strong className="text-foreground">{formatarPreco(p.total)}</strong>
              </span>
            </div>
            {p.status === 'pronto' && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <BellRing className="w-3.5 h-3.5 animate-bounce" /> Pronto! Pode retirar no balcão.
              </p>
            )}
          </motion.button>
        ))}
      </div>
    </section>
  );
}

/** Os pedidos dos últimos 30 dias que não são de hoje. */
export function Historico({
  pedidos, onAbrir,
}: { pedidos: PedidoCantina[]; onAbrir: (id: string) => void }) {
  if (pedidos.length === 0) return null;
  return (
    <section aria-label="Pedidos anteriores" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <History className="w-4 h-4 text-muted-foreground" /> Últimos pedidos
      </h2>
      <ul className="divide-y rounded-2xl border bg-card">
        {pedidos.map(p => (
          <li key={p.id}>
            <button type="button" onClick={() => onAbrir(p.id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-accent/50 transition-colors">
              <span className="w-12 text-xs text-muted-foreground tabular-nums">{dataCurta(p.dia)}</span>
              <span className="flex-1 min-w-0 text-sm truncate">
                {p.itens.map(i => `${i.quantidade}× ${i.nome}`).join(', ')}
              </span>
              <SeloStatus status={p.status} className="hidden sm:inline-flex" />
              <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatarPreco(p.total)}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** O pedido aberto: linha do tempo, itens, conversa e cancelar. */
export function DetalhePedido({
  pedido, aberto, onFechar, agoraMs, cancelamentoMin, versaoConversa, onCancelar,
}: {
  pedido: PedidoCantina | null;
  aberto: boolean;
  onFechar: () => void;
  agoraMs: number;
  cancelamentoMin: number;
  versaoConversa: number;
  onCancelar: (id: string) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const cancelavel = !!pedido && podeCancelar(pedido, agoraMs, cancelamentoMin);

  return (
    <Sheet open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {pedido && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <SheetTitle className="text-2xl font-black">Pedido #{pedido.numero}</SheetTitle>
                <SeloStatus status={pedido.status} />
              </div>
              <SheetDescription>
                {dataCurta(pedido.dia)} · retirada às <strong className="text-foreground">{horaSP(pedido.retirada_em)}</strong>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <LinhaDoTempo pedido={pedido} />

              {pedido.status === 'cancelado' && pedido.motivo_cancelamento && (
                <p className="rounded-xl bg-muted p-3 text-sm">
                  <strong>{pedido.cancelado_pela_cantina ? 'A cantina cancelou:' : 'Motivo:'}</strong> {pedido.motivo_cancelamento}
                </p>
              )}

              <ul className="divide-y rounded-xl border">
                {pedido.itens.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      <strong>{i.quantidade}×</strong> {i.nome}{i.opcao ? ` (${i.opcao})` : ''}
                      {i.observacao && <span className="block text-xs text-muted-foreground">“{i.observacao}”</span>}
                    </span>
                    <span className="tabular-nums">{formatarPreco(i.preco * i.quantidade)}</span>
                  </li>
                ))}
                <li className="flex justify-between px-3 py-2 font-bold">
                  <span>Total</span><span className="tabular-nums">{formatarPreco(pedido.total)}</span>
                </li>
              </ul>
              {pedido.observacao && (
                <p className="text-sm text-muted-foreground">Observação: “{pedido.observacao}”</p>
              )}

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <MessageCircle className="w-4 h-4 text-primary" /> Conversa com a cantina
                </h3>
                <ChatPedido
                  pedidoId={pedido.id}
                  lado="cliente"
                  versao={versaoConversa}
                  podeEscrever={emAndamento(pedido.status)}
                />
              </div>

              {emAndamento(pedido.status) && (
                cancelavel ? (
                  <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => setConfirmando(true)}>
                    Cancelar pedido (até {limiteDeCancelamento(pedido.retirada_em, cancelamentoMin)})
                  </Button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    O prazo para cancelar terminou {cancelamentoMin} minutos antes da retirada.
                  </p>
                )
              )}
            </div>

            <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar o pedido #{pedido.numero}?</AlertDialogTitle>
                  <AlertDialogDescription>A cantina é avisada na hora. Não dá para desfazer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Manter pedido</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => { void onCancelar(pedido.id); }}
                  >
                    Cancelar pedido
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
