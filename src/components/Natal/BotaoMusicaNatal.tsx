import { useEffect } from 'react';
import { Music2, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { entrarNaRadio, ligarMusica, mudarVolume, sairDaRadio, useMusicaNatal } from './musica';
import './musica.css';

/**
 * O botão da música de Natal, ao lado do sino. Só ligar/desligar e o volume:
 * a música é uma rádio, igual para todos ao mesmo tempo — ver `musica.ts`.
 *
 * O `Layout` só o monta com o tema de Natal ligado. Montado, volta a tocar se
 * a pessoa tinha deixado ligada; desmontado, silencia sem mexer na escolha.
 */
export function BotaoMusicaNatal() {
  const { ligada, volume, tocando } = useMusicaNatal();

  useEffect(() => {
    entrarNaRadio();
    return sairDaRadio;
  }, []);

  const IconeVolume = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'nt-musica-botao relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ligada && 'ligada',
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
          <div className="flex items-center gap-3">
            <IconeVolume className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Slider
              value={[volume]} min={0} max={100} step={1}
              onValueChange={([v]) => mudarVolume(v)}
              aria-label="Volume da música de Natal"
              className="flex-1"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{volume}%</span>
          </div>
          <p className="text-[11px] text-muted-foreground/80">Festive Lobby Music · Fortnite</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
