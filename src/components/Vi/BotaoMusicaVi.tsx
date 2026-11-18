import { useEffect } from 'react';
import { Music2, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { entrarNaMusicaVi, ligarMusicaVi, mudarVolumeVi, sairDaMusicaVi, useMusicaVi } from './musica';
import './vi.css';

/**
 * O botão da música do GTA VI, no lugar onde fica o da música de Natal (ao
 * lado do sino): ligar/desligar e o volume — ver `musica.ts`.
 *
 * O `Layout` só o monta com o tema ligado. Montado, a música volta a tocar se
 * a pessoa tinha deixado ligada (quem ativou pelo convite chega aqui com ela
 * já tocando); desmontado, ela some aos poucos sem mexer na escolha.
 */
export function BotaoMusicaVi() {
  const { ligada, volume, tocando } = useMusicaVi();

  useEffect(() => {
    entrarNaMusicaVi();
    return sairDaMusicaVi;
  }, []);

  const IconeVolume = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'vi-musica-botao relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ligada && 'ligada',
          )}
          title={ligada ? 'Música do GTA VI — tocando' : 'Música do GTA VI'}
          aria-label={ligada ? 'Música do GTA VI, ligada' : 'Música do GTA VI, desligada'}
        >
          {ligada && tocando
            ? <span className="vi-musica-eq" aria-hidden="true"><span /><span /><span /></span>
            : <Music2 className="h-4 w-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        <div className="vi-musica-topo px-4 pb-3 pt-4">
          <p className="text-sm font-semibold text-foreground">Música do GTA VI</p>
          <p className="mt-0.5 text-xs text-muted-foreground">A trilha do primeiro trailer do jogo.</p>
        </div>
        <div className="space-y-4 px-4 py-3.5">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">{ligada ? 'Tocando' : 'Desligada'}</span>
            <Switch checked={ligada} onCheckedChange={ligarMusicaVi} aria-label="Tocar a música do GTA VI" />
          </label>
          <div>
            <div className="flex items-center gap-3">
              <IconeVolume className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <Slider
                value={[volume]} min={0} max={100} step={1}
                onValueChange={([v]) => mudarVolumeVi(v)}
                aria-label="Volume da música do GTA VI"
                aria-valuetext={volume === 0 ? 'mudo' : volume < 34 ? 'baixo' : volume < 67 ? 'médio' : 'alto'}
                className="flex-1"
              />
            </div>
            <div className="mt-1.5 flex justify-between pl-7 text-[11px] text-muted-foreground">
              <span>Baixo</span>
              <span>Alto</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/80">Love Is a Long Road · Tom Petty</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
