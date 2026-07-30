/**
 * ChatSolicitacao — a conversa presa a UM pedido.
 *
 * Não é um mensageiro: quem participa sai do próprio pedido (solicitante +
 * responsável/líder). Por isso não há lista de contatos, busca de usuário nem
 * bloqueio — a thread nasce e morre com a solicitação.
 *
 * Traz confirmação de leitura (✓✓), animação de "digitando" e o cabeçalho com
 * primeiro nome + foto de quem está do outro lado.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Check, CheckCheck, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { MensagemSolicitacao, PessoaResumo } from '@/services/solicitacoesWhatsapp.service';
import { primeiroNome, iniciais } from './formatacao';

function horaCurta(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function diaLegivel(iso: string): string {
  try {
    const d = new Date(iso);
    const hoje = new Date();
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (mesmoDia(d, hoje))  return 'Hoje';
    if (mesmoDia(d, ontem)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch { return ''; }
}

/** Três pontinhos pulando — o "digitando" do WhatsApp. */
function PontinhosDigitando() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

export function ChatSolicitacao({
  mensagens, loading, enviando, digitando, usuarioId, interlocutor,
  onEnviar, onDigitando, onFechar,
}: {
  mensagens:    MensagemSolicitacao[];
  loading:      boolean;
  enviando:     boolean;
  digitando:    string | null;
  usuarioId:    string | null;
  /** Quem está do outro lado (solicitante ou responsável, conforme quem olha). */
  interlocutor: PessoaResumo | null;
  onEnviar:     (texto: string) => Promise<boolean>;
  onDigitando:  () => void;
  onFechar:     () => void;
}) {
  const [texto, setTexto] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);

  // Rola para a última mensagem quando chega algo novo ou quando o outro digita.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens.length, digitando]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    // Limpa otimista: digitar a próxima não espera a ida ao banco. Se falhar,
    // devolvemos o texto para a caixa em vez de perdê-lo.
    setTexto('');
    const ok = await onEnviar(conteudo);
    if (!ok) setTexto(conteudo);
  }

  return (
    <div className="flex flex-col h-[420px] rounded-xl border border-border bg-card overflow-hidden">
      {/* Cabeçalho: foto + primeiro nome do interlocutor */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-muted/40 shrink-0">
        <Avatar className="w-8 h-8">
          {interlocutor?.foto_url && (
            <AvatarImage src={interlocutor.foto_url} alt={interlocutor.nome} className="object-cover" />
          )}
          <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-bold">
            {iniciais(interlocutor?.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            {interlocutor ? primeiroNome(interlocutor.nome) : 'Conversa'}
          </p>
          <p className="text-[11px] text-muted-foreground h-3.5">
            <AnimatePresence mode="wait">
              {digitando ? (
                <motion.span
                  key="digitando"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5 text-primary"
                >
                  digitando <PontinhosDigitando />
                </motion.span>
              ) : (
                <motion.span key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Conversa desta solicitação
                </motion.span>
              )}
            </AnimatePresence>
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onFechar} title="Fechar conversa">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Mensagens */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3 space-y-2">
          {loading && (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}

          {!loading && mensagens.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <MessageSquare className="w-7 h-7 opacity-40" />
              <p className="text-xs max-w-[220px]">
                Nenhuma mensagem ainda. Use aqui para pedir ou passar informação
                sobre este atendimento.
              </p>
            </div>
          )}

          {mensagens.map((m, i) => {
            const minha    = m.autor_id === usuarioId;
            const anterior = mensagens[i - 1];
            const novoDia  = !anterior || diaLegivel(anterior.criado_em) !== diaLegivel(m.criado_em);

            return (
              <div key={m.id}>
                {novoDia && (
                  <div className="flex justify-center my-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                      {diaLegivel(m.criado_em)}
                    </span>
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={cn('flex gap-2', minha ? 'justify-end' : 'justify-start')}
                >
                  {!minha && (
                    <Avatar className="w-6 h-6 mt-auto shrink-0">
                      {m.autor?.foto_url && (
                        <AvatarImage src={m.autor.foto_url} alt={m.autor.nome} className="object-cover" />
                      )}
                      <AvatarFallback className="bg-muted text-[9px] font-bold">
                        {iniciais(m.autor?.nome)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn(
                    'max-w-[75%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm',
                    minha
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  )}>
                    {!minha && (
                      <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                        {primeiroNome(m.autor?.nome)}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                    <div className={cn(
                      'flex items-center gap-1 mt-1 text-[10px]',
                      minha ? 'justify-end opacity-80' : 'opacity-60',
                    )}>
                      <span className="tabular-nums">{horaCurta(m.criado_em)}</span>
                      {/* Recibo só nas minhas: ✓ enviado, ✓✓ lido pelo outro. */}
                      {minha && (
                        m.lida_em
                          ? <CheckCheck className="w-3 h-3" aria-label="Lida" />
                          : <Check className="w-3 h-3" aria-label="Enviada" />
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}

          <div ref={fimRef} />
        </div>
      </ScrollArea>

      {/* Caixa de envio */}
      <div className="flex items-end gap-2 p-2.5 border-t border-border bg-muted/20 shrink-0">
        <Textarea
          value={texto}
          onChange={e => { setTexto(e.target.value); onDigitando(); }}
          onKeyDown={e => {
            // Enter envia, Shift+Enter quebra linha — igual ao WhatsApp.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
          }}
          placeholder="Escreva uma mensagem…"
          rows={1}
          className="min-h-[38px] max-h-28 resize-none text-[13px] bg-card"
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => void enviar()}
          disabled={!texto.trim() || enviando}
          title="Enviar (Enter)"
        >
          {enviando
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
