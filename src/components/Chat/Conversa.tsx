/**
 * Conversa.tsx — a thread aberta: balões, escrita, anexo e emoji.
 *
 * ## O arrastar e o botão são o mesmo caminho
 *
 * Arrastar arquivo para dentro, colar da área de transferência e escolher pelo
 * clipe caem todos em `receberArquivos`. Três portas, uma sala — senão o
 * arrastar aceitaria um arquivo de 40 MB que o botão recusa.
 *
 * ## A conversa viva acompanha o fim
 *
 * Mensagem enviada, recebida ou o balão de «digitando» levam para o fim. É uma
 * escolha explícita deste chat operacional: o que está acontecendo agora tem
 * prioridade sobre a posição antiga da rolagem.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Paperclip, Send, Smile, X, Loader2, Mic, Trash2, Check,
  Heart, CornerUpLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/use-toast';
import {
  subirAnexo, curtirMensagem, LIMITE_ANEXO,
  type MensagemChat, type ConversaChat, type AnexoChat,
} from '@/services/chat/chat.service';
import { useGravadorAudio } from '@/hooks/useGravadorAudio';
import {
  AvatarChat, AnexoNoBalao, EMOJIS, BalaoDigitando, EstiloEntrada, PlayerAudio,
  TagAdm,
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
  /** A pessoa do outro lado está gravando um áudio para mim agora. */
  gravando:   boolean;
  expandido:  boolean;
  onVoltar?:  () => void;
  onEnviar:   (texto: string, anexos: AnexoChat[], respondendoId?: string | null) => Promise<string | null>;
  onDigitando: () => void;
  /** Avisa o outro lado que estou gravando. Chamado em ritmo — ver o efeito. */
  onGravando: () => void;
  /** Há página anterior para carregar? */
  temMais:        boolean;
  carregandoMais: boolean;
  onVerAnteriores: () => void;
}

export function Conversa({
  conversa, mensagens, online, digitando, gravando, expandido, onVoltar, onEnviar,
  onDigitando, onGravando, temMais, carregandoMais, onVerAnteriores,
}: Props) {
  const { perfil } = useAuth();
  const { toast } = useToast();
  const meuId = perfil?.id ?? '';

  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  /** Mensagem que a próxima vai citar. Null = mensagem solta. */
  const [respondendo, setRespondendo] = useState<MensagemChat | null>(null);

  const rolagem = useRef<HTMLDivElement>(null);
  const campo   = useRef<HTMLTextAreaElement>(null);
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
    descer(mensagens.length > 1);
  }, [mensagens, descer]);

  // O balão nasce no fim da lista. Descer depois de ele montar evita que os
  // três pontos fiquem escondidos logo abaixo da área visível.
  useLayoutEffect(() => {
    if (digitando || gravando) descer(true);
  }, [digitando, gravando, descer]);

  /*
   * Enquanto o microfone está aberto, reavisa o outro lado.
   *
   * Diferente do «digitando», que nasce de um evento (a tecla), gravar é um
   * ESTADO sem eventos: sem este pulso a marca do outro lado expiraria em três
   * segundos e o "gravando áudio…" piscaria e sumiria no meio da gravação. O
   * ritmo é menor que a validade da marca, e `avisarAtividade` estrangula o
   * excesso do lado de lá.
   */
  const avisoGravando = useRef(onGravando);
  avisoGravando.current = onGravando;
  useEffect(() => {
    if (!gravador.gravando) return;
    // Pela ref, e não pela dependência: o pai passa uma arrow nova a cada
    // render, e depender dela reiniciaria o intervalo o tempo todo.
    const pulsar = () => avisoGravando.current();
    pulsar();
    const id = setInterval(pulsar, 1200);
    return () => clearInterval(id);
  }, [gravador.gravando]);

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

    const falha = await onEnviar(corpo, anexos, respondendo?.id ?? null);
    setSubindo(false);
    if (falha) { setErro(falha); return; }

    setTexto('');
    setPendentes([]);
    setRespondendo(null);
    campo.current?.focus();
  }, [texto, pendentes, subindo, conversa.id, onEnviar, respondendo]);

  /** Índice por id: a citação precisa achar a mensagem original para desenhar. */
  const porId = useMemo(() => new Map(mensagens.map(m => [m.id, m])), [mensagens]);

  const responder = useCallback((m: MensagemChat) => {
    setRespondendo(m);
    campo.current?.focus();
  }, []);

  const curtir = useCallback(async (m: MensagemChat) => {
    // Otimista de propósito: o coração é a interação mais leve do chat e
    // esperar o servidor para pintá-lo faz o toque parecer que não pegou.
    // O realtime traz o valor real logo em seguida; se falhar, some sozinho.
    const { erro: falha } = await curtirMensagem(m.id, !m.curtida_por);
    if (falha) setErro(falha);
  }, []);

  /*
   * Trava do duplo clique.
   *
   * Dois cliques rápidos curtem; mais dois, descurtem. Sem trava, quem clica
   * quatro vezes seguidas (ou dá um duplo clique com a mão pesada, que o
   * navegador entrega como dois `dblclick`) manda duas chamadas em sequência e
   * o coração pisca e volta ao que era — parecendo que não funcionou.
   *
   * A janela é por MENSAGEM, não global: curtir duas mensagens diferentes em
   * seguida é uso normal e não pode ser engolido.
   */
  const ultimoToque = useRef<Map<string, number>>(new Map());
  const ESPERA_DUPLO_CLIQUE = 600;

  const curtirPorToque = useCallback((m: MensagemChat) => {
    const agora = Date.now();
    const anterior = ultimoToque.current.get(m.id) ?? 0;
    if (agora - anterior < ESPERA_DUPLO_CLIQUE) return;
    ultimoToque.current.set(m.id, agora);
    void curtir(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /*
   * Aviso de curtida.
   *
   * Não é notificação de banco: a curtida já viaja como UPDATE no realtime que
   * `useChat` escuta, e criar uma linha em `notificacoes` para um coração
   * encheria o sino de ruído. O aviso aparece para quem está com a conversa
   * aberta, que é quem pode reagir a ele.
   *
   * `curtidasVistas` começa preenchido com o que já estava na tela — sem isso,
   * abrir uma conversa antiga dispararia um toast para cada coração antigo.
   */
  const curtidasVistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    const minhasCurtidas = new Set(
      mensagens.filter(m => m.curtida_por && m.autor_id === meuId).map(m => m.id),
    );
    if (curtidasVistas.current === null) { curtidasVistas.current = minhasCurtidas; return; }
    for (const id of minhasCurtidas) {
      if (curtidasVistas.current.has(id)) continue;
      const m = mensagens.find(x => x.id === id);
      if (m?.curtida_por === meuId) continue;   // curtir a própria não avisa
      toast({
        title: `${conversa.outro_nome} curtiu sua mensagem`,
        description: m?.texto ? m.texto.slice(0, 80) : 'Anexo',
      });
    }
    curtidasVistas.current = minhasCurtidas;
  }, [mensagens, meuId, conversa.outro_nome]);

  // Conversa trocada: o conjunto de curtidas já vistas é de outra conversa.
  useEffect(() => { curtidasVistas.current = null; }, [conversa.id]);

  /*
   * ESC fecha a conversa.
   *
   * Mora AQUI, e não no `BolhaChat`, porque só aqui se sabe o que há para
   * desfazer antes: o visualizador de mídia e a citação em edição são estado
   * deste componente. Um ESC no pai não enxergaria nenhum dos dois e fecharia a
   * conversa por cima de um modal aberto.
   *
   * A ordem é a de sempre em interface: desfaz a camada mais rasa primeiro.
   *   1. visualizador de mídia aberto — ele tem ESC próprio, aqui só se sai
   *   2. citação em edição — cancela a resposta
   *   3. nada disso — fecha a conversa (na janela pequena isso É voltar para a
   *      lista; na expandida, esvaziar a coluna da direita)
   *
   * O `closest('[role="dialog"]')` é o que impede o ESC de Nova conversa,
   * Disparo ou Sobre de fechar a conversa que está atrás deles: os diálogos
   * são renderizados em portal, fora desta árvore, e o alvo do evento denuncia
   * de onde a tecla veio.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest?.('[role="dialog"]')) return;
      if (midiaAberta !== null) return;
      if (respondendo) { setRespondendo(null); return; }
      onVoltar?.();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [midiaAberta, respondendo, onVoltar]);

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
          <p className="flex items-center gap-1.5 text-sm font-medium leading-tight">
            <span className="truncate">{conversa.outro_nome}</span>
            <TagAdm perfil={conversa.outro_perfil} />
          </p>
          {/*
            Login não entra aqui: quem está conversando já sabe com quem fala, e
            o que muda de minuto a minuto é se a pessoa está do outro lado.
            «online» quer dizer com o sistema aberto agora — não é «trabalhando».
          */}
          {/*
            Gravando vem ANTES de digitando: quem está com o microfone aberto
            não está escrevendo, e mostrar "digitando…" enquanto o outro grava
            faz a pessoa esperar um texto que nunca chega.
          */}
          <p className="text-[11px] leading-tight">
            {gravando
              ? <span className="text-primary">gravando áudio…</span>
              : digitando
                ? <span className="text-primary">digitando…</span>
                : online
                  ? <span className="text-emerald-600 dark:text-emerald-500">online</span>
                  : <span className="text-muted-foreground">offline</span>}
          </p>
        </div>
      </header>

      {/* Mensagens */}
      <div ref={rolagem}
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
              {/*
                `group` + ações fora do balão: responder e curtir aparecem ao
                passar o mouse, do lado de dentro da conversa. Ficam FORA da
                caixa para não empurrar o texto nem competir com o anexo, e
                `focus-within` mantém as duas alcançáveis por teclado.
              */}
              <div className={cn('group flex items-center gap-1', meu ? 'justify-end' : 'justify-start')}>
                {meu && <AcoesBalao m={m} onResponder={responder} onCurtir={curtir} />}
                {/*
                  Duplo clique no balão curte, como no Instagram.
                  `select-none` evita que o gesto marque o texto no caminho, e o
                  botão de coração ao lado continua existindo para quem prefere
                  o alvo explícito (e para o teclado, que não dá duplo clique).
                */}
                <div
                  onDoubleClick={() => { if (!m.expurgado_em) curtirPorToque(m); }}
                  className={cn(
                    'relative max-w-[78%] select-none rounded-2xl px-3 py-1.5 space-y-1.5',
                    meu ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md',
                    // Espaço para o coração não encostar na hora.
                    m.curtida_por && 'mb-2',
                  )}>
                  {/* Citação: o pedaço de cima do balão, como no WhatsApp. */}
                  {m.respondendo_id && (
                    <Citacao
                      alvo={porId.get(m.respondendo_id) ?? null}
                      meu={meu}
                      souOAutorDoAlvo={porId.get(m.respondendo_id)?.autor_id === meuId}
                      nomeDoOutro={conversa.outro_nome}
                    />
                  )}
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

                  {/* O coração encosta na quina de baixo do balão, meio para
                      fora, como no Instagram: pertence à mensagem sem ocupar
                      uma linha dela. */}
                  {m.curtida_por && (
                    <span
                      className={cn(
                        'absolute -bottom-2 flex h-5 w-5 items-center justify-center',
                        'rounded-full bg-background shadow ring-1 ring-border',
                        meu ? 'left-1' : 'right-1',
                      )}
                      title={m.curtida_por === meuId ? 'Você curtiu' : `${conversa.outro_nome} curtiu`}
                    >
                      <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                    </span>
                  )}
                </div>
                {!meu && <AcoesBalao m={m} onResponder={responder} onCurtir={curtir} />}
              </div>
            </div>
          );
        })}

        {/* No fim da conversa, como em qualquer chat: é ali que a próxima
            mensagem vai nascer, e é para lá que o olho já está indo. */}
        {(gravando || digitando) && <BalaoDigitando gravando={gravando} />}
      </div>

      {/* Escrita */}
      <div className="border-t border-border px-2.5 py-2 space-y-2 shrink-0">
        {/*
          A citação em edição fica acima do campo, como no WhatsApp: quem está
          escrevendo precisa ver o que está respondendo sem tirar o olho de onde
          digita. O X cancela; o ESC também (ver o handler de teclado).
        */}
        {respondendo && (
          <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-muted/60 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold leading-none text-primary">
                Respondendo {respondendo.autor_id === meuId ? 'você mesmo' : conversa.outro_nome}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {respondendo.texto?.trim() || (respondendo.anexos.length ? 'Anexo' : 'Mensagem')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRespondendo(null)}
              aria-label="Cancelar resposta"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
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

/**
 * Responder e curtir, ao lado do balão.
 *
 * Aparecem no hover (e no foco, para quem usa teclado). Ficam fora do balão de
 * propósito: dentro, empurrariam o texto e brigariam com o anexo — e num balão
 * de uma palavra a caixa ficaria maior que a mensagem.
 *
 * Responder fica EM CIMA de curtir, como pedido: é a ação que continua a
 * conversa, e a de baixo é a que só reage.
 */
function AcoesBalao({
  m, onResponder, onCurtir,
}: {
  m: MensagemChat;
  onResponder: (m: MensagemChat) => void;
  onCurtir: (m: MensagemChat) => void;
}) {
  // Mensagem sem conteúdo (expurgada) não se responde nem se curte.
  if (m.expurgado_em) return null;
  return (
    <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        type="button"
        onClick={() => onResponder(m)}
        title="Responder"
        aria-label="Responder a esta mensagem"
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void onCurtir(m)}
        title={m.curtida_por ? 'Descurtir' : 'Curtir'}
        aria-label={m.curtida_por ? 'Descurtir esta mensagem' : 'Curtir esta mensagem'}
        aria-pressed={!!m.curtida_por}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Heart className={cn('h-3.5 w-3.5', m.curtida_por && 'fill-red-500 text-red-500')} />
      </button>
    </div>
  );
}

/** Prévia da mensagem citada, no topo do balão que a responde. */
function Citacao({
  alvo, meu, souOAutorDoAlvo, nomeDoOutro,
}: {
  alvo: MensagemChat | null;
  meu: boolean;
  souOAutorDoAlvo: boolean;
  nomeDoOutro: string;
}) {
  /*
   * `alvo` nulo não é erro: a citada pode estar numa página anterior que ainda
   * não foi carregada, ou ter sido apagada (o FK é ON DELETE SET NULL, mas a
   * linha some da lista antes disso). Some melhor que sumir a resposta inteira.
   */
  const resumo = !alvo
    ? 'Mensagem indisponível'
    : alvo.expurgado_em ? 'Mensagem removida'
    : alvo.texto?.trim() || (alvo.anexos.length ? 'Anexo' : 'Mensagem');

  return (
    <div className={cn(
      'flex flex-col gap-0.5 rounded-lg border-l-2 px-2 py-1',
      meu
        ? 'border-primary-foreground/60 bg-primary-foreground/10'
        : 'border-primary bg-background/60',
    )}>
      <span className={cn(
        'text-[10px] font-semibold leading-none',
        meu ? 'text-primary-foreground/80' : 'text-primary',
      )}>
        {souOAutorDoAlvo ? 'Você' : nomeDoOutro}
      </span>
      <span className={cn(
        'line-clamp-2 text-[11px] leading-snug',
        meu ? 'text-primary-foreground/70' : 'text-muted-foreground',
        !alvo && 'italic',
      )}>
        {resumo}
      </span>
    </div>
  );
}
