/**
 * Avisos.tsx — as plaquinhas do portal, no alto da tela, logo abaixo da barra:
 *
 *   quinta   «Amanhã, às 16h.» — aparece ao abrir o app e, de dez em dez
 *            minutos, por um minuto e meio (hora do portal)
 *   sexta    a contagem: «O mural abre em 03:12:45»
 *   final    (29/10/2026) o barco caiu e a mão saiu com ele: «O mural vai
 *            ser revelado», os 2 minutos e o botão «Participar». Quem
 *            participa assiste à revelação quando zera; os outros ganham o
 *            botão do mural na barra (`BotaoDoMural`) na mesma hora
 *   depois   o botão do mural na barra de cima: só o visual, sem os bichos
 *
 * No estilo das placas das insígnias (`Insignias/insignias.css`): noite, borda
 * em degrau, letra de fliperama. Só os botões pegam clique.
 */
import { useEffect, useState } from 'react';
import { MAO_SAI_MS, relogioDaContagem, type EstadoDoPortal } from './fases';
import { abrirMural, participar, useParticipa } from './estado';
import { destravarSom, tocarSomDaCoisa } from './coisa/trilha';
import { BARCO, PALETA_DO_BARCO } from './coisa/arte';
import { Pixel } from './Bueiro';

const BILHETE_A_CADA_MS = 10 * 60_000;
const BILHETE_DURA_MS = 90_000;
const BILHETE_AO_ABRIR_MS = 20_000;

/** Os 2 minutos com a mão segurando o barco: a mensagem, a contagem e o «Participar». */
function ContagemFinal({ faltaMs }: { faltaMs: number }) {
  const participa = useParticipa();
  const entrar = () => {
    // O clique destrava o som do navegador: a revelação já começa com ele.
    destravarSom();
    participar();
    tocarSomDaCoisa('risada', 1, 0.5);
  };
  return (
    <div className="portal-final portal-placa" role="status" aria-live="polite" data-portal-anima>
      <p className="portal-final-selo">O mural de outubro</p>
      <p className="portal-final-texto">O mural vai ser revelado</p>
      <p className="portal-final-tempo">{relogioDaContagem(faltaMs)}</p>
      {participa ? (
        <p className="portal-final-dentro">Você está dentro. Deixe esta aba aberta: a revelação começa quando zerar.</p>
      ) : (
        <>
          <button type="button" className="portal-botao portal-final-botao" onClick={entrar}>Participar</button>
          <p className="portal-final-nota">Quem participa assiste à revelação. Quem não, vê o mural depois, pelo botão na barra.</p>
        </>
      )}
    </div>
  );
}

export function Avisos({ agora, estado }: { agora: number; estado: EstadoDoPortal }) {
  const [recemAberto, setRecemAberto] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setRecemAberto(false), BILHETE_AO_ABRIR_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (estado.fase === 'final') {
    // Enquanto o barco boia e cai, nada: a contagem entra com a mão.
    return (estado.noFinalMs ?? 0) >= MAO_SAI_MS ? <ContagemFinal faltaMs={estado.faltaMs} /> : null;
  }
  if (estado.contagem) {
    return (
      <div className="portal-aviso portal-placa" role="status">
        <span className="portal-aviso-texto">O mural abre em</span>
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

/** O botão pequeno na barra de cima: abre só o visual do mural. */
export function BotaoDoMural() {
  return (
    <button type="button" className="portal-botao-do-mural" onClick={() => abrirMural()} title="Abrir o mural de outubro">
      <Pixel linhas={BARCO} paleta={PALETA_DO_BARCO} tam={2} />
      <span>Mural de outubro</span>
    </button>
  );
}
