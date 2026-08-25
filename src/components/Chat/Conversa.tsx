/**
 * Conversa.tsx — a thread aberta: balões, escrita, anexo e emoji.
 *
 * ## O arrastar e o botão são o mesmo caminho
 *
 * Arrastar arquivo para dentro, colar da área de transferência e escolher pelo
 * clipe caem todos em `receberArquivos`. Três portas, uma sala — senão o
 * arrastar aceitaria um arquivo de 40 MB que o botão recusa.
 *
 * ## A rolagem só desce quando devia
 *
 * Descer a cada mensagem arranca a pessoa de onde ela estava lendo. Aqui só
 * desce se ela JÁ estava no fim (ou se foi ela quem escreveu) — quem subiu
 * para reler continua onde parou, e um aviso discreto diz que chegou coisa
 * nova.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Paperclip, Send, Smile, X, ArrowDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  subirAnexo, LIMITE_ANEXO,
  type MensagemChat, type ConversaChat, type AnexoChat,
} from '@/services/chat/chat.service';
import {
  AvatarChat, AnexoNoBalao, EMOJIS,
  horaDoBalao, rotuloDoDia, diaDaMensagem, tamanhoLegivel,
} from './comum';

interface Props {
  conversa:   ConversaChat;
  mensagens:  MensagemChat[];
  online:     boolean;
  digitando:  boolean;
  expandido:  boolean;
  onVoltar?:  () => void;
  onEnviar:   (texto: string, anexos: AnexoChat[]) => Promise<string | null>;
  onDigitando: () => void;
}

export function Conversa({
  conversa, mensagens, online, digitando, expandido, onVoltar, onEnviar, onDigitando,
}: Props) {
  const { perfil } = useAuth();
  const meuId = perfil?.id ?? '';

  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [temNovas, setTemNovas] = useState(false);

  const rolagem = useRef<HTMLDivElement>(null);
  const campo   = useRef<HTMLTextAreaElement>(null);
  const noFim   = useRef(true);

  // ── Rolagem ────────────────────────────────────────────────────────────────
  const descer = useCallback((suave = true) => {
    const el = rolagem.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
    setTemNovas(false);
  }, []);

  const aoRolar = useCallback(() => {
    const el = rolagem.current;
    if (!el) return;
    // 40 px de folga: ninguém para exatamente no pixel do fim, e exigir isso
    // faria a rolagem automática parar de funcionar sem motivo aparente.
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (noFim.current) setTemNovas(false);
  }, []);

  useLayoutEffect(() => {
    const ultima = mensagens[mensagens.length - 1];
    if (!ultima) return;
    if (noFim.current || ultima.autor_id === meuId) descer(mensagens.length > 1);
    else setTemNovas(true);
  }, [mensagens, meuId, descer]);

  useEffect(() => { descer(false); campo.current?.focus(); }, [conversa.id, descer]);

  // ── Arquivos ───────────────────────────────────────────────────────────────
  const receberArquivos = useCallback((arquivos: File[]) => {
    const grandes = arquivos.filter(a => a.size > LIMITE_ANEXO);
    const bons    = arquivos.filter(a => a.size <= LIMITE_ANEXO);
    if (grandes.length) {
      setErro(grandes.length === 1
        ? `«${grandes[0].name}» tem ${tamanhoLegivel(grandes[0].size)} e o limite é 10 MB.`
        : `${grandes.length} arquivos passam de 10 MB e ficaram de fora.`);
    }
    if (bons.length) setPendentes(atual => [...atual, ...bons]);
  }, []);

  const aoColar = useCallback((e: React.ClipboardEvent) => {
    const arquivos = [...e.clipboardData.files];
    if (arquivos.length) { e.preventDefault(); receberArquivos(arquivos); }
  }, [receberArquivos]);

  // ── Envio ──────────────────────────────────────────────────────────────────
  const enviar = useCallback(async () => {
    if (subindo) return;
    const corpo = texto.trim();
    if (!corpo && !pendentes.length) return;

    setSubindo(true);
    setErro(null);

    const anexos: AnexoChat[] = [];
    for (const arquivo of pendentes) {
      const { anexo, erro: falha } = await subirAnexo(arquivo, conversa.id);
      if (falha) { setErro(falha); setSubindo(false); return; }
      if (anexo) anexos.push(anexo);
    }

    const falha = await onEnviar(corpo, anexos);
    setSubindo(false);
    if (falha) { setErro(falha); return; }

    setTexto('');
    setPendentes([]);
    campo.current?.focus();
  }, [texto, pendentes, subindo, conversa.id, onEnviar]);

  const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter manda, Shift+Enter quebra linha. É o que a mão já espera.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
  };

  // ── Balões ─────────────────────────────────────────────────────────────────
  let diaAnterior = '';

  return (
    <div
      className="flex flex-col h-full min-h-0 relative"
      onDragOver={e => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setArrastando(false); }}
      onDrop={e => {
        e.preventDefault();
        setArrastando(false);
        receberArquivos([...e.dataTransfer.files]);
      }}
    >
      {/* Cabeçalho */}
      <header className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border shrink-0">
        {!expandido && onVoltar && (
          <button onClick={onVoltar} className="p-1 -ml-1 rounded hover:bg-muted transition-colors"
                  aria-label="Voltar para a lista">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <AvatarChat nome={conversa.outro_nome} foto={conversa.outro_foto} tamanho={34} online={online} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate leading-tight">{conversa.outro_nome}</p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {digitando ? <span className="text-primary">digitando…</span>
             : online ? 'online' : conversa.outro_usuario ?? ''}
          </p>
        </div>
      </header>

      {/* Mensagens */}
      <div ref={rolagem} onScroll={aoRolar}
           className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5">
        {mensagens.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">
            Nenhuma mensagem ainda. Escreva a primeira.
          </p>
        )}

        {mensagens.map(m => {
          const meu = m.autor_id === meuId;
          const dia = diaDaMensagem(m.criado_em);
          const novoDia = dia !== diaAnterior;
          diaAnterior = dia;
          const lida = meu && conversa.leitura_do_outro !== null
                       && m.criado_em <= conversa.leitura_do_outro;

          return (
            <div key={m.id}>
              {novoDia && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/60 rounded-full px-2.5 py-0.5">
                    {rotuloDoDia(m.criado_em)}
                  </span>
                </div>
              )}
              <div className={cn('flex', meu ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[78%] rounded-2xl px-3 py-1.5 space-y-1.5',
                  meu ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md',
                )}>
                  {m.anexos.map((a, i) => <AnexoNoBalao key={i} anexo={a} meu={meu} />)}
                  {m.texto && (
                    <p className={cn(
                      'text-sm whitespace-pre-wrap break-words',
                      m.expurgado_em && 'italic opacity-60',
                    )}>
                      {m.texto}
                    </p>
                  )}
                  <p className={cn(
                    'text-[10px] leading-none text-right',
                    meu ? 'text-primary-foreground/60' : 'text-muted-foreground',
                  )}>
                    {horaDoBalao(m.criado_em)}
                    {meu && <span className="ml-1">{lida ? '✓✓' : '✓'}</span>}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {temNovas && (
        <button onClick={() => descer()}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-full px-3 py-1.5 shadow-lg">
          <ArrowDown className="w-3 h-3" /> mensagens novas
        </button>
      )}

      {/* Escrita */}
      <div className="border-t border-border px-2.5 py-2 space-y-2 shrink-0">
        {erro && (
          <p className="text-[11px] text-destructive flex items-start gap-1">
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro(null)} aria-label="Fechar aviso"><X className="w-3 h-3" /></button>
          </p>
        )}

        {pendentes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pendentes.map((a, i) => (
              <span key={i} className="flex items-center gap-1 text-[11px] bg-muted rounded-full pl-2.5 pr-1 py-1">
                <span className="max-w-[130px] truncate">{a.name}</span>
                <span className="opacity-50">{tamanhoLegivel(a.size)}</span>
                <button onClick={() => setPendentes(p => p.filter((_, j) => j !== i))}
                        className="p-0.5 rounded-full hover:bg-background" aria-label={`Tirar ${a.name}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Emoji">
                <Smile className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => { setTexto(t => t + e); campo.current?.focus(); }}
                          className="text-lg leading-none p-1 rounded hover:bg-muted transition-colors">
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <label className="shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 pointer-events-none" asChild>
              <span><Paperclip className="w-4 h-4" /></span>
            </Button>
            <input type="file" multiple className="sr-only"
                   onChange={e => { receberArquivos([...(e.target.files ?? [])]); e.target.value = ''; }} />
            <span className="sr-only">Anexar arquivo</span>
          </label>

          <textarea
            ref={campo} rows={1} value={texto}
            onChange={e => { setTexto(e.target.value); onDigitando(); }}
            onKeyDown={aoTeclar}
            onPaste={aoColar}
            placeholder="Mensagem"
            className="flex-1 resize-none bg-muted/60 rounded-2xl px-3 py-2 text-sm max-h-28 outline-none focus:ring-1 focus:ring-ring"
          />

          <Button size="icon" className="h-8 w-8 shrink-0 rounded-full"
                  onClick={() => void enviar()}
                  disabled={subindo || (!texto.trim() && !pendentes.length)}
                  aria-label="Enviar">
            {subindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {arrastando && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 border-2 border-dashed border-primary rounded-xl pointer-events-none">
          <p className="text-sm font-medium text-primary">Solte para anexar</p>
        </div>
      )}
    </div>
  );
}
