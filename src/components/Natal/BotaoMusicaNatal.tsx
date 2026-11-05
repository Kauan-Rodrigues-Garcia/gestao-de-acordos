import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music2, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { entrarNaRadio, fecharAvisoDaMusica, ligarMusica, mudarVolume, sairDaRadio, useMusicaNatal } from './musica';
import './musica.css';

/**
 * O botão da música de Natal, ao lado do sino. Só ligar/desligar e o volume:
 * a música é uma rádio, igual para todos ao mesmo tempo — ver `musica.ts`.
 *
 * O volume é uma barra sem número (Cleber, 04/11/2026): baixo de um lado,
 * alto do outro — e o «alto» é, por trás, 25% do volume (`TETO_DO_VOLUME`).
 *
 * O `Layout` só o monta com o tema de Natal ligado. Montado, volta a tocar se
 * a pessoa tinha deixado ligada; desmontado, silencia sem mexer na escolha.
 */
export function BotaoMusicaNatal() {
  const { ligada, volume, tocando, aviso } = useMusicaNatal();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    entrarNaRadio();
    return sairDaRadio;
  }, []);

  const IconeVolume = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <>
      <Popover open={aberto} onOpenChange={v => { setAberto(v); if (v) fecharAvisoDaMusica(); }}>
        <PopoverTrigger asChild>
          <button
            ref={botao}
            type="button"
            className={cn(
              'nt-musica-botao relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              ligada && 'ligada',
              aviso && 'avisando',
            )}
            title={ligada ? 'Música de Natal — tocando' : 'Música de Natal'}
            aria-label={ligada ? 'Música de Natal, ligada' : 'Música de Natal, desligada'}
          >
            {ligada && tocando
              ? <span className="nt-musica-eq" aria-hidden><span /><span /><span /></span>
              : <Music2 className="h-4 w-4" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
          <div className="nt-musica-topo px-4 pb-3 pt-4">
            <p className="text-sm font-semibold text-foreground">Música de Natal</p>
            <p className="mt-0.5 text-xs text-muted-foreground">A mesma para todo mundo, ao mesmo tempo.</p>
          </div>
          <div className="space-y-4 px-4 py-3.5">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">{ligada ? 'Tocando' : 'Desligada'}</span>
              <Switch checked={ligada} onCheckedChange={ligarMusica} aria-label="Tocar a música de Natal" />
            </label>
            <div>
              <div className="flex items-center gap-3">
                <IconeVolume className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <Slider
                  value={[volume]} min={0} max={100} step={1}
                  onValueChange={([v]) => mudarVolume(v)}
                  aria-label="Volume da música de Natal"
                  aria-valuetext={volume === 0 ? 'mudo' : volume < 34 ? 'baixo' : volume < 67 ? 'médio' : 'alto'}
                  className="flex-1"
                />
              </div>
              <div className="mt-1.5 flex justify-between pl-7 text-[11px] text-muted-foreground">
                <span>Baixo</span>
                <span>Alto</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/80">Festive Lobby Music · Fortnite</p>
          </div>
        </PopoverContent>
      </Popover>
      {aviso && !aberto && <AvisoDaMusica botao={botao} aoAbrir={() => setAberto(true)} />}
    </>
  );
}

/**
 * Uma vez, depois da abertura do presente: um balão apontando para o botão,
 * dizendo que dá para desligar e que o volume nunca fica alto. Fica até a
 * pessoa responder (Cleber, 04/11/2026: sumia sozinho antes de dar para ler).
 */
function AvisoDaMusica({ botao, aoAbrir }: { botao: React.RefObject<HTMLButtonElement | null>; aoAbrir: () => void }) {
  const [ponto, setPonto] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const r = botao.current?.getBoundingClientRect();
      if (r && r.width) setPonto({ x: r.left + r.width / 2, y: r.bottom + 12 });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [botao]);

  if (!ponto) return null;
  // O balão fica à esquerda da seta (o botão mora no canto direito do topo).
  const largura = 300;
  const esquerda = Math.max(12, Math.min(window.innerWidth - largura - 12, ponto.x - largura + 34));
  return createPortal(
    <div className="nt-musica-aviso" role="status" style={{ left: esquerda, top: ponto.y, width: largura }}>
      <span className="nt-musica-aviso-seta" style={{ left: ponto.x - esquerda }} aria-hidden />
      <p className="nt-musica-aviso-titulo"><span aria-hidden>🎵</span> A música de Natal está tocando</p>
      <p className="nt-musica-aviso-texto">
        Se preferir, é só desligar aqui neste botão. Você também escolhe o volume —
        ele vai do baixinho ao moderado e nunca fica alto.
      </p>
      <div className="nt-musica-aviso-acoes">
        <button type="button" onClick={fecharAvisoDaMusica}>Entendi</button>
        <button type="button" className="principal" onClick={() => { fecharAvisoDaMusica(); aoAbrir(); }}>Ajustar agora</button>
      </div>
    </div>,
    document.body,
  );
}
