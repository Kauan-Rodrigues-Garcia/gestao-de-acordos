/**
 * AreaDeTrabalho — a tela do computador fictício.
 * ─────────────────────────────────────────────────────────────────────────────
 * Papel de parede, ícones, janelas e barra de tarefas. É a casca: nenhum
 * programa é importado aqui. Cada um entra por `import()` quando é aberto pela
 * primeira vez (ver `programas.ts`), então quem abre só o terminal não baixa o
 * fliperama.
 *
 * ## Quem decide o quê
 *
 *  • a regra das janelas (abertas, pilha, foco, limite da tela) é o redutor
 *    puro de `lib/janelas.ts` — este arquivo só despacha ações;
 *  • a aparência é do tema, por tokens e pelos atributos `data-*` da raiz;
 *  • "é celular?" é uma medida só (`ehCelular`), que liga o comportamento
 *    (sem arrastar, um programa por vez) e o desenho (`data-celular`) juntos.
 *
 * ## A medida vem do elemento, não da janela do navegador
 *
 * Um `ResizeObserver` na própria mesa. Ele dispara ao redimensionar, ao girar
 * o celular e quando a barra de endereço do navegador móvel some — três casos
 * que o evento `resize` cobre de forma desigual. A cada medida nova, a área
 * útil é recalculada e o redutor reencaixa todas as janelas.
 */
import {
  Component, Suspense, lazy, memo, useCallback, useEffect, useMemo, useReducer,
  useRef, useState, type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { areaUtil, ehCelular, estadoInicial, reduzir } from '../lib/janelas';
import { useCreators } from '../theme/CreatorsProvider';
import type { IdPrograma } from '../theme/themes';
import { BarraTarefas } from './BarraTarefas';
import { MesaCtx, type ContextoMesa } from './contexto';
import { Icone } from './Icone';
import { Janela } from './Janela';
import { PROGRAMAS, programa } from './programas';

// Só entra na rede se o papel de parede do tema pedir partículas.
const CampoParticulas = lazy(() =>
  import('../components/CampoParticulas').then(m => ({ default: m.CampoParticulas })));

/**
 * Um programa que não carregou não pode derrubar a área de trabalho.
 *
 * Cada programa é um pedaço separado na rede. Se a conexão cair entre abrir o
 * Lab e abrir o terceiro programa, o `import()` falha — e sem esta barreira o
 * erro subiria até desmontar a tela inteira. Com ela, a janela mostra o erro
 * e as outras continuam funcionando.
 */
class BarreiraDoPrograma extends Component<
  { children: ReactNode; aviso: string },
  { quebrou: boolean }
> {
  state = { quebrou: false };

  static getDerivedStateFromError() { return { quebrou: true }; }

  render() {
    if (this.state.quebrou) {
      return (
        <p className="creators-lab__carregando" role="alert">
          {this.props.aviso} — feche a janela e abra de novo.
        </p>
      );
    }
    return this.props.children;
  }
}

/**
 * O conteúdo de uma janela.
 *
 * `memo` com o id como única propriedade: arrastar uma janela despacha uma
 * ação por movimento do ponteiro, e sem isto cada movimento re-renderizaria o
 * conteúdo de TODAS as janelas abertas — fliperama e Math Lab incluídos.
 */
const ConteudoPrograma = memo(function ConteudoPrograma({ id }: { id: IdPrograma }) {
  const { tokens } = useCreators();
  const p = programa(id);
  if (!p) return null;

  return (
    <BarreiraDoPrograma aviso={tokens.vocab.erro}>
      <Suspense fallback={<p className="creators-lab__carregando">{tokens.vocab.carregando}</p>}>
        <p.Componente />
      </Suspense>
    </BarreiraDoPrograma>
  );
});

export function AreaDeTrabalho({ aoDesligar }: { aoDesligar: () => void }) {
  const { tokens, movimentoReduzido } = useCreators();
  const mesaRef = useRef<HTMLDivElement | null>(null);

  const [tela, setTela] = useState(() => ({
    l: typeof window === 'undefined' ? 1280 : window.innerWidth,
    a: typeof window === 'undefined' ? 720 : window.innerHeight,
  }));

  useEffect(() => {
    const el = mesaRef.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      // Mesma medida de antes: não troca o estado, não re-renderiza.
      setTela(t => (t.l === r.width && t.a === r.height ? t : { l: r.width, a: r.height }));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const celular = ehCelular(tela.l);
  const area = useMemo(
    () => areaUtil(tela, tokens.barra),
    [tela, tokens.barra],
  );

  const [estado, despachar] = useReducer(reduzir, area, estadoInicial);

  // Tela ou tema mudaram: a área útil muda, e as janelas são reencaixadas.
  useEffect(() => { despachar({ tipo: 'redimensionarArea', area }); }, [area]);

  const abrir = useCallback((id: IdPrograma) => {
    const p = programa(id);
    if (p) despachar({ tipo: 'abrir', id, l: p.largura, a: p.altura });
  }, []);

  const focar     = useCallback((id: string) => despachar({ tipo: 'focar', id }), []);
  const fechar    = useCallback((id: string) => despachar({ tipo: 'fechar', id }), []);
  const minimizar = useCallback((id: string) => despachar({ tipo: 'minimizar', id }), []);
  const maximizar = useCallback((id: string) => despachar({ tipo: 'alternarMaximizada', id }), []);
  const mover     = useCallback(
    (id: string, x: number, y: number) => despachar({ tipo: 'mover', id, x, y }), []);

  // O botão da barra: traz a janela, ou a recolhe se ela já é a do foco.
  const focoRef = useRef(estado.foco);
  focoRef.current = estado.foco;
  const alternar = useCallback((id: string) => {
    despachar(focoRef.current === id ? { tipo: 'minimizar', id } : { tipo: 'focar', id });
  }, []);

  // ── Efeito do comando `matrix` ──
  const [matrixLigado, setMatrixLigado] = useState(false);
  const matrixTimer = useRef<number | null>(null);
  const matrix = useCallback(() => {
    setMatrixLigado(true);
    if (matrixTimer.current !== null) window.clearTimeout(matrixTimer.current);
    matrixTimer.current = window.setTimeout(() => setMatrixLigado(false), 2600);
  }, []);
  useEffect(() => () => {
    if (matrixTimer.current !== null) window.clearTimeout(matrixTimer.current);
  }, []);

  const mesa = useMemo<ContextoMesa>(
    () => ({ abrir, desligar: aoDesligar, matrix, celular }),
    [abrir, aoDesligar, matrix, celular],
  );

  /*
   * Luz que segue o ponteiro, no papel de parede.
   *
   * Escreve em duas variáveis CSS em vez de mexer em `style.left/top`: variável
   * usada por um gradiente não dispara recálculo de layout, e o `pointermove`
   * é passivo porque nada aqui cancela o evento.
   */
  useEffect(() => {
    if (movimentoReduzido) return;
    const el = mesaRef.current;
    if (!el) return;

    let frame: number | null = null;
    let px = 0, py = 0;
    const aplicar = () => {
      frame = null;
      el.style.setProperty('--creator-mx', `${px}px`);
      el.style.setProperty('--creator-my', `${py}px`);
    };
    const aoMover = (e: PointerEvent) => {
      px = e.clientX; py = e.clientY;
      // Um quadro por movimento, no máximo.
      if (frame === null) frame = requestAnimationFrame(aplicar);
    };

    window.addEventListener('pointermove', aoMover, { passive: true });
    return () => {
      window.removeEventListener('pointermove', aoMover);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [movimentoReduzido]);

  const nomes = tokens.vocab.programas;

  return (
    <MesaCtx.Provider value={mesa}>
      <div ref={mesaRef} className="creators-lab__mesa" data-celular={celular}>
        {/* ── Papel de parede ── */}
        <div className="creators-lab__papel" aria-hidden="true">
          <div className="creators-lab__papel-camada creators-lab__papel-camada--a" />
          <div className="creators-lab__papel-camada creators-lab__papel-camada--b" />
          <div className="creators-lab__papel-camada creators-lab__papel-camada--c" />
          {tokens.papel.particulas && !movimentoReduzido && (
            <Suspense fallback={null}>
              <CampoParticulas
                cor={tokens.cores.primaria}
                corLigacao={tokens.cores.secundaria}
                densidade={celular ? 0.45 : 1}
              />
            </Suspense>
          )}
          <span className="creators-lab__papel-marca">{tokens.vocab.sistema}</span>
        </div>

        {/* ── Ícones ── */}
        <div className="creators-lab__icones" role="list" aria-label="Programas">
          {PROGRAMAS.map(p => (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className="creators-lab__icone"
              onClick={() => abrir(p.id)}
              title={nomes[p.id]}
            >
              <span className="creators-lab__icone-desenho"><Icone id={p.icone} /></span>
              <span>{nomes[p.id]}</span>
            </button>
          ))}
        </div>

        {/* ── Janelas ── */}
        <div className="creators-lab__janelas">
          {estado.janelas.map((j, ordem) => {
            const p = programa(j.id);
            if (!p) return null;
            return (
              <Janela
                key={j.id}
                janela={j}
                area={estado.area}
                ordem={ordem}
                foco={estado.foco === j.id}
                celular={celular}
                titulo={nomes[p.id]}
                icone={p.icone}
                simbolos={tokens.janela.simbolos}
                rotuloVoltar="voltar"
                aoFocar={focar}
                aoFechar={fechar}
                aoMinimizar={minimizar}
                aoMaximizar={maximizar}
                aoMover={mover}
              >
                <ConteudoPrograma id={p.id} />
              </Janela>
            );
          })}
        </div>

        <BarraTarefas estado={estado} aoAbrir={abrir} aoAlternar={alternar} />

        {/* Efeito do comando `matrix`. Curto, e nunca com movimento reduzido. */}
        <AnimatePresence>
          {matrixLigado && !movimentoReduzido && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.75 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-[95]"
              aria-hidden="true"
              style={{
                background:
                  'repeating-linear-gradient(180deg, rgba(0,255,120,.16) 0 2px, transparent 2px 5px)',
                mixBlendMode: 'screen',
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </MesaCtx.Provider>
  );
}
