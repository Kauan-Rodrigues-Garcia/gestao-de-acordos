/**
 * Janela — a moldura de um programa.
 * ─────────────────────────────────────────────────────────────────────────────
 * Só a casca: barra de título, botões e o corpo onde o programa mora. ONDE a
 * janela fica, quem está por cima e quem tem o foco é decidido por
 * `lib/janelas.ts`; aqui o ponteiro vira ação e a ação volta como posição.
 *
 * ## Arrastar
 *
 * O arrasto usa captura de ponteiro na barra de título: o movimento continua
 * chegando mesmo quando o cursor sai da barra (ou da janela do navegador), e
 * não é preciso pendurar ouvinte no `window`. A posição pedida é a de partida
 * mais o deslocamento — quem limita à tela é o redutor, não este arquivo.
 *
 * ## Minimizada não é desmontada
 *
 * Uma janela minimizada fica com `hidden`, e o programa continua montado: o
 * histórico do terminal, a partida em andamento e o experimento escolhido no
 * Math Lab estão lá quando ela volta.
 *
 * ## No celular
 *
 * Não existe arrastar: a janela ocupa a tela (o CSS cuida disso por
 * `data-celular`) e os botões de janela dão lugar a um só, o de voltar.
 */
import { memo, useMemo, useRef, type ReactNode } from 'react';
import { retanguloNaTela, type Janela as EstadoJanela, type Retangulo } from '../lib/janelas';
import type { TokensTema } from '../theme/themes';
import { JanelaCtx, type ContextoJanela } from './contexto';
import { Icone } from './Icone';
import type { IdIcone } from './icones';

export interface JanelaProps {
  janela: EstadoJanela;
  area: Retangulo;
  /** Posição na pilha: 0 é a de baixo. */
  ordem: number;
  foco: boolean;
  celular: boolean;
  titulo: string;
  icone: IdIcone;
  simbolos: TokensTema['janela']['simbolos'];
  rotuloVoltar: string;
  aoFocar: (id: string) => void;
  aoFechar: (id: string) => void;
  aoMinimizar: (id: string) => void;
  aoMaximizar: (id: string) => void;
  aoMover: (id: string, x: number, y: number) => void;
  children: ReactNode;
}

/** As janelas ficam acima dos ícones e abaixo da barra de tarefas (z 40). */
const Z_BASE = 10;

export const Janela = memo(function Janela({
  janela, area, ordem, foco, celular, titulo, icone, simbolos, rotuloVoltar,
  aoFocar, aoFechar, aoMinimizar, aoMaximizar, aoMover, children,
}: JanelaProps) {
  const { id } = janela;
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const rolagemRef = useRef<HTMLDivElement | null>(null);
  const arrasto = useRef<{ ponteiro: number; px: number; py: number; x: number; y: number } | null>(null);

  const contexto = useMemo<ContextoJanela>(() => ({ palcoRef, rolagemRef }), []);
  const r = retanguloNaTela(janela, area);

  const aoApertar = (e: React.PointerEvent<HTMLDivElement>) => {
    // Botão dentro da barra é botão, não alça de arrasto.
    if ((e.target as HTMLElement).closest('button')) return;
    if (celular || janela.maximizada || e.button !== 0) return;

    arrasto.current = { ponteiro: e.pointerId, px: e.clientX, py: e.clientY, x: janela.x, y: janela.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoArrastar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrasto.current;
    if (!a || a.ponteiro !== e.pointerId) return;
    aoMover(id, a.x + (e.clientX - a.px), a.y + (e.clientY - a.py));
  };

  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (arrasto.current?.ponteiro !== e.pointerId) return;
    arrasto.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className="creators-lab__janela"
      role="dialog"
      aria-label={titulo}
      data-foco={foco}
      data-programa={id}
      hidden={janela.minimizada}
      style={{
        transform: `translate(${r.x}px, ${r.y}px)`,
        width: r.l,
        height: r.a,
        zIndex: Z_BASE + ordem,
      }}
      /* Captura: qualquer clique dentro traz a janela para a frente, antes de
         o programa receber o evento — e sem impedir que ele receba. */
      onPointerDownCapture={foco ? undefined : () => aoFocar(id)}
    >
      <div className="creators-lab__janela-quadro">
        <div
          className="creators-lab__janela-titulo"
          onPointerDown={aoApertar}
          onPointerMove={aoArrastar}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onDoubleClick={celular ? undefined : e => {
            if (!(e.target as HTMLElement).closest('button')) aoMaximizar(id);
          }}
        >
          {celular && (
            <button
              type="button"
              className="creators-lab__janela-voltar"
              onClick={() => aoFechar(id)}
            >
              ← {rotuloVoltar}
            </button>
          )}

          <Icone id={icone} />
          <span className="creators-lab__janela-nome">{titulo}</span>

          {!celular && (
            <span className="creators-lab__janela-botoes">
              <button
                type="button"
                className="creators-lab__janela-botao"
                onClick={() => aoMinimizar(id)}
                aria-label={`Minimizar ${titulo}`}
                title="Minimizar"
              >
                {simbolos.minimizar}
              </button>
              <button
                type="button"
                className="creators-lab__janela-botao"
                onClick={() => aoMaximizar(id)}
                aria-label={janela.maximizada ? `Restaurar ${titulo}` : `Maximizar ${titulo}`}
                title={janela.maximizada ? 'Restaurar' : 'Maximizar'}
              >
                {janela.maximizada ? simbolos.restaurar : simbolos.maximizar}
              </button>
              <button
                type="button"
                className="creators-lab__janela-botao creators-lab__janela-botao--fechar"
                onClick={() => aoFechar(id)}
                aria-label={`Fechar ${titulo}`}
                title="Fechar"
              >
                {simbolos.fechar}
              </button>
            </span>
          )}
        </div>

        <div ref={palcoRef} className="creators-lab__janela-corpo">
          <div ref={rolagemRef} className="creators-lab__janela-rolagem">
            <JanelaCtx.Provider value={contexto}>
              {children}
            </JanelaCtx.Provider>
          </div>
        </div>
      </div>
    </div>
  );
});
