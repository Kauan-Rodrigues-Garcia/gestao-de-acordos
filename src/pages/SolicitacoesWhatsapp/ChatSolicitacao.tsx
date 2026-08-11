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
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Check, CheckCheck, MessageSquare, Loader2, Lock, Eye, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useOnlineUsers } from '@/providers/PresenceProvider';
import type { MensagemSolicitacao, PessoaResumo } from '@/services/solicitacoesWhatsapp.service';
import { primeiroNome, iniciais } from './formatacao';
import { estaNoFim, viewportDaArea, rolarAoFim, deveRolar } from './scroll-conversa';
import { foiLidaPorOutro, type Leitura } from './leitura';
import {
  estadoCpfDaMensagem, avisoAoDigitar, type EstadoCpfMensagem,
} from '@/lib/cpfChat';
import { SeletorEmoji } from './SeletorEmoji';
import { inserirEmoji } from './emojis';

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
  mensagens, leituras, loading, enviando, digitando, usuarioId, interlocutor, encerrado, podeFalar,
  onEnviar, onDigitando, onFechar,
}: {
  mensagens:    MensagemSolicitacao[];
  /**
   * Até onde cada participante leu esta conversa. É o que sustenta o ✓✓ — antes
   * ele saía de um carimbo único por mensagem, que dizia só "alguém leu".
   */
  leituras:     Leitura[];
  loading:      boolean;
  enviando:     boolean;
  digitando:    string | null;
  usuarioId:    string | null;
  /** Quem está do outro lado (solicitante ou responsável, conforme quem olha). */
  interlocutor: PessoaResumo | null;
  /**
   * Conversa encerrada (24 h depois de o chamado fechar): não aceita mensagem
   * nova, mas o histórico continua aqui — é anexo permanente do atendimento.
   */
  encerrado:    boolean;
  /**
   * Só os DOIS envolvidos escrevem (quem abriu e quem atende agora). Líder e
   * demais responsáveis leem sem caixa de texto — espelha `fn_wpp_pode_falar`.
   */
  podeFalar:    boolean;
  onEnviar:     (texto: string) => Promise<boolean>;
  onDigitando:  () => void;
  onFechar:     () => void;
}) {
  const online = useOnlineUsers().onlineIds;
  const [texto, setTexto] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  /** O leitor está no fim? Ref, não state: muda a cada pixel de rolagem. */
  const grudadoRef = useRef(true);
  /** A conversa ainda não foi posicionada nesta abertura. */
  const primeiraCargaRef = useRef(true);
  /**
   * Id da última mensagem já processada.
   *
   * O hook relê a thread inteira a cada evento de realtime — inclusive nos
   * UPDATEs de "lida", que não trazem mensagem nenhuma. Sem esta comparação, um
   * simples ✓✓ do outro lado remontaria a lista e reposicionaria a rolagem.
   */
  const ultimaVistaRef = useRef<string | null>(null);

  // Acompanha a rolagem manual para saber se o leitor subiu para ver o
  // histórico. Quem subiu não é arrastado de volta por mensagem dos outros.
  useEffect(() => {
    const viewport = viewportDaArea(areaRef.current);
    if (!viewport) return;
    const aoRolar = () => { grudadoRef.current = estaNoFim(viewport); };
    viewport.addEventListener('scroll', aoRolar, { passive: true });
    return () => viewport.removeEventListener('scroll', aoRolar);
  }, []);

  // Posiciona a conversa quando a lista muda.
  //
  // `digitando` NÃO entra aqui de propósito: os pontinhos ficam no cabeçalho,
  // fora da área rolável, e o sinal pisca várias vezes por rajada de digitação
  // — reagir a ele fazia a tela se mexer sozinha sem nada ter chegado.
  useEffect(() => {
    if (loading) return;
    const viewport = viewportDaArea(areaRef.current);
    if (!viewport) return;

    const primeiraCarga = primeiraCargaRef.current;
    const ultima = mensagens[mensagens.length - 1];
    const idUltima = ultima?.id ?? null;

    // Nada novo chegou: releitura da mesma thread não move a rolagem.
    if (!primeiraCarga && idUltima === ultimaVistaRef.current) return;
    ultimaVistaRef.current = idUltima;

    if (!deveRolar({
      primeiraCarga,
      ultimaEhMinha: !!ultima && ultima.autor_id === usuarioId,
      grudadoNoFim:  grudadoRef.current,
    })) return;

    primeiraCargaRef.current = false;
    grudadoRef.current = true;
    // Abrir a conversa já no fim é posição inicial, não movimento: animar isso
    // seria a tela deslizando sozinha assim que o card abre.
    rolarAoFim(viewport, primeiraCarga ? 'auto' : 'smooth');
  }, [mensagens, loading, usuarioId]);

  // Estado de CPF de cada mensagem, calculado uma vez por lista. `tem_cpf` vem
  // do banco (trigger da migration 20260803d); a detecção local cobre o
  // intervalo entre enviar e o servidor responder.
  const cpf = useMemo(() => {
    const agora = new Date();
    const mapa: Record<string, EstadoCpfMensagem> = {};
    for (const m of mensagens) mapa[m.id] = estadoCpfDaMensagem(m, agora);
    return mapa;
  }, [mensagens]);

  // Aviso enquanto digita — a chance mais barata de o CPF nem chegar ao banco.
  const avisoDigitando = useMemo(() => avisoAoDigitar(texto), [texto]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    // Limpa otimista: digitar a próxima não espera a ida ao banco. Se falhar,
    // devolvemos o texto para a caixa em vez de perdê-lo.
    setTexto('');
    const ok = await onEnviar(conteudo);
    if (!ok) setTexto(conteudo);
  }

  /**
   * Emoji escolhido no menu entra na POSIÇÃO DO CURSOR, não no fim.
   *
   * O foco volta para o campo e o cursor é reposicionado logo depois do emoji —
   * sem isso, continuar digitando escreveria no começo do texto (o campo perdeu
   * o foco ao abrir o popover) e o menu ainda aberto ficaria sem destino.
   *
   * O `requestAnimationFrame` espera o React reescrever o `value`: mexer em
   * `selectionStart` antes disso seria apagado pelo render seguinte.
   */
  function aoEscolherEmoji(emoji: string) {
    const campo = campoRef.current;
    const { texto: novo, cursor } = inserirEmoji(
      texto, emoji, campo?.selectionStart ?? null, campo?.selectionEnd ?? null,
    );
    setTexto(novo);
    onDigitando();
    requestAnimationFrame(() => {
      const el = campoRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="flex flex-col h-[420px] rounded-xl border border-border bg-card overflow-hidden">
      {/* Cabeçalho: foto + primeiro nome do interlocutor */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-muted/40 shrink-0">
        {/* Bolinha de presença: verde = online agora, cinza = offline.
            Vem do PresenceProvider, o mesmo canal que o resto do sistema usa. */}
        <span className="relative shrink-0">
          <Avatar className="w-8 h-8">
            {interlocutor?.foto_url && (
              <AvatarImage src={interlocutor.foto_url} alt={interlocutor.nome} className="object-cover" />
            )}
            <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-bold">
              {iniciais(interlocutor?.nome)}
            </AvatarFallback>
          </Avatar>
          {interlocutor && (
            <span
              title={online.has(interlocutor.id) ? 'Online agora' : 'Offline'}
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                online.has(interlocutor.id) ? 'bg-emerald-500' : 'bg-muted-foreground/50',
              )}
            />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            {interlocutor ? primeiroNome(interlocutor.nome) : 'Conversa'}
          </p>
          <p className="text-[11px] text-muted-foreground h-3.5">
            <AnimatePresence mode="wait">
              {encerrado ? (
                <motion.span key="encerrado" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Conversa encerrada · histórico mantido
                </motion.span>
              ) : digitando ? (
                <motion.span
                  key="digitando"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5 text-primary"
                >
                  digitando <PontinhosDigitando />
                </motion.span>
              ) : (
                <motion.span key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {interlocutor
                    ? (online.has(interlocutor.id) ? 'Online agora' : 'Offline')
                    : 'Conversa desta solicitação'}
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
      <ScrollArea ref={areaRef} className="flex-1 min-h-0">
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
            const estadoCpf = cpf[m.id];
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
                    // Mensagem com CPF sai da cor normal: quem passa o olho na
                    // conversa vê logo qual tem prazo para sumir.
                    estadoCpf.estado !== 'limpa'
                      && 'bg-amber-500/10 text-foreground ring-1 ring-amber-500/40',
                  )}>
                    {!minha && (
                      <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                        {primeiroNome(m.autor?.nome)}
                      </p>
                    )}
                    <p className={cn(
                      'whitespace-pre-wrap break-words',
                      estadoCpf.estado === 'expurgada' && 'italic opacity-70',
                    )}>{m.conteudo}</p>
                    {estadoCpf.estado !== 'limpa' && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-tight text-amber-700 dark:text-amber-400">
                        <ShieldAlert className="w-3 h-3 shrink-0 mt-px" />
                        <span>{estadoCpf.aviso}</span>
                      </p>
                    )}
                    <div className={cn(
                      'flex items-center gap-1 mt-1 text-[10px]',
                      minha ? 'justify-end opacity-80' : 'opacity-60',
                    )}>
                      <span className="tabular-nums">{horaCurta(m.criado_em)}</span>
                      {/* Recibo só nas minhas: ✓ enviado, ✓✓ lido pelo outro. */}
                      {minha && (
                        foiLidaPorOutro(m, leituras, usuarioId ?? '')
                          ? <CheckCheck className="w-3 h-3" aria-label="Lida" />
                          : <Check className="w-3 h-3" aria-label="Enviada" />
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Caixa de envio — some quando a conversa encerra ou quando quem olha não
          é um dos dois envolvidos; o histórico acima fica em qualquer caso. */}
      {!podeFalar && !encerrado ? (
        <div className="flex items-center gap-2 p-3 border-t border-border bg-muted/30 shrink-0 text-[11px] text-muted-foreground">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <p>
            Você está acompanhando esta conversa. Só quem abriu o pedido e quem
            está atendendo podem escrever aqui.
          </p>
        </div>
      ) : encerrado ? (
        <div className="flex items-center gap-2 p-3 border-t border-border bg-muted/30 shrink-0 text-[11px] text-muted-foreground">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <p>
            Conversa encerrada 24 h após o chamado ser finalizado. O histórico
            acima fica anexado ao atendimento.
          </p>
        </div>
      ) : (
        <div className="border-t border-border bg-muted/20 shrink-0">
          {/* Aviso antes de enviar. Não bloqueia: bloquear empurraria o CPF
              para fora do sistema, onde não há prazo nenhum. */}
          {avisoDigitando && (
            <p className="flex items-start gap-1.5 px-3 pt-2 text-[11px] leading-tight text-amber-700 dark:text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{avisoDigitando}</span>
            </p>
          )}
        <div className="flex items-end gap-1.5 p-2.5">
          <SeletorEmoji onEscolher={aoEscolherEmoji} disabled={enviando} />
          <Textarea
            ref={campoRef}
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
      )}
    </div>
  );
}
