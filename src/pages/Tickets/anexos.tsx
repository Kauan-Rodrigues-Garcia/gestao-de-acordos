/**
 * anexos.tsx — tudo o que é arquivo no ticket: escolher, mostrar e ampliar.
 *
 * ## Por que um arquivo só
 *
 * O formulário de abertura, a caixa da conversa, o cartão do pedido e a aba
 * «Arquivos» mexem com o mesmo objeto (`AnexoTicket`) e com as mesmas regras:
 * 10 MB por arquivo, print colado ganha nome com hora, imagem aparece e o resto
 * vira link. Espalhar isso por quatro telas era escrever a mesma regra de
 * quatro jeitos.
 *
 * ## O balde é privado
 *
 * O endereço gravado no anexo não abre sozinho (auditoria de 06/10/2026): cada
 * imagem pede um link assinado (`urlDoAnexoTicket`), guardado por 50 min. Até
 * ele chegar, o anexo mostra o nome.
 *
 * ## Foto se olha grande
 *
 * Clicar na imagem abre o `VisualizadorDeImagens` — tela cheia, setas e teclado
 * para passar de uma para a outra. Antes a imagem abria numa aba nova do
 * navegador, e comparar dois prints era ir e voltar entre abas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Download, FileText, ImagePlus, Music, Video, X, Camera,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AnexoTicket } from '@/services/tickets.service';
import {
  TIPOS_ACEITOS, arquivosQueCabem, usePrevias, useUrlAssinada, ehImagem, tamanhoLegivel,
} from './arquivos';

// ── Escolher arquivos ────────────────────────────────────────────────────────

/** Miniaturas do que vai ser enviado, cada uma com o X de tirar. */
export function PreviasPendentes({ arquivos, onRemover, tamanho = 'md' }: {
  arquivos: File[];
  onRemover: (indice: number) => void;
  tamanho?: 'sm' | 'md';
}) {
  const previas = usePrevias(arquivos);
  if (!previas.length) return null;
  const lado = tamanho === 'sm' ? 'h-16 w-16' : 'h-20 w-20';
  return (
    <div className="flex flex-wrap gap-2">
      {previas.map((p, i) => (
        <div key={`${p.arquivo.name}-${i}`}
          className="group relative rounded-lg border border-border bg-muted overflow-hidden">
          {p.url ? (
            <img src={p.url} alt={p.arquivo.name} className={cn(lado, 'object-cover')} />
          ) : (
            <div className={cn(tamanho === 'sm' ? 'h-16 w-28' : 'h-20 w-32', 'flex flex-col justify-center gap-1 px-2')}>
              <IconeDoTipo tipo={p.arquivo.type} className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] leading-tight break-all line-clamp-2">{p.arquivo.name}</span>
            </div>
          )}
          <button
            type="button"
            className="absolute top-1 right-1 rounded-full bg-background/95 p-0.5 shadow-sm ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
            title={`Tirar ${p.arquivo.name}`}
            aria-label={`Tirar ${p.arquivo.name}`}
            onClick={() => onRemover(i)}>
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * A área grande de «solte aqui» do formulário de abertura.
 *
 * Três caminhos para o mesmo lugar, porque cada pessoa chega de um jeito: quem
 * tirou print cola (Ctrl+V em qualquer ponto do formulário — quem cuida disso é
 * o formulário, que repassa para `onArquivos`), quem tem o arquivo arrasta, e
 * quem está no celular toca e escolhe entre a galeria e a câmera.
 */
export function AreaDeAnexos({ arquivos, onArquivos, onRemover, cargo, desabilitado }: {
  arquivos: File[];
  onArquivos: (novos: File[]) => void;
  onRemover: (indice: number) => void;
  cargo: string | null | undefined;
  desabilitado?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  function receber(lista: FileList | File[] | null) {
    const bons = arquivosQueCabem(lista, cargo);
    if (bons.length) onArquivos(bons);
    if (inputRef.current) inputRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={desabilitado}
        onClick={() => !desabilitado && inputRef.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !desabilitado) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); }}
        onDrop={e => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setArrastando(false);
          receber(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          arrastando ? 'border-primary bg-primary/[0.06]' : 'border-border hover:border-primary/50 hover:bg-accent/40',
          desabilitado && 'pointer-events-none opacity-60',
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ImagePlus className="w-5 h-5" />
        </span>
        <p className="text-sm font-medium">
          {arrastando ? 'Solte para anexar' : 'Anexe prints, fotos ou arquivos'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Clique para escolher, arraste para cá ou cole um print com <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">Ctrl+V</kbd>
          {' '}· até 10 MB cada
        </p>
      </div>

      {/* No celular, a câmera direto: `capture` abre a câmera em vez da galeria. */}
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => cameraRef.current?.click()}
        className="md:hidden inline-flex items-center gap-1.5 text-xs font-medium text-primary"
      >
        <Camera className="w-3.5 h-3.5" /> Tirar foto agora
      </button>

      <input ref={inputRef} type="file" multiple className="hidden" accept={TIPOS_ACEITOS}
        onChange={e => receber(e.target.files)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => receber(e.target.files)} />

      <PreviasPendentes arquivos={arquivos} onRemover={onRemover} />
    </div>
  );
}

// ── Mostrar anexos já enviados ───────────────────────────────────────────────

export function IconeDoTipo({ tipo, className }: { tipo: string; className?: string }) {
  if (tipo.startsWith('audio/')) return <Music className={className} />;
  if (tipo.startsWith('video/')) return <Video className={className} />;
  return <FileText className={className} />;
}

/**
 * Um anexo dentro do balão da conversa. Imagem aparece e amplia ao clicar;
 * áudio e vídeo tocam ali mesmo; o resto vira link.
 */
export function AnexoNaConversa({ anexo, onAmpliar }: {
  anexo: AnexoTicket;
  onAmpliar: (anexo: AnexoTicket) => void;
}) {
  const { url, falhou } = useUrlAssinada(anexo.url);
  if (!url) {
    return (
      <span className="flex items-center gap-1.5 text-xs opacity-80">
        <FileText className="w-3.5 h-3.5" /> {anexo.nome}{falhou ? ' — sem acesso ao anexo' : ''}
      </span>
    );
  }
  if (ehImagem(anexo)) {
    return (
      <button type="button" onClick={() => onAmpliar(anexo)} className="block cursor-zoom-in" title="Ampliar">
        <img src={url} alt={anexo.nome} loading="lazy"
          className="max-h-56 rounded-lg border border-border/60 object-contain bg-background" />
      </button>
    );
  }
  if (anexo.tipo.startsWith('audio/')) {
    return <audio controls preload="none" src={url} className="w-full max-w-xs" />;
  }
  if (anexo.tipo.startsWith('video/')) {
    return <video controls preload="none" src={url} className="max-h-56 rounded-lg border border-border/60" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 text-xs underline underline-offset-2">
      <FileText className="w-3.5 h-3.5" /> {anexo.nome}
    </a>
  );
}

/** Miniatura quadrada, para o cartão do pedido e a aba «Arquivos». */
export function MiniaturaAnexo({ anexo, onAmpliar, className }: {
  anexo: AnexoTicket;
  onAmpliar: (anexo: AnexoTicket) => void;
  className?: string;
}) {
  const { url, falhou } = useUrlAssinada(anexo.url);
  const base = cn(
    'group relative block overflow-hidden rounded-lg border border-border bg-muted aspect-square',
    className,
  );

  if (ehImagem(anexo)) {
    return (
      <button type="button" onClick={() => url && onAmpliar(anexo)} className={cn(base, 'cursor-zoom-in')}
        title={anexo.nome} aria-label={`Ampliar ${anexo.nome}`}>
        {url ? (
          <img src={url} alt={anexo.nome} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full items-center justify-center p-2 text-[10px] text-muted-foreground text-center">
            {falhou ? 'sem acesso' : 'carregando…'}
          </span>
        )}
      </button>
    );
  }

  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" title={anexo.nome}
      className={cn(base, 'flex flex-col items-center justify-center gap-1.5 p-2 text-center hover:border-primary/40',
        !url && 'pointer-events-none')}>
      <IconeDoTipo tipo={anexo.tipo} className="w-6 h-6 text-muted-foreground" />
      <span className="text-[10px] leading-tight break-all line-clamp-2">{anexo.nome}</span>
      {!!anexo.tamanho && <span className="text-[9px] text-muted-foreground">{tamanhoLegivel(anexo.tamanho)}</span>}
    </a>
  );
}

/** Uma linha da lista de arquivos que não são imagem: ícone, nome, tamanho e de quem veio. */
export function LinhaDeArquivo({ anexo, legenda }: { anexo: AnexoTicket; legenda: string }) {
  const { url, falhou } = useUrlAssinada(anexo.url);
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors',
        url ? 'hover:border-primary/40 hover:bg-accent/40' : 'pointer-events-none opacity-70',
      )}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <IconeDoTipo tipo={anexo.tipo} className="w-4 h-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{anexo.nome}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          {[tamanhoLegivel(anexo.tamanho), legenda, falhou ? 'sem acesso' : ''].filter(Boolean).join(' · ')}
        </span>
      </span>
      {url && <Download className="w-4 h-4 shrink-0 text-muted-foreground" />}
    </a>
  );
}

// ── Visualizador ─────────────────────────────────────────────────────────────

/**
 * As fotos do ticket em tela cheia.
 *
 * Recebe a lista inteira (e não só a imagem clicada) para as setas passarem de
 * um print para o outro — é assim que se compara «antes» e «depois».
 */
export function VisualizadorDeImagens({ imagens, indice, onIndice, onFechar }: {
  imagens: { anexo: AnexoTicket; legenda: string }[];
  indice: number | null;
  onIndice: (i: number) => void;
  onFechar: () => void;
}) {
  const aberto = indice !== null && indice >= 0 && indice < imagens.length;
  const atual = aberto ? imagens[indice] : null;

  const ir = useCallback((passo: number) => {
    if (indice === null || !imagens.length) return;
    onIndice((indice + passo + imagens.length) % imagens.length);
  }, [indice, imagens.length, onIndice]);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); ir(-1); }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, ir]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 gap-0 bg-black/95 border-0 text-white flex flex-col [&>button]:text-white">
        <DialogTitle className="sr-only">{atual?.anexo.nome ?? 'Imagem'}</DialogTitle>
        <DialogDescription className="sr-only">Use as setas para ver as outras imagens do ticket.</DialogDescription>
        {atual && <ImagemAmpliada anexo={atual.anexo} />}
        {atual && (
          <div className="flex items-center gap-3 px-4 py-2.5 text-xs border-t border-white/10">
            <span className="truncate font-medium">{atual.anexo.nome}</span>
            <span className="text-white/60 truncate hidden sm:inline">{atual.legenda}</span>
            <span className="ml-auto font-mono text-white/60 tabular-nums">{(indice ?? 0) + 1} / {imagens.length}</span>
            <LinkBaixar anexo={atual.anexo} />
          </div>
        )}
        {imagens.length > 1 && (
          <>
            <button type="button" onClick={() => ir(-1)} aria-label="Imagem anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button type="button" onClick={() => ir(1)} aria-label="Próxima imagem"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20">
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImagemAmpliada({ anexo }: { anexo: AnexoTicket }) {
  const { url } = useUrlAssinada(anexo.url);
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-4 md:px-16">
      {url
        ? <img src={url} alt={anexo.nome} className="max-h-full max-w-full object-contain rounded" />
        : <span className="text-sm text-white/60">carregando…</span>}
    </div>
  );
}

function LinkBaixar({ anexo }: { anexo: AnexoTicket }) {
  const { url } = useUrlAssinada(anexo.url);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" download={anexo.nome}
      className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
      <Download className="w-3.5 h-3.5" /> Abrir original
    </a>
  );
}
