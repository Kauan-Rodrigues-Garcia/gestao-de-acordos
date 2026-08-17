/**
 * GabineteFliperama — o móvel. Só o móvel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cabeça inclinada com marquise, grade de alto-falante, moldura funda em volta
 * do tubo, painel de controle com manche e botões, frente com ranhura de ficha,
 * pés separados do chão. Referência: arte vetorial de gabinete retrô azul.
 *
 * Este arquivo não sabe o que é uma bola, um tijolo ou uma vida. Recebe a tela
 * como `children`, avisa quando alguém aperta um botão e mostra o manche onde
 * lhe mandarem. Trocar o jogo de dentro não encosta aqui.
 *
 * As formas estão em `creators-lab.css`, sob `.creators-lab__maquina*`.
 */
import { forwardRef, type ReactNode } from 'react';

export interface GabineteProps {
  /** O que aparece no tubo. */
  children: ReactNode;
  /** Texto da marquise. */
  titulo: string;
  /** Selo entre as ranhuras de ficha. */
  selo: string;
  /** Piscar da marquise — desligado com movimento reduzido. */
  piscar: boolean;
  /** Botão vermelho grande: ação principal (sacar, recomeçar). */
  aoAcionar: () => void;
  rotuloAcao: string;
  /** Verdadeiro enquanto a câmera está em cima da máquina. */
  focado: boolean;
}

/**
 * `forwardRef` porque quem calcula o enquadramento precisa medir ESTE
 * elemento — a conta da câmera parte de `getBoundingClientRect` do móvel
 * inteiro, não do tubo nem do container da seção.
 */
export const GabineteFliperama = forwardRef<HTMLDivElement, GabineteProps>(
  function GabineteFliperama(
    { children, titulo, selo, piscar, aoAcionar, rotuloAcao, focado }, ref,
  ) {
    return (
      <div
        ref={ref}
        className={`creators-lab__maquina${focado ? ' creators-lab__maquina--focada' : ''}`}
      >
        <div className="creators-lab__maquina-cabeca">
          <div className="creators-lab__marquise">
            <span className={piscar ? 'creators-lab__piscar' : undefined}>{titulo}</span>
          </div>
          <div className="creators-lab__lampadas" aria-hidden="true">
            {Array.from({ length: 11 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </div>

        <div className="creators-lab__maquina-grade" aria-hidden="true" />

        <div className="creators-lab__maquina-moldura">
          <div className="creators-lab__vidro">{children}</div>
        </div>

        <div className="creators-lab__maquina-painel">
          {/* Decorativo: o manche acompanha a raquete, mas quem joga usa mouse,
              toque ou setas. Por isso `aria-hidden` — anunciar um controle que
              não recebe foco só atrapalha quem navega por leitor de tela. */}
          <div className="creators-lab__manche" aria-hidden="true"><i /><b /></div>

          <div className="creators-lab__botoes">
            <button
              type="button"
              className="creators-lab__botao-fisico"
              onClick={aoAcionar}
              aria-label={rotuloAcao}
              title={rotuloAcao}
            />
            {/* O segundo botão faz a MESMA coisa. Painel de fliperama tem dois
                botões; fingir que um deles é enfeite seria pior que ligar os
                dois no mesmo lugar. */}
            <button
              type="button"
              className="creators-lab__botao-fisico"
              onClick={aoAcionar}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </div>

        <div className="creators-lab__maquina-frente">
          <span className="creators-lab__ficha-slot" aria-hidden="true" />
          <span className="creators-lab__maquina-selo">{selo}</span>
          <span className="creators-lab__ficha-slot" aria-hidden="true" />
        </div>

        <div className="creators-lab__maquina-pes" aria-hidden="true">
          <span /><span />
        </div>
      </div>
    );
  },
);
