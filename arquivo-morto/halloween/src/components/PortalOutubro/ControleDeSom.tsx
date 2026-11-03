/**
 * ControleDeSom.tsx — o volume do mural (pedido de 29/10/2026: «deixar uma
 * opção de ajustar o som desde o início da animação até o mural»): o
 * alto-falante tira e devolve o som, e a barra regula. Vale para tudo o que a
 * trilha toca (`coisa/trilha.ts`) e fica guardado neste navegador.
 *
 * Desde 30/10 ele fica no alto, à esquerda («o botão de volume transferido
 * para a parte superior»), e durante a animação tem o X ao lado: «quando a
 * pessoa clicar vai ter uma mensagem de pular animação, tem certeza? e um
 * botão para confirmar». Confirmando, vai direto ao mural (`pularAnimacao`).
 * O Esc abre a mesma pergunta. `embutido`: a versão pequena, dentro do
 * convite da contagem, na barra de cima.
 */
import { useEffect, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { VOLUME_PADRAO, calarSonsDaCoisa, mudarVolumeDoPortal, useVolumeDoPortal } from './coisa/trilha';
import { pularAnimacao } from './estado';

export function ControleDeSom({ pular = false, embutido = false }: {
  /** Durante a animação: o X para pular, com a confirmação. */
  pular?: boolean;
  embutido?: boolean;
}) {
  const volume = useVolumeDoPortal();
  /** O volume de antes de tirar o som, para devolver. */
  const antes = useRef(volume > 0 ? volume : VOLUME_PADRAO);
  const [confirmando, setConfirmando] = useState(false);
  const Icone = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // O Esc pergunta se quer pular (e, perguntando, desiste).
  useEffect(() => {
    if (!pular) { setConfirmando(false); return; }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmando(c => !c); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [pular]);

  const confirmar = () => {
    setConfirmando(false);
    calarSonsDaCoisa(300);
    pularAnimacao();
  };

  return (
    <div className={embutido ? 'portal-som portal-som-embutido' : pular ? 'portal-som' : 'portal-som portal-som-quieto'} data-portal-anima data-portal-fora>
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
      {!embutido && <span className="portal-som-numero">{Math.round(volume * 100)}%</span>}
      {pular && (
        <button type="button" className="portal-som-pular" onClick={() => setConfirmando(true)} aria-label="Pular a animação" title="Pular a animação">
          <X />
        </button>
      )}
      {pular && confirmando && (
        <div className="portal-som-confirma" role="alertdialog" aria-label="Pular a animação">
          <p className="portal-som-confirma-titulo">Pular a animação?</p>
          <p className="portal-som-confirma-texto">Tem certeza? Você vai direto para o mural.</p>
          <div className="portal-som-confirma-botoes">
            <button type="button" className="portal-som-confirma-sim" onClick={confirmar} autoFocus>Pular</button>
            <button type="button" className="portal-som-confirma-nao" onClick={() => setConfirmando(false)}>Continuar assistindo</button>
          </div>
        </div>
      )}
    </div>
  );
}
