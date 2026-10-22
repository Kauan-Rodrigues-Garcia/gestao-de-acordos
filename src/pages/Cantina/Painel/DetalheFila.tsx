/**
 * DetalheFila — o pedido aberto no painel: itens, conversa com quem pediu,
 * todas as passagens de status (inclusive voltar, para o clique errado) e
 * cancelar com motivo.
 */
import { useState } from 'react';
import { Loader2, MessageCircle, Undo2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  emAndamento, formatarPreco, horaSP, STATUS_ROTULO,
  type PedidoCantina, type StatusPedido,
} from '@/lib/cantina';
import { ChatPedido } from '../ChatPedido';
import { LinhaDoTempo, SeloStatus } from '../visual';

/** As mesmas passagens que `fn_cantina_mudar_status` aceita. */
const PASSAGENS: Record<StatusPedido, StatusPedido[]> = {
  novo:         ['preparando', 'pronto'],
  preparando:   ['pronto', 'novo'],
  pronto:       ['retirado', 'nao_retirado', 'preparando'],
  retirado:     ['pronto'],
  nao_retirado: ['retirado', 'pronto'],
  cancelado:    [],
};

const VOLTA = new Set(['novo:preparando', 'preparando:pronto', 'pronto:retirado', 'pronto:nao_retirado', 'retirado:nao_retirado']);
const ehVolta = (de: StatusPedido, para: StatusPedido) => VOLTA.has(`${para}:${de}`);

const MOTIVOS = ['Acabou um ingrediente', 'Item indisponível hoje', 'Pedido duplicado', 'A pessoa pediu para cancelar'];

export function DetalheFila({
  pedido, onFechar, agoraMs, versaoConversa, mudando, onTrocar, onCancelar,
}: {
  pedido: PedidoCantina | null;
  onFechar: () => void;
  agoraMs: number;
  versaoConversa: number;
  mudando: boolean;
  onTrocar: (id: string, status: StatusPedido) => void;
  onCancelar: (id: string, motivo: string) => Promise<boolean>;
}) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const fechar = () => { setCancelando(false); setMotivo(''); onFechar(); };

  return (
    <Sheet open={!!pedido} onOpenChange={o => { if (!o) fechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {pedido && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <SheetTitle className="text-3xl font-black">#{pedido.numero}</SheetTitle>
                <SeloStatus status={pedido.status} />
              </div>
              <SheetDescription className="text-base">
                <strong className="text-foreground">{pedido.nome}</strong>
                {pedido.setor_nome || pedido.empresa_nome ? ` · ${[pedido.setor_nome, pedido.empresa_nome].filter(Boolean).join(' · ')}` : ''}
                <br />
                Retirada às <strong className="text-foreground">{horaSP(pedido.retirada_em)}</strong> · pedido feito às {horaSP(pedido.criado_em)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <LinhaDoTempo pedido={pedido} />

              <ul className="divide-y rounded-xl border">
                {pedido.itens.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3 px-3 py-2">
                    <span className="text-base">
                      <strong>{i.quantidade}×</strong> {i.nome}{i.opcao ? ` (${i.opcao})` : ''}
                      {i.observacao && <span className="block text-sm text-orange-700 dark:text-orange-300">↳ {i.observacao}</span>}
                    </span>
                    <span className="tabular-nums text-sm">{formatarPreco(i.preco * i.quantidade)}</span>
                  </li>
                ))}
                <li className="flex justify-between px-3 py-2 font-bold">
                  <span>Total</span><span className="tabular-nums">{formatarPreco(pedido.total)}</span>
                </li>
              </ul>
              {pedido.observacao && <p className="rounded-xl bg-muted p-3 text-sm">“{pedido.observacao}”</p>}
              {pedido.status === 'cancelado' && pedido.motivo_cancelamento && (
                <p className="rounded-xl bg-muted p-3 text-sm">
                  <strong>{pedido.cancelado_pela_cantina ? 'Cancelado pela cantina:' : 'Cancelado por quem pediu.'}</strong>{' '}
                  {pedido.cancelado_pela_cantina ? pedido.motivo_cancelamento : ''}
                </p>
              )}

              {PASSAGENS[pedido.status].length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {PASSAGENS[pedido.status].map(para => {
                    const volta = ehVolta(pedido.status, para);
                    const cedo = para === 'nao_retirado' && agoraMs < Date.parse(pedido.retirada_em);
                    return (
                      <Button
                        key={para}
                        variant={volta ? 'outline' : 'default'}
                        disabled={mudando || cedo}
                        title={cedo ? 'Só depois do horário de retirada' : undefined}
                        onClick={() => onTrocar(pedido.id, para)}
                        className={cn('h-11', !volta && para === 'nao_retirado' && 'bg-rose-600 hover:bg-rose-700 text-white')}
                      >
                        {mudando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : volta && <Undo2 className="w-4 h-4 mr-2" />}
                        {volta ? `Voltar para ${STATUS_ROTULO[para].toLowerCase()}` : STATUS_ROTULO[para]}
                      </Button>
                    );
                  })}
                </div>
              )}

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <MessageCircle className="w-4 h-4 text-primary" /> Conversa com {pedido.nome.split(' ')[0]}
                </h3>
                <ChatPedido pedidoId={pedido.id} lado="cantina" versao={versaoConversa} />
              </div>

              {emAndamento(pedido.status) && (
                cancelando ? (
                  <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
                    <p className="text-sm font-semibold">Por que cancelar? Quem pediu recebe o motivo.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MOTIVOS.map(m => (
                        <button key={m} type="button" onClick={() => setMotivo(m)}
                          className={cn('rounded-full border px-2.5 py-1 text-xs', motivo === m ? 'bg-foreground text-background' : 'hover:bg-accent')}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 300))} rows={2}
                      placeholder="Escreva o motivo"
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => { setCancelando(false); setMotivo(''); }}>Voltar</Button>
                      <Button
                        variant="destructive" className="flex-1" disabled={!motivo.trim() || enviando}
                        onClick={async () => {
                          setEnviando(true);
                          const ok = await onCancelar(pedido.id, motivo.trim());
                          setEnviando(false);
                          if (ok) { setCancelando(false); setMotivo(''); }
                        }}
                      >
                        {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Cancelar pedido
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCancelando(true)}
                    className="w-full text-center text-sm text-destructive hover:underline">
                    Cancelar este pedido
                  </button>
                )
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
