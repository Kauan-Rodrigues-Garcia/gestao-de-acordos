/**
 * TrechoMusica — qual pedaço da música toca na festa.
 *
 * Pedido do Cleber, 15/10/2026: escolher onde a música "solta", de acordo com
 * o tempo da festa. A linha do tempo é a música inteira; a faixa destacada é o
 * que vai tocar (começo escolhido + duração da festa). Arrastar move a faixa,
 * os botões dão o ajuste fino e "Ouvir este trecho" toca exatamente aquilo.
 *
 * O começo fica gravado na festa (`design.somInicioS`), não na música: a mesma
 * música pode soltar no refrão numa festa e na introdução em outra.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pausarPrevia, tocarPrevia } from '@/lib/previaSom';
import {
  formatarSegundos, inicioMaximo, inicioPeloPonto,
} from '@/pages/Comemoracoes/trechoAudio';

/** Duração real do arquivo — só o navegador sabe, depois de ler o cabeçalho. */
function useDuracaoDoAudio(url: string): number | null | 'erro' {
  const [duracao, setDuracao] = useState<number | null | 'erro'>(null);
  useEffect(() => {
    setDuracao(null);
    const audio = new Audio();
    audio.preload = 'metadata';
    const pronto = () => setDuracao(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 'erro');
    const falhou = () => setDuracao('erro');
    audio.addEventListener('loadedmetadata', pronto);
    audio.addEventListener('error', falhou);
    audio.src = url;
    return () => {
      audio.removeEventListener('loadedmetadata', pronto);
      audio.removeEventListener('error', falhou);
      audio.src = '';
    };
  }, [url]);
  return duracao;
}

export function TrechoMusica({
  url, inicio, duracaoS, volume, tocando, onMudar,
}: {
  url:      string;
  inicio:   number;
  /** Duração da festa: é por este tempo que a música toca. */
  duracaoS: number;
  volume:   number;
  /** URL da prévia que está tocando agora (de `ouvirPrevia`). */
  tocando:  string | null;
  onMudar:  (inicio: number) => void;
}) {
  const total = useDuracaoDoAudio(url);
  const barraRef = useRef<HTMLDivElement>(null);
  const totalS = typeof total === 'number' ? total : 0;
  const maximo = inicioMaximo(totalS, duracaoS);

  // Festa ficou mais longa (ou a música é outra): a faixa volta para dentro.
  useEffect(() => {
    if (typeof total === 'number' && inicio > maximo) onMudar(maximo);
  }, [total, inicio, maximo, onMudar]);

  if (total === 'erro') {
    return <p className="text-[11px] text-muted-foreground">Não deu para ler esta música para escolher o trecho. Ela toca do começo.</p>;
  }
  if (total === null) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Lendo a música…
      </p>
    );
  }

  /**
   * Mexeu no trecho pela tela: o que estava tocando era o trecho de antes, e
   * continuar seria ouvir a coisa errada — para na hora.
   */
  function mudarPelaTela(novo: number) {
    if (tocando === url) pausarPrevia();
    onMudar(novo);
  }

  const fim = Math.min(totalS, inicio + duracaoS);
  const esquerda = (inicio / totalS) * 100;
  const largura = Math.max(1.5, ((fim - inicio) / totalS) * 100);
  const tocandoEsta = tocando === url;

  function pelaPosicao(clientX: number) {
    const r = barraRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    mudarPelaTela(inicioPeloPonto((clientX - r.left) / r.width, totalS, duracaoS));
  }

  function aoApertar(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    pelaPosicao(e.clientX);
    const mover = (ev: PointerEvent) => pelaPosicao(ev.clientX);
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  const passo = (delta: number) => mudarPelaTela(Math.min(maximo, Math.max(0, Math.round((inicio + delta) * 10) / 10)));

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold">Trecho que toca</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          <strong className="text-foreground">{formatarSegundos(inicio)} → {formatarSegundos(fim)}</strong>
          {' '}· {Math.round(fim - inicio)}s de {formatarSegundos(totalS)}
        </p>
      </div>

      {/* A música inteira; a faixa clara é o que a festa toca. */}
      <div ref={barraRef} role="slider" tabIndex={0}
        aria-label="Começo do trecho" aria-valuemin={0} aria-valuemax={Math.round(maximo)}
        aria-valuenow={Math.round(inicio)} aria-valuetext={`Começa em ${formatarSegundos(inicio)}`}
        onPointerDown={aoApertar}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); passo(-1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); passo(1); }
        }}
        className="relative h-10 cursor-pointer touch-none select-none overflow-hidden rounded-lg bg-background ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {/* Riscos de "onda" só para a barra parecer música; não é a forma real do áudio. */}
        <div aria-hidden="true" className="absolute inset-0 flex items-center gap-[2px] px-1 opacity-40">
          {Array.from({ length: 64 }, (_, i) => (
            <span key={i} className="flex-1 rounded-full bg-muted-foreground"
              style={{ height: `${25 + 60 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))}%` }} />
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-y-0 rounded-md border-2 border-primary bg-primary/25"
          style={{ left: `${esquerda}%`, width: `${largura}%` }}>
          <span className="absolute inset-y-1 left-1 w-1 rounded-full bg-primary" />
          <span className="absolute inset-y-1 right-1 w-1 rounded-full bg-primary" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={inicio <= 0}
          onClick={() => passo(-5)}>−5s</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={inicio >= maximo}
          onClick={() => passo(5)}>+5s</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={inicio === 0}
          onClick={() => mudarPelaTela(0)}>Do começo</Button>
        <Button type="button" size="sm" className={cn('ml-auto h-7 gap-1 px-2.5 text-xs')}
          onClick={() => tocarPrevia(url, { inicio, duracao: duracaoS, volume })}>
          {tocandoEsta ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {tocandoEsta ? 'Parar' : 'Ouvir este trecho'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Arraste a faixa até a parte da música que deve soltar quando a festa aparecer.</p>
    </div>
  );
}
