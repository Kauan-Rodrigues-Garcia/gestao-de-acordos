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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Paperclip, Send, Smile, X, ArrowDown, Loader2, Mic, Trash2, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  subirAnexo, LIMITE_ANEXO,
  type MensagemChat, type ConversaChat, type AnexoChat,
} from '@/services/chat/chat.service';
import { useGravadorAudio } from '@/hooks/useGravadorAudio';
import {
  AvatarChat, AnexoNoBalao, EMOJIS, BalaoDigitando, EstiloEntrada, PlayerAudio,
  ANIMACAO_ENTRADA,
  horaDoBalao, rotuloDoDia, diaDaMensagem, tamanhoLegivel, duracaoCurta,
} from './comum';
import { VisualizadorMidia } from './VisualizadorMidia';
import { StatusMensagem } from './StatusMensagem';
import { estadoMensagem } from './estadoMensagem';

interface Props {
  conversa:   ConversaChat;
  mensagens:  MensagemChat[];
  online:     boolean;
  digitando:  boolean;
  expandido:  boolean;
  onVoltar?:  () => void;
  onEnviar:   (texto: string, anexos: AnexoChat[]) => Promise<string | null>;
  onDigitando: () => void;
  /** Há página anterior para carregar? */
  temMais:        boolean;
  carregandoMais: boolean;
  onVerAnteriores: () => void;
}

export function Conversa({
  conversa, mensagens, online, digitando, expandido, onVoltar, onEnviar, onDigitando,
  temMais, carregandoMais, onVerAnteriores,
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
  const gravador = useGravadorAudio();

  /*
   * As mensagens que já estavam na tela quando ela montou.
   *
   * A animação de entrada vale só para o que CHEGA depois. Sem esta conta,
   * abrir uma conversa animaria as sessenta de uma vez — festa, não informação.
   */
  const jaVistas = useRef<Set<string>>(new Set());

  /** Altura da rolagem antes de inserir a página anterior, para não pular. */
  const alturaAntes = useRef<number | null>(null);

  /*
   * Miniatura do que está para ser enviado.
   *
   * `URL.createObjectURL` reserva memória até alguém revogar — sem a limpeza,
   * cada print anexado e removido ficaria pendurado pelo resto da sessão.
   * Mesmo cuidado do chat de Tickets.
   */
  const previas = useMemo(
    () => pendentes.map(f => ({
      arquivo: f,
      url: (f.type.startsWith('image/') || f.type.startsWith('audio/')) ? URL.createObjectURL(f) : null,
    })),
    [pendentes],
  );

  useEffect(() => {
    return () => { for (const p of previas) if (p.url) URL.revokeObjectURL(p.url); };
  }, [previas]);

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
    const el = rolagem.current;

    /*
     * Chegou página anterior: devolve a rolagem para onde ela estava.
     *
     * Inserir 60 mensagens acima empurra para baixo o que a pessoa está lendo —
     * ela clica em «ver anteriores» e perde justamente a linha que queria
     * comparar. A diferença de altura é o quanto compensar.
     */
    if (el && alturaAntes.current !== null) {
      el.scrollTop += el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
      return;
    }

    const ultima = mensagens[mensagens.length - 1];
    if (!ultima) return;
    if (noFim.current || ultima.autor_id === meuId) descer(mensagens.length > 1);
    else setTemNovas(true);
  }, [mensagens, meuId, descer]);

  useEffect(() => {
    jaVistas.current = new Set(mensagens.map(m => m.id));
    descer(false);
    campo.current?.focus();
    // Só em `conversa.id` de propósito: incluir `mensagens` semearia o conjunto
    // a cada mensagem nova, e nada nunca seria considerado novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  /*
   * Todas as fotos e vídeos da conversa, na ordem em que aparecem.
   *
   * É o que faz as setas do visualizador andarem pela CONVERSA, e não só pela
   * mensagem clicada: quem manda seis prints seguidos quer passar de um para o
   * outro, não fechar e reabrir seis vezes.
   */
  const midias = useMemo(
    () => mensagens.flatMap(m =>
      m.anexos.filter(a => a.tipo?.startsWith('image/') || a.tipo?.startsWith('video/'))),
    [mensagens],
  );

  const [midiaAberta, setMidiaAberta] = useState<number | null>(null);

  const pedirAnteriores = useCallback(() => {
    alturaAntes.current = rolagem.current?.scrollHeight ?? null;
    onVerAnteriores();
  }, [onVerAnteriores]);

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

  const temAlgoParaEnviar = !!texto.trim() || pendentes.length > 0;

  /**
   * Encerra a gravação e põe o áudio na fila de anexos.
   *
   * NÃO envia sozinho. O áudio entra como qualquer outro arquivo: dá para
   * escrever uma linha junto, anexar mais alguma coisa, ou desistir e tirar
   * pelo X. Mandar na hora tiraria a chance de reconsiderar um recado — que é
   * justamente o que mais se reconsidera.
   */
  const pararEAnexar = useCallback(async () => {
    const arquivo = await gravador.parar();
    if (!arquivo) return;
    if (arquivo.size > LIMITE_ANEXO) {
      setErro(`A gravação ficou com ${tamanhoLegivel(arquivo.size)} e o limite é 10 MB.`);
      return;
    }
    setPendentes(atual => [...atual, arquivo]);
    campo.current?.focus();
  }, [gravador]);

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
          {/*
            Login não entra aqui: quem está conversando já sabe com quem fala, e
            o que muda de minuto a minuto é se a pessoa está do outro lado.
            «online» quer dizer com o sistema aberto agora — não é «trabalhando».
          */}
          <p className="text-[11px] leading-tight">
            {digitando
              ? <span className="text-primary">digitando…</span>
              : online
                ? <span className="text-emerald-600 dark:text-emerald-500">online</span>
                : <span className="text-muted-foreground">offline</span>}
          </p>
        </div>
      </header>

      {/* Mensagens */}
      <div ref={rolagem} onScroll={aoRolar}
           className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5">
        <EstiloEntrada />

        {temMais && (
          <div className="flex justify-center pb-2">
            <button
              onClick={pedirAnteriores} disabled={carregandoMais}
              className="text-[11px] text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted rounded-full px-3 py-1 transition-colors disabled:opacity-60"
            >
              {carregandoMais ? 'Carregando…' : 'Ver mensagens anteriores'}
            </button>
          </div>
        )}

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
          const estado = meu
            ? estadoMensagem(m.criado_em, conversa.entrega_do_outro, conversa.leitura_do_outro)
            : null;
          // Só anima o que chegou depois de a tela montar.
          const nova = !jaVistas.current.has(m.id);
          if (nova) jaVistas.current.add(m.id);

          return (
            <div key={m.id} className={cn(nova && ANIMACAO_ENTRADA)}>
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
                  {m.anexos.map((a, i) => (
                    <AnexoNoBalao
                      key={i} anexo={a} meu={meu}
                      onAbrir={() => {
                        const pos = midias.findIndex(x => x.url === a.url);
                        if (pos >= 0) setMidiaAberta(pos);
                      }}
                    />
                  ))}
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
                    {estado && <StatusMensagem estado={estado} noBalao className="ml-1" />}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* No fim da conversa, como em qualquer chat: é ali que a próxima
            mensagem vai nascer, e é para lá que o olho já está indo. */}
        {digitando && <BalaoDigitando />}
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

        {previas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {previas.map((p, i) => (
              <div key={`${p.arquivo.name}-${i}`}
                   className="relative rounded-lg border border-border bg-muted overflow-hidden">
                {p.arquivo.type.startsWith('audio/') && p.url ? (
                  /*
                    Áudio ouvível ANTES de mandar. Era o pedido: depois de
                    gravar, «audio-2026-08-25-19-04-12.webm» é feio e não diz
                    nada — o que a pessoa quer é conferir o recado, e regravar
                    se não gostou. O X ao lado apaga e libera o microfone de novo.
                  */
                  <div className="p-1.5 pr-7">
                    <PlayerAudio url={p.url} meu={false} />
                  </div>
                ) : p.url ? (
                  <img src={p.url} alt={p.arquivo.name} className="h-16 w-16 object-cover" />
                ) : (
                  <div className="h-16 min-w-[92px] max-w-[150px] flex flex-col justify-center px-2 py-1">
                    <span className="text-[10px] leading-tight line-clamp-2 break-all">
                      {p.arquivo.name}
                    </span>
                    <span className="text-[9px] opacity-50 mt-0.5">
                      {tamanhoLegivel(p.arquivo.size)}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setPendentes(atual => atual.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 hover:bg-background"
                  aria-label={`Tirar ${p.arquivo.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {gravador.erro && (
          <p className="text-[11px] text-destructive">{gravador.erro}</p>
        )}

        {gravador.gravando ? (
          /*
            Gravando: a barra de escrita some inteira. Deixar o campo do lado
            convida a pessoa a digitar enquanto grava, e aí o botão de enviar
            fica com dois significados ao mesmo tempo.
          */
          <div className="flex items-center gap-2 h-10">
            <button
              onClick={gravador.cancelar}
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Descartar a gravação"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
            <span className="text-sm tabular-nums flex-1">
              {duracaoCurta(gravador.segundos)}
            </span>
            <span className="text-[11px] text-muted-foreground">gravando…</span>

            <Button size="icon" className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => void pararEAnexar()} aria-label="Concluir a gravação">
              <Check className="w-4 h-4" />
            </Button>
          </div>
        ) : (
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

          {/*
            Microfone OU enviar, nunca os dois. Com a mensagem vazia, o botão
            grava; com algo escrito, ele manda. É o gesto que a mão já conhece,
            e evita dois botões redondos disputando a mesma quina.
          */}
          {temAlgoParaEnviar ? (
            <Button size="icon" className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => void enviar()} disabled={subindo} aria-label="Enviar">
              {subindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => void gravador.iniciar()}
                    disabled={!gravador.suportado}
                    title={gravador.suportado ? 'Gravar áudio' : 'Este navegador não grava áudio'}
                    aria-label="Gravar áudio">
              <Mic className="w-4 h-4" />
            </Button>
          )}
        </div>
        )}
      </div>

      {/* Foto e vídeo abrem aqui dentro, e não numa aba com a URL assinada
          à mostra. PDF continua abrindo fora — ver `VisualizadorMidia`. */}
      <VisualizadorMidia
        midias={midias} inicial={midiaAberta} onFechar={() => setMidiaAberta(null)}
      />

      {arrastando && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 border-2 border-dashed border-primary rounded-xl pointer-events-none">
          <p className="text-sm font-medium text-primary">Solte para anexar</p>
        </div>
      )}
    </div>
  );
}
