/**
 * EditorTrecho — de onde a música começa.
 *
 * Aparece depois de o líder escolher o arquivo e antes de o upload acontecer:
 * é melhor descobrir que o ponto ficou errado agora do que com a música já na
 * biblioteca.
 *
 * Só o INÍCIO é escolhido aqui. Quanto tempo toca é a duração da comemoração —
 * ter duas durações diferentes deixaria uma delas sobrando.
 *
 * A prévia toca de um `blob:` local, porque o arquivo ainda não subiu: não
 * gasta rede e não deixa lixo no bucket se a pessoa desistir.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Square, Loader2, Music, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  limitarInicio, sobraApos, formatarSegundos, SOBRA_MIN_S,
} from './trechoAudio';

/** Quanto da música a prévia toca, para dar ideia sem prender o líder. */
const PREVIA_S = 12;

export function EditorTrecho({
  arquivo, enviando, duracaoComemoracaoS, onConfirmar, onCancelar,
}: {
  arquivo:  File;
  enviando: boolean;
  /** Duração escolhida no formulário — é por este tempo que a música tocará. */
  duracaoComemoracaoS: number;
  onConfirmar: (inicio: number) => void;
  onCancelar:  () => void;
}) {
  const [urlLocal, setUrlLocal] = useState<string | null>(null);
  const [duracaoTotal, setDuracaoTotal] = useState<number | null>(null);
  const [inicio, setInicio] = useState(0);
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
  // cabeçalho. Até lá o controle fica desabilitado.
  useEffect(() => {
    if (!urlLocal) return;
    const audio = new Audio(urlLocal);
    audioRef.current = audio;

    const aoCarregar = () => {
      setDuracaoTotal(Number.isFinite(audio.duration) ? audio.duration : 0);
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

  function ouvir() {
    const audio = audioRef.current;
    if (!audio || duracaoTotal === null) return;
    parar();
    audio.currentTime = inicio;
    // Mesmo volume da comemoração, para a prévia não enganar.
    audio.volume = 0.35;
    void audio.play().catch(() => {});
    setTocando(true);
    timerRef.current = setTimeout(parar, PREVIA_S * 1000);
  }

  function ajustar(valor: number) {
    if (duracaoTotal === null) return;
    parar();
    setInicio(limitarInicio(valor, duracaoTotal));
  }

  const carregando = duracaoTotal === null;
  const sobra = duracaoTotal === null ? 0 : sobraApos(inicio, duracaoTotal);
  // A música acaba antes de a comemoração terminar: o resto toca em silêncio.
  const curtaDemais = !carregando && sobra < duracaoComemoracaoS;

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !enviando) { parar(); onCancelar(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            Onde a música começa
          </DialogTitle>
          <DialogDescription>
            Ela vai tocar por {duracaoComemoracaoS}s, o tempo da comemoração.
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
                  Começa em <strong>{formatarSegundos(inicio)}</strong>
                </Label>
                <input
                  type="range" min={0} max={Math.max(0, duracaoTotal - SOBRA_MIN_S)} step={0.5}
                  value={inicio}
                  onChange={(e) => ajustar(Number(e.target.value))}
                  className="h-6 w-full accent-primary"
                />
              </div>

              {curtaDemais && (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  Daqui até o fim só sobram {Math.round(sobra)}s de música, e a
                  comemoração dura {duracaoComemoracaoS}s. O resto fica em silêncio —
                  escolha um ponto mais no começo ou encurte a comemoração.
                </p>
              )}

              <Button type="button" variant="outline" size="sm" className="w-full gap-2"
                onClick={tocando ? parar : ouvir}>
                {tocando ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {tocando ? 'Parar' : `Ouvir ${PREVIA_S}s a partir daqui`}
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
            onClick={() => { parar(); onConfirmar(inicio); }}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar na biblioteca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
