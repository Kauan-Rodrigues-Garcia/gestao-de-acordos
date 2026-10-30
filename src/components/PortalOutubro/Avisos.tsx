/**
 * Avisos.tsx — o que o portal escreve na tela durante a revelação (pedido de
 * 29/10/2026):
 *
 *   até os 2 min   o relógio pequeno, logo abaixo da barra: «O mural abre em
 *                  04:59» (o bueiro, a água e o barco vêm junto)
 *   nos 2 min      a mão sai com o barco e o relógio pula para o lado do
 *                  bueiro, pequeno, com o «Participar» e o X: «o botão de
 *                  participar pequeno e o timer também, do lado do bueiro,
 *                  para não atrapalhar quem não vai participar». Fechando,
 *                  fica só o bueiro. Participando, o efeito sonoro e o botão
 *                  vira «Você está dentro»
 *   depois         o botão do mural na barra de cima (`BotaoDoMural`): só o
 *                  visual, sem os bichos
 *
 * No estilo das placas das insígnias (`Insignias/insignias.css`): noite, borda
 * em degrau, letra de fliperama. Só os botões pegam clique.
 */
import { X } from 'lucide-react';
import { AGUA_MS, relogioDaContagem, type EstadoDoPortal } from './fases';
import { abrirMural, fecharConvite, participar, useConviteFechado, useParticipa } from './estado';
import { destravarSom, tocarSomDaCoisa } from './coisa/trilha';
import { BARCO, PALETA_DO_BARCO } from './coisa/arte';
import { Pixel } from './Bueiro';
import { ControleDeSom } from './ControleDeSom';

/** Os 2 minutos com a mão segurando o barco: o relógio, o «Participar» e o X, do lado do bueiro. */
function Convite({ faltaMs }: { faltaMs: number }) {
  const participa = useParticipa();
  const entrar = () => {
    // O clique destrava o som do navegador: a revelação já começa com ele.
    destravarSom();
    participar();
    tocarSomDaCoisa('risada', 1, 0.6);
  };
  return (
    <div className="portal-convite" role="status" aria-live="polite" data-portal-anima data-portal-fora>
      <span className="portal-convite-tempo" title="O mural vai ser revelado">{relogioDaContagem(faltaMs)}</span>
      {participa ? (
        <>
          <span className="portal-convite-dentro">✓ Você está dentro</span>
          {/* O volume já aqui, na barra: a revelação começa no ponto. */}
          <ControleDeSom embutido />
        </>
      ) : (
        <button type="button" className="portal-convite-botao" onClick={entrar} title="Assistir à revelação do mural">Participar</button>
      )}
      <button type="button" className="portal-convite-fechar" onClick={fecharConvite} aria-label="Fechar" title="Fechar">
        <X />
      </button>
    </div>
  );
}

export function Avisos({ estado }: { estado: EstadoDoPortal }) {
  const fechado = useConviteFechado();
  const nosDoisMinutos = estado.fase === 'final' && (estado.noFinalMs ?? 0) >= AGUA_MS;
  if (nosDoisMinutos) return fechado ? null : <Convite faltaMs={estado.faltaMs} />;
  if (estado.fase === 'espreitando' || estado.fase === 'final') {
    return (
      <div className="portal-aviso portal-placa" role="status" data-portal-fora>
        <span className="portal-aviso-texto">O mural abre em</span>
        <span className="portal-aviso-numero">{relogioDaContagem(estado.faltaMs)}</span>
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
