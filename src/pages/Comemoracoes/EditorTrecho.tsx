/**
 * EditorTrecho — escolher qual pedaço da música toca.
 *
 * Aparece depois de o líder escolher o arquivo e antes de o upload acontecer:
 * é melhor descobrir que o trecho ficou errado agora do que com a música já na
 * biblioteca.
 *
 * O arquivo ainda não subiu, então a prévia toca de um `blob:` local — sem
 * gastar rede e sem deixar lixo no bucket se a pessoa desistir.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Square, Loader2, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  limitarTrecho, trechoSugerido, fimDoTrecho, formatarSegundos,
  TRECHO_MAX_S, TRECHO_MIN_S, type Trecho,
} from './trechoAudio';

export function EditorTrecho({
  arquivo, enviando, onConfirmar, onCancelar,
}: {
  arquivo:     File;
  enviando:    boolean;
  onConfirmar: (trecho: Trecho) => void;
  onCancelar:  () => void;
}) {
  const [urlLocal, setUrlLocal] = useState<string | null>(null);
  const [duracaoTotal, setDuracaoTotal] = useState<number | null>(null);
  const [trecho, setTrecho] = useState<Trecho>({ inicio: 0, duracao: 30 });
  const [tocando, setTocando] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL local do arquivo escolhido. Revogada no cleanup — sem isso o blob fica
  // preso na memória da aba até um F5.
  useEffect(() => {
    const url = URL.createObjectURL(arquivo);
    setUrlLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  // Duração real do arquivo: só o navegador sabe, e só depois de ler o
  // cabeçalho. Até lá os controles ficam desabilitados.
  useEffect(() => {
    if (!urlLocal) return;
    const audio = new Audio(urlLocal);
    audioRef.current = audio;

    const aoCarregar = () => {
      const total = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuracaoTotal(total);
      setTrecho(trechoSugerido(total));
    };
    audio.addEventListener('loadedmetadata', aoCarregar);
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', aoCarregar);
      audio.pause();
      audioRef.current = null;
    };
  }, [urlLocal]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function parar() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    audioRef.current?.pause();
    setTocando(false);
  }

  function ouvirTrecho() {
    const audio = audioRef.current;
    if (!audio || duracaoTotal === null) return;
    parar();
    audio.currentTime = trecho.inicio;
    audio.volume = 0.7;
    void audio.play().catch(() => {});
    setTocando(true);
    timerRef.current = setTimeout(parar, trecho.duracao * 1000);
  }

  function ajustar(mudanca: Partial<Trecho>) {
    if (duracaoTotal === null) return;
    parar();
    setTrecho(limitarTrecho({ ...trecho, ...mudanca }, duracaoTotal));
  }

  const carregando = duracaoTotal === null;
  // Início não pode passar do ponto em que ainda cabe o trecho mínimo.
  const inicioMax = Math.max(0, (duracaoTotal ?? 0) - TRECHO_MIN_S);
  const duracaoMax = Math.min(TRECHO_MAX_S, Math.max(TRECHO_MIN_S, (duracaoTotal ?? 0) - trecho.inicio));

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !enviando) { parar(); onCancelar(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />
            Escolha o trecho
          </DialogTitle>
          <DialogDescription>
            Só este pedaço vai tocar na comemoração — no máximo {TRECHO_MAX_S} segundos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="truncate text-xs text-muted-foreground">
            {arquivo.name}
            {duracaoTotal !== null && ` · ${formatarSegundos(duracaoTotal)}`}
          </p>

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo a música…
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Começa em <strong>{formatarSegundos(trecho.inicio)}</strong>
                </Label>
                <input
                  type="range" min={0} max={inicioMax} step={0.5}
                  value={trecho.inicio}
                  onChange={(e) => ajustar({ inicio: Number(e.target.value) })}
                  className="h-6 w-full accent-primary"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Toca por <strong>{Math.round(trecho.duracao)}s</strong>
                  <span className="ml-1 text-muted-foreground">
                    (até {formatarSegundos(fimDoTrecho(trecho))})
                  </span>
                </Label>
                <input
                  type="range" min={TRECHO_MIN_S} max={duracaoMax} step={1}
                  value={trecho.duracao}
                  onChange={(e) => ajustar({ duracao: Number(e.target.value) })}
                  className="h-6 w-full accent-primary"
                />
              </div>

              <Button type="button" variant="outline" size="sm" className="w-full gap-2"
                onClick={tocando ? parar : ouvirTrecho}>
                {tocando ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {tocando ? 'Parar' : 'Ouvir o trecho'}
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={enviando}
            onClick={() => { parar(); onCancelar(); }}>
            Cancelar
          </Button>
          <Button disabled={carregando || enviando}
            onClick={() => { parar(); onConfirmar(trecho); }}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar na biblioteca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
