/**
 * comum.tsx — as peças que as três telas do chat repetem.
 *
 * Nada aqui sabe de banco. São formas e formatos: o avatar com iniciais, a hora
 * curta, o balão de anexo. Ficam juntos para a bolha e a versão expandida
 * mostrarem exatamente a mesma coisa — duas cópias divergem no primeiro ajuste.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText, ImageIcon, Music, Video, Download, Play, Pause } from 'lucide-react';
import { urlDoAnexo, type AnexoChat } from '@/services/chat/chat.service';
import { cn } from '@/lib/utils';

// ── Avatar ───────────────────────────────────────────────────────────────────

export function AvatarChat({
  nome, foto, tamanho = 36, online = false,
}: {
  nome: string; foto: string | null; tamanho?: number; online?: boolean;
}) {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const estilo = { width: tamanho, height: tamanho };

  return (
    <div className="relative shrink-0" style={estilo}>
      {foto ? (
        <img src={foto} alt="" className="rounded-full object-cover w-full h-full" />
      ) : (
        <div
          className="rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground w-full h-full"
          style={{ fontSize: Math.max(10, tamanho * 0.34) }}
        >
          {iniciais || '?'}
        </div>
      )}
      {/*
        A bolinha de online. `ring` da cor do fundo abre uma folga entre ela e a
        foto — sem isso, num avatar escuro a bolinha some na borda.

        «Online» aqui quer dizer com o sistema ABERTO agora, e não «trabalhando»:
        quem fecha a aba some da lista em segundos. É presença de canal, não
        registro de ponto.
      */}
      {online && (
        <span
          className="absolute -bottom-px -right-px block rounded-full bg-emerald-500 ring-2 ring-background shadow-sm"
          style={{ width: Math.max(10, tamanho * 0.3), height: Math.max(10, tamanho * 0.3) }}
          title="online"
        />
      )}
    </div>
  );
}

// ── O ícone do botão ─────────────────────────────────────────────────────────

/**
 * O balão do chat, com os três pontos.
 *
 * SVG próprio, e não o `MessageCircle` do lucide, por dois motivos: o traço
 * fica mais grosso e mais legível em 26 px, e os pontos precisam animar
 * separados do balão — coisa que um ícone de biblioteca não deixa fazer.
 *
 * A animação é discreta: os pontos sobem 1,5 px em sequência, com 160 ms entre
 * eles, e só ganham vida quando o botão está ativo (mouse em cima, ou mensagem
 * não lida esperando). Parado, o botão fica parado — um ícone que se mexe o dia
 * inteiro no canto da tela vira distração, não convite.
 *
 * Em CSS, sem biblioteca e sem JavaScript por quadro. Não consulta
 * `prefers-reduced-motion`: nos computadores corporativos essa preferência
 * costuma vir ligada por política de desempenho, e o movimento aqui comunica
 * mensagem esperando — é estado, não decoração.
 */
export function IconeChat({ ativo = false }: { ativo?: boolean }) {
  return (
    <>
      <style>{`
        @keyframes chat-ponto {
          0%, 100% { transform: translateY(0);     opacity: .75; }
          50%      { transform: translateY(-1.5px); opacity: 1;  }
        }
        .chat-p-anima { animation: chat-ponto 1.6s ease-in-out infinite; }
        .chat-p-anima:nth-of-type(2) { animation-delay: .16s; }
        .chat-p-anima:nth-of-type(3) { animation-delay: .32s; }
      `}</style>
      <svg viewBox="0 0 32 32" className="w-[26px] h-[26px]" aria-hidden="true">
        {/* Balão de canto arredondado com o rabinho embaixo à esquerda. */}
        <path
          d="M6 4h20a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13.6l-5.3 4.7A1 1 0 0 1 6.6 27v-4H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"
          fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"
        />
        <circle className={cn(ativo && 'chat-p-anima')} cx="11" cy="13.5" r="1.9" fill="currentColor" />
        <circle className={cn(ativo && 'chat-p-anima')} cx="16" cy="13.5" r="1.9" fill="currentColor" />
        <circle className={cn(ativo && 'chat-p-anima')} cx="21" cy="13.5" r="1.9" fill="currentColor" />
      </svg>
    </>
  );
}

// ── Tag de empresa ───────────────────────────────────────────────────────────

/**
 * «BOOKPLAY» / «PAGUEPLAY» ao lado do nome.
 *
 * Mesmo desenho da tag do catálogo de permissões (`CartaoPermissao`), e de
 * propósito: no sistema inteiro, esse retângulo pequeno em versalete significa
 * «isto pertence a uma operação só». Inventar um segundo visual para a mesma
 * ideia obrigaria a pessoa a aprender duas vezes.
 *
 * `null` não desenha nada — é o caso de quem atende as duas. Ver
 * `fn_chat_contatos`.
 */
export function TagEmpresa({ slug }: { slug: string | null }) {
  if (!slug) return null;
  return (
    <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px leading-none">
      {slug}
    </span>
  );
}

// ── Tempo ────────────────────────────────────────────────────────────────────

/**
 * Hora curta, do jeito que se lê de relance numa lista.
 *
 * Hoje mostra a hora; ontem, a palavra; nesta semana, o dia; antes disso, a
 * data. É a régua do WhatsApp e existe por um motivo: numa lista, «14:32» e
 * «23/07» respondem perguntas diferentes, e mostrar sempre a data completa
 * obriga a pessoa a calcular se aquilo foi agora ou no mês passado.
 */
export function horaCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const agora = new Date();
  const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.floor((meiaNoite.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);

  if (dias <= 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias === 1) return 'ontem';
  if (dias < 7)  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function horaDoBalao(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** «Hoje», «Ontem» ou a data — o separador entre os dias da conversa. */
export function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const dias = Math.floor(
    (new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()
     - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function diaDaMensagem(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

// ── Anexos ───────────────────────────────────────────────────────────────────

function iconeDoTipo(tipo: string) {
  if (tipo.startsWith('image/')) return ImageIcon;
  if (tipo.startsWith('video/')) return Video;
  if (tipo.startsWith('audio/')) return Music;
  return FileText;
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Um anexo dentro do balão.
 *
 * O balde é privado, então a URL é assinada e pedida na hora — não dá para
 * montar o endereço no cliente. Imagem carrega o preview; o resto vira uma
 * linha com nome e tamanho. Enquanto a assinatura não volta, o espaço já fica
 * reservado, senão a conversa dá um salto quando a imagem aparece.
 */
export function AnexoNoBalao({
  anexo, meu, onAbrir,
}: {
  anexo: AnexoChat; meu: boolean;
  /** Foto e vídeo abrem no visualizador da própria aba. Ver `VisualizadorMidia`. */
  onAbrir?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const ehImagem = anexo.tipo?.startsWith('image/');
  const ehAudio  = anexo.tipo?.startsWith('audio/');
  const ehVideo  = anexo.tipo?.startsWith('video/');

  useEffect(() => {
    let vivo = true;
    void urlDoAnexo(anexo.url).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [anexo.url]);

  if (ehAudio) return <PlayerAudio url={url} meu={meu} />;

  if (ehImagem || ehVideo) {
    return (
      <button
        onClick={onAbrir}
        className="block rounded-lg overflow-hidden bg-muted/40 max-w-[240px] relative group"
        aria-label={`Abrir ${anexo.nome}`}
      >
        {url ? (
          ehVideo ? (
            // Só o primeiro quadro: carregar o vídeo inteiro para desenhar uma
            // miniatura gastaria a banda de todos os vídeos da conversa.
            <video src={url} preload="metadata" muted
                   className="w-full h-auto max-h-64 object-cover pointer-events-none" />
          ) : (
            <img src={url} alt={anexo.nome} className="w-full h-auto max-h-64 object-cover" />
          )
        ) : (
          <div className="w-[240px] h-32 animate-pulse" />
        )}

        {ehVideo && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/35 transition-colors">
            <span className="w-11 h-11 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </span>
          </span>
        )}
      </button>
    );
  }

  const Icone = iconeDoTipo(anexo.tipo ?? '');
  return (
    <a
      href={url ?? undefined} target="_blank" rel="noreferrer" download={anexo.nome}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 max-w-[240px] transition-colors',
        meu ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
            : 'bg-background/70 hover:bg-background',
      )}
    >
      <Icone className="w-4 h-4 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium truncate">{anexo.nome}</span>
        <span className="block text-[10px] opacity-60">{tamanhoLegivel(anexo.tamanho)}</span>
      </span>
      <Download className="w-3.5 h-3.5 shrink-0 opacity-50" />
    </a>
  );
}

// ── Áudio ────────────────────────────────────────────────────────────────────

/** `83` → `1:23`. Segundo cheio: milissegundo num áudio de recado é ruído. */
export function duracaoCurta(segundos: number): string {
  if (!isFinite(segundos) || segundos < 0) return '0:00';
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * O player de áudio dentro do balão.
 *
 * `<audio controls>` nativo tem 250 px de largura, altura fixa e um visual que
 * não segue tema nenhum — dentro de um balão de 78% da conversa ele fica maior
 * que a própria mensagem. Este é o mínimo que um recado precisa: tocar, parar,
 * saber quanto falta, e pular para um ponto.
 *
 * ## A duração pode não vir
 *
 * Áudio gravado por `MediaRecorder` costuma chegar com `duration = Infinity`
 * até tocar inteiro — é um defeito velho de webm sem cabeçalho de duração. Por
 * isso o número só aparece quando é finito, e enquanto não for, mostra o tempo
 * decorrido. Melhor um campo que aparece depois do que um «Infinity:NaN».
 */
export function PlayerAudio({ url, meu }: { url: string | null; meu: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState(0);
  const [total, setTotal] = useState(0);

  const pronto = !!url;
  const progresso = total > 0 ? (agora / total) * 100 : 0;

  function alternar() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play(); else el.pause();
  }

  function pular(e: React.MouseEvent<HTMLDivElement>) {
    const el = audio.current;
    if (!el || !total) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - caixa.left) / caixa.width) * total;
  }

  return (
    <div className={cn(
      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 w-[210px]',
      meu ? 'bg-primary-foreground/15' : 'bg-background/70',
    )}>
      <button
        onClick={alternar} disabled={!pronto}
        className={cn(
          'w-8 h-8 rounded-full shrink-0 flex items-center justify-center transition-colors',
          meu ? 'bg-primary-foreground/25 hover:bg-primary-foreground/40'
              : 'bg-muted hover:bg-muted-foreground/20',
          !pronto && 'opacity-50',
        )}
        aria-label={tocando ? 'Pausar' : 'Tocar'}
      >
        {tocando ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          onClick={pular}
          className={cn('h-1 rounded-full cursor-pointer',
                        meu ? 'bg-primary-foreground/25' : 'bg-muted-foreground/25')}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-100',
                          meu ? 'bg-primary-foreground' : 'bg-primary')}
            style={{ width: `${progresso}%` }}
          />
        </div>
        <p className="text-[10px] mt-1 opacity-70 tabular-nums">
          {total > 0 ? `${duracaoCurta(agora)} / ${duracaoCurta(total)}` : duracaoCurta(agora)}
        </p>
      </div>

      {url && (
        <audio
          ref={audio} src={url} preload="metadata"
          onPlay={() => setTocando(true)}
          onPause={() => setTocando(false)}
          onEnded={() => { setTocando(false); setAgora(0); }}
          onTimeUpdate={e => setAgora(e.currentTarget.currentTime)}
          onLoadedMetadata={e => {
            const d = e.currentTarget.duration;
            if (isFinite(d) && d > 0) setTotal(d);
          }}
          onDurationChange={e => {
            const d = e.currentTarget.duration;
            if (isFinite(d) && d > 0) setTotal(d);
          }}
        />
      )}
    </div>
  );
}

// ── Digitando ────────────────────────────────────────────────────────────────

/**
 * O balão de «digitando», com os três pontos.
 *
 * Substitui a palavra escrita dentro da conversa: um balão igual aos outros,
 * só que com pontos em vez de texto, diz a mesma coisa sem ocupar uma linha de
 * leitura — e é o gesto que todo chat usa, então ninguém precisa aprender.
 *
 * Os pontos sobem em sequência, 180 ms entre eles. Nada de opacidade piscando:
 * o movimento é o que lê como «alguém está escrevendo», e piscar lê como
 * «carregando».
 */
export function BalaoDigitando() {
  return (
    <>
      <style>{`
        @keyframes chat-digita {
          0%, 60%, 100% { transform: translateY(0);   opacity: .45; }
          30%           { transform: translateY(-4px); opacity: 1;  }
        }
        .chat-d { animation: chat-digita 1.3s ease-in-out infinite; }
        .chat-d:nth-child(2) { animation-delay: .18s; }
        .chat-d:nth-child(3) { animation-delay: .36s; }
      `}</style>
      <div className="flex justify-start">
        <div
          className="bg-muted rounded-2xl rounded-bl-md px-3.5 py-3 flex items-center gap-1"
          role="status" aria-label="digitando"
        >
          <span className="chat-d w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <span className="chat-d w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <span className="chat-d w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        </div>
      </div>
    </>
  );
}

/**
 * A entrada de uma mensagem nova.
 *
 * Sobe 6 px e aparece em 180 ms. Curto de propósito: a animação existe para os
 * olhos acharem a linha nova, não para ser notada. Qualquer coisa mais longa
 * atrasa a leitura de quem está conversando rápido.
 *
 * Aplicada SÓ em mensagem que chega depois da tela montada — ver `novasRef` em
 * `Conversa`. Sem esse cuidado, abrir uma conversa animaria as 60 de uma vez.
 */
export const ANIMACAO_ENTRADA = 'chat-entra';

export function EstiloEntrada() {
  return (
    <style>{`
      @keyframes chat-entrada {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0);   }
      }
      .${ANIMACAO_ENTRADA} { animation: chat-entrada .18s ease-out; }
    `}</style>
  );
}

// ── Emoji ────────────────────────────────────────────────────────────────────

/**
 * Uma lista curta, escolhida a dedo, em vez de uma biblioteca.
 *
 * Um seletor completo são centenas de KB e uma busca que ninguém usa para
 * mandar 👍. Estes são os que aparecem numa conversa de trabalho — e a pessoa
 * que quiser outro cola do teclado do sistema, que continua funcionando.
 */
export const EMOJIS = [
  '👍', '👏', '🙏', '💪', '🔥', '🎉', '✅', '❌',
  '😀', '😂', '🙂', '😉', '😍', '🤔', '😅', '😢',
  '😮', '😎', '🥳', '😴', '🤝', '👀', '💡', '⚠️',
  '❤️', '⭐', '📌', '📎', '📊', '💰', '⏰', '🚀',
] as const;
