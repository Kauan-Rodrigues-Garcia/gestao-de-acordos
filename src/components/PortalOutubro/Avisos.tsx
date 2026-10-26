/**
 * Avisos.tsx — as plaquinhas do portal, no alto da tela, logo abaixo da barra:
 *
 *   quinta   «Amanhã, às 16h.» — aparece ao abrir o app e, de dez em dez
 *            minutos, por um minuto e meio (hora do portal)
 *   sexta    a contagem: «O portal abre em 03:12:45»
 *   16h−1min a contagem vai para o meio da tela, grande
 *   depois   o botão «Rever o mural de outubro» (quem já viu a abertura)
 *
 * No estilo das placas das insígnias (`Insignias/insignias.css`): noite, borda
 * em degrau, letra de fliperama. Só o botão pega clique.
 */
import { useEffect, useState } from 'react';
import { relogioDaContagem, type EstadoDoPortal } from './fases';
import { abrirMural } from './estado';

const BILHETE_A_CADA_MS = 10 * 60_000;
const BILHETE_DURA_MS = 90_000;
const BILHETE_AO_ABRIR_MS = 20_000;

export function Avisos({ agora, estado }: { agora: number; estado: EstadoDoPortal }) {
  const [recemAberto, setRecemAberto] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setRecemAberto(false), BILHETE_AO_ABRIR_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (estado.fase === 'ultimoMinuto') {
    return (
      <div className="portal-aviso-centro" aria-live="polite">
        <p className="portal-aviso-texto">O portal está abrindo</p>
        <p className="portal-aviso-grande">{relogioDaContagem(estado.faltaMs)}</p>
      </div>
    );
  }
  if (estado.contagem) {
    return (
      <div className="portal-aviso portal-placa" role="status">
        <span className="portal-aviso-texto">O portal abre em</span>
        <span className="portal-aviso-numero">{relogioDaContagem(estado.faltaMs)}</span>
      </div>
    );
  }
  if (estado.bilhete && (recemAberto || agora % BILHETE_A_CADA_MS < BILHETE_DURA_MS)) {
    return (
      <div className="portal-aviso portal-placa portal-bilhete" role="status">
        <span className="portal-aviso-texto">Amanhã, às 16h.</span>
      </div>
    );
  }
  return null;
}

export function BotaoRever() {
  return (
    <button type="button" className="portal-aviso portal-placa portal-rever" onClick={() => abrirMural(0)}>
      <span className="portal-aviso-texto">Rever o mural de outubro</span>
    </button>
  );
}
