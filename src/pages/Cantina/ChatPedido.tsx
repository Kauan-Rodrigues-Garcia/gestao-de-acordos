/**
 * ChatPedido — a conversa presa a um pedido, dos dois lados.
 *
 * Não é o chat interno: a cantina não entra nele (decisão do Cleber). Cada
 * pedido tem a sua conversa, com as mudanças de status como mensagens do
 * sistema. Quem abre marca como lido.
 *
 * Não assina nada sozinho: quem a mostra já ouve o tópico do pedido e muda
 * `versao` quando chega mensagem — um canal só por tela.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { horaSP, type MensagemCantina } from '@/lib/cantina';
import {
  enviarMensagem, marcarLido, mensagensDoPedido, type LadoCantina,
} from '@/services/cantina/cantina.service';

const RAPIDAS: Record<LadoCantina, string[]> = {
  cliente: ['Estou a caminho!', 'Pode caprichar?', 'Vou atrasar uns minutinhos.'],
  cantina: ['Seu pedido está pronto!', 'Já estamos preparando.', 'Acabou um item, posso trocar?'],
};

export function ChatPedido({
  pedidoId, lado, versao, podeEscrever = true, className,
}: {
  pedidoId: string;
  lado: LadoCantina;
  versao: number;
  podeEscrever?: boolean;
  className?: string;
}) {
  const [mensagens, setMensagens] = useState<MensagemCantina[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      setMensagens(await mensagensDoPedido(pedidoId, lado));
      void marcarLido(pedidoId, lado).catch(() => { /* ler de novo resolve */ });
    } catch (e) {
      console.error('[Cantina] conversa:', e);
      setMensagens([]);
    }
  }, [pedidoId, lado]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagens]);

  async function enviar(conteudo: string) {
    const t = conteudo.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      await enviarMensagem(pedidoId, lado, t);
      setTexto('');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={cn('flex flex-col min-h-0 rounded-2xl border bg-muted/30', className)}>
      <div className="flex-1 min-h-[160px] max-h-[340px] overflow-y-auto p-3 space-y-2">
        {mensagens === null && (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        )}
        {mensagens?.map(m => {
          if (m.lado === 'sistema') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="max-w-[90%] text-center text-[11px] text-muted-foreground bg-background/80 border rounded-full px-3 py-1">
                  {m.texto} · {horaSP(m.criado_em)}
                </span>
              </div>
            );
          }
          const meu = m.lado === lado;
          return (
            <div key={m.id} className={cn('flex', meu ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                meu ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-background border rounded-bl-md',
              )}>
                {!meu && <p className="text-[11px] font-semibold opacity-70 mb-0.5">{m.autor_nome ?? 'Cantina'}</p>}
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p className={cn('text-[10px] mt-0.5 text-right', meu ? 'opacity-70' : 'text-muted-foreground')}>{horaSP(m.criado_em)}</p>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {podeEscrever && (
        <div className="border-t p-2 space-y-2 bg-background/60 rounded-b-2xl">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {RAPIDAS[lado].map(r => (
              <button
                key={r} type="button" disabled={enviando}
                onClick={() => { void enviar(r); }}
                className="shrink-0 text-xs rounded-full border px-2.5 py-1 hover:bg-accent transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}
          >
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value.slice(0, 500))}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto); }
              }}
              rows={1}
              placeholder="Escreva uma mensagem…"
              className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit" disabled={enviando || !texto.trim()}
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Enviar"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
