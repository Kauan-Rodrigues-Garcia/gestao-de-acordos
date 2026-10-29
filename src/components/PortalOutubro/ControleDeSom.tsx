/**
 * ControleDeSom.tsx — o volume do mural (pedido de 29/10/2026: «deixar uma
 * opção de ajustar o som desde o início da animação até o mural»). Fica no
 * canto de baixo à esquerda da abertura, da Coisa e do mural; o alto-falante
 * tira e devolve o som, e a barra regula. Vale para tudo o que a trilha toca
 * (`coisa/trilha.ts`) e fica guardado neste navegador.
 */
import { useRef } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { mudarVolumeDoPortal, useVolumeDoPortal } from './coisa/trilha';

export function ControleDeSom() {
  const volume = useVolumeDoPortal();
  /** O volume de antes de tirar o som, para devolver. */
  const antes = useRef(volume > 0 ? volume : 1);
  const Icone = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="portal-som" data-portal-anima data-portal-fora>
      <button
        type="button"
        className="portal-som-botao"
        onClick={() => mudarVolumeDoPortal(volume > 0 ? 0 : antes.current)}
        aria-label={volume > 0 ? 'Tirar o som' : 'Ligar o som'}
        title={volume > 0 ? 'Tirar o som' : 'Ligar o som'}
      >
        <Icone />
      </button>
      <input
        type="range"
        className="portal-som-barra"
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        onChange={e => {
          const v = Number(e.target.value) / 100;
          if (v > 0) antes.current = v;
          mudarVolumeDoPortal(v);
        }}
        aria-label="Volume do mural"
      />
      <span className="portal-som-numero">{Math.round(volume * 100)}%</span>
    </div>
  );
}
