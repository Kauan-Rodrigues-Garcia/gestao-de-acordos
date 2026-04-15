/**
 * src/components/ModalFilaWhatsApp.tsx
 * Modal de fila de envio de lembretes via WhatsApp.
 * Suporta envio individual, automático e registro de log.
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Copy, X, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { isPaguePlay } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const WHATSAPP_SEND_DELAY_MS = 1500;

export interface ItemFila {
  id: string;
  nome_cliente: string;
  nr_cliente: string;
  whatsapp: string;
  valor: number;
  vencimento: string;
  mensagem: string;
  link: string;
  enviado: boolean;
}

interface ModalFilaWhatsAppProps {
  fila: ItemFila[];
  usuarioId?: string;
  empresaId?: string;
  modo?: 'individual' | 'lote';
  onClose: () => void;
}

export function ModalFilaWhatsApp({
  fila,
  usuarioId,
  empresaId,
  modo = 'lote',
  onClose,
}: ModalFilaWhatsAppProps) {
  const { tenantSlug } = useEmpresa();
  const isPP = isPaguePlay(tenantSlug);
  const nrLabel = isPP ? 'CPF' : 'NR';
  const [filaLocal, setFilaLocal] = useState<ItemFila[]>(fila);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [enviandoAuto, setEnviandoAuto] = useState(false);
  const cancelarAutoRef = useRef(false);

  const total     = filaLocal.length;
  const enviados  = filaLocal.filter(i => i.enviado).length;
  const restantes = total - enviados;

  async function registrarLog(item: ItemFila) {
    if (!usuarioId) return;
    supabase.from('logs_sistema').insert({
      usuario_id: usuarioId,
      acao: 'envio_lembrete_whatsapp',
      tabela: 'acordos',
      registro_id: item.id,
      empresa_id: empresaId ?? null,
      detalhes: {
        acordo_id:    item.id,
        nome_cliente: item.nome_cliente,
        nr_cliente:   item.nr_cliente,
        modo,
      },
    }).then(({ error }) => {
      if (error) console.warn('[ModalFilaWhatsApp] log error:', error.message);
    });
  }

  function marcarEnviado(id: string) {
    setFilaLocal(prev => prev.map(i => i.id === id ? { ...i, enviado: true } : i));
  }

  function abrirProximo() {
    const pendentes = filaLocal.filter(i => !i.enviado);
    if (pendentes.length === 0) { toast.success('Todos os lembretes foram enviados!'); onClose(); return; }
    const item = pendentes[0];
    window.open(item.link, '_blank');
    marcarEnviado(item.id);
    registrarLog(item);
  }

  async function enviarTodosAuto() {
    setEnviandoAuto(true);
    cancelarAutoRef.current = false;
    const pendentes = filaLocal.filter(i => !i.enviado);
    for (let i = 0; i < pendentes.length; i++) {
      if (cancelarAutoRef.current) break;
      const item = pendentes[i];
      const opened = window.open(item.link, '_blank');
      if (!opened) {
        toast.warning('Popup bloqueado! Permita popups para este site.');
      }
      marcarEnviado(item.id);
      registrarLog(item);
      if (i < pendentes.length - 1) {
        await new Promise(r => setTimeout(r, WHATSAPP_SEND_DELAY_MS));
      }
    }
    const foiCancelado = cancelarAutoRef.current;
    setEnviandoAuto(false);
    cancelarAutoRef.current = false;
    if (!foiCancelado) {
      toast.success('Envio automático concluído!');
    }
  }

  function marcarEnviadoManual(id: string) {
    const item = filaLocal.find(i => i.id === id);
    setFilaLocal(prev => prev.map(i => i.id === id ? { ...i, enviado: true } : i));
    if (item) registrarLog(item);
  }

  function copiarMensagem(msg: string) {
    navigator.clipboard.writeText(msg).then(() => toast.success('Mensagem copiada!'));
  }

  function copiarTodasMensagens() {
    const texto = filaLocal
      .map((i, idx) => `[${idx + 1}/${total}] ${i.nome_cliente} (${nrLabel} ${i.nr_cliente})\n${i.mensagem}`)
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(texto).then(() => toast.success(`${total} mensagens copiadas!`));
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4 text-success" />
            Fila de Lembretes WhatsApp
          </DialogTitle>
        </DialogHeader>

        {/* Progresso */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{enviados} enviado(s)</span>
              <span className="font-medium text-foreground">{total} total</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-300 rounded-full"
                style={{ width: total > 0 ? `${(enviados / total) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <span className="text-sm font-bold text-success tabular-nums">{enviados}/{total}</span>
        </div>

        {/* Botões de ação */}
        <div className="flex gap-2">
          {restantes > 0 ? (
            enviandoAuto ? (
              <Button
                onClick={() => { cancelarAutoRef.current = true; }}
                className="flex-1 gap-2"
                variant="outline"
              >
                <X className="w-4 h-4 text-destructive" />
                Cancelar envio automático
              </Button>
            ) : (
              <>
                <Button onClick={abrirProximo} className="flex-1 gap-2 bg-success hover:bg-success/90 text-white">
                  <Send className="w-4 h-4" />
                  Abrir próximo
                  <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">{restantes}</Badge>
                </Button>
                {isPP ? (
                  <Button onClick={enviarTodosAuto} variant="outline" size="sm" className="gap-1.5 text-xs px-3 border-success/40 text-success hover:bg-success/10" title="Enviar todos automaticamente">
                    <Send className="w-3.5 h-3.5" />
                    Enviar todos
                  </Button>
                ) : null}
              </>
            )
          ) : (
            <Button onClick={onClose} className="flex-1 gap-2" variant="outline">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Todos enviados! Fechar
            </Button>
          )}
          <Button variant="outline" size="icon" className="w-9 h-9 flex-shrink-0 border-border" onClick={copiarTodasMensagens} title="Copiar todas as mensagens">
            <Copy className="w-4 h-4" />
          </Button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filaLocal.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                'border rounded-lg transition-colors',
                item.enviado
                  ? 'border-success/30 bg-success/5 opacity-70'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-center gap-3 p-3">
                {/* Número na fila */}
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  item.enviado ? 'bg-success text-white' : 'bg-muted text-muted-foreground',
                )}>
                  {item.enviado ? '✓' : idx + 1}
                </div>

                {/* Info do cliente */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-primary">{nrLabel} {item.nr_cliente}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-medium text-foreground truncate">{item.nome_cliente}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatCurrency(item.valor)} · Vence {formatDate(item.vencimento)}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1.5 flex-shrink-0 pl-2 border-l border-border/50">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 rounded-md"
                    onClick={() => copiarMensagem(item.mensagem)}
                    title="Copiar mensagem"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 rounded-md text-success hover:bg-success/10"
                    onClick={() => { window.open(item.link, '_blank'); marcarEnviadoManual(item.id); }}
                    title="Abrir no WhatsApp"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 rounded-md"
                    onClick={() => setExpandido(expandido === item.id ? null : item.id)}
                  >
                    {expandido === item.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Mensagem expandida */}
              <AnimatePresence>
                {expandido === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-0">
                      <div className="p-2.5 bg-muted/40 rounded text-xs text-muted-foreground leading-relaxed border border-border/50">
                        {item.mensagem}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
