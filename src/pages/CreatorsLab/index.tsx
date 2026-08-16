/**
 * CreatorsLab — a área escondida.
 * ─────────────────────────────────────────────────────────────────────────────
 * Chega-se aqui por `/creators`, e a rota não está em menu nenhum. O caminho
 * normal é clicar cinco vezes rápido no logo do Gestão — ver
 * `useEasterEggCriadores`.
 *
 * ## Isolamento
 *
 * Tudo vive dentro de `.creators-lab`, com as variáveis `--creator-*` aplicadas
 * NESTE elemento e não em `:root`. Nenhuma regra deste módulo alcança o
 * Dashboard, o Login ou os modais do Gestão.
 *
 * ## Custo para quem nunca vem aqui
 *
 * A página inteira entra por `lazy()` no roteador, e o campo de partículas e o
 * núcleo 3D só são importados depois que o Lab abre. Quem usa o Gestão e nunca
 * descobre o Easter Egg não baixa nada disto.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import './creators-lab.css';
import { CreatorsProvider, useCreators } from './theme/CreatorsProvider';
import { variaveisCss, type TemaCreators } from './theme/themes';
import { BootSequence } from './sections/BootSequence';
import { RealitySelect } from './sections/RealitySelect';
import { CreatorsHero } from './sections/CreatorsHero';
import { PersonalDatabase } from './sections/PersonalDatabase';
import { ProjectArchive } from './sections/ProjectArchive';
import { CodePlayground } from './sections/CodePlayground';
import { MathLab } from './sections/MathLab';
import { SecretTerminal } from './sections/SecretTerminal';
import { DevStatus } from './sections/DevStatus';
import { ContatoSecao } from './sections/ContatoSecao';
import { FinalSecret } from './sections/FinalSecret';
import { PainelConquistas } from './components/PainelConquistas';
import { AvisoConquista } from './components/AvisoConquista';
import { BarraLab } from './components/BarraLab';

// Só entram na rede depois que o Lab abre.
const CampoParticulas = lazy(() =>
  import('./components/CampoParticulas').then(m => ({ default: m.CampoParticulas })));

type Etapa = 'boot' | 'realidade' | 'lab';

function LabInterno() {
  const navigate = useNavigate();
  const {
    tema, tokens, trocarTema, progresso, registrar, movimentoReduzido,
  } = useCreators();

  // Quem já escolheu uma realidade antes pula direto para o conteúdo.
  const [etapa, setEtapa] = useState<Etapa>('boot');
  const [conquistasAbertas, setConquistasAbertas] = useState(false);
  const [matrixLigado, setMatrixLigado] = useState(false);
  const raizRef = useRef<HTMLDivElement | null>(null);

  const estilo = useMemo(() => variaveisCss(tokens) as React.CSSProperties, [tokens]);

  /** Menos partículas em tela pequena — e nenhuma com movimento reduzido. */
  const densidade = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.45 : 1;

  useEffect(() => { registrar({ entrou: true, temasVistos: [tema] }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Luz que segue o cursor.
   *
   * Escreve em duas variáveis CSS em vez de mexer em `style.left/top`: variável
   * de cor/posição usada por um gradiente não dispara recálculo de layout, e o
   * `pointermove` é passivo porque nada aqui cancela o evento.
   */
  useEffect(() => {
    if (movimentoReduzido) return;
    const raiz = raizRef.current;
    if (!raiz) return;

    let frame: number | null = null;
    let px = 0, py = 0;

    const aplicar = () => {
      frame = null;
      raiz.style.setProperty('--creator-mx', `${px}px`);
      raiz.style.setProperty('--creator-my', `${py}px`);
    };

    const aoMover = (e: PointerEvent) => {
      px = e.clientX; py = e.clientY;
      // Um quadro por movimento, no máximo — sem isto o handler roda dezenas
      // de vezes por quadro em mouses de alta taxa.
      if (frame === null) frame = requestAnimationFrame(aplicar);
    };

    window.addEventListener('pointermove', aoMover, { passive: true });
    return () => {
      window.removeEventListener('pointermove', aoMover);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [movimentoReduzido]);

  const sair = useCallback(() => navigate('/'), [navigate]);

  const escolherRealidade = useCallback((t: TemaCreators) => {
    trocarTema(t);
    setEtapa('lab');
  }, [trocarTema]);

  const dispararMatrix = useCallback(() => {
    setMatrixLigado(true);
    window.setTimeout(() => setMatrixLigado(false), 2600);
  }, []);

  return (
    <div
      ref={raizRef}
      className="creators-lab"
      data-tema={tema}
      style={estilo}
    >
      {/* ── Fundo ── */}
      <div className="creators-lab__fundo" aria-hidden="true">
        <div className="creators-lab__grade" />
        {!movimentoReduzido && <div className="creators-lab__luz" />}
        <div className="creators-lab__textura" />
        {etapa === 'lab' && !movimentoReduzido && (
          <Suspense fallback={null}>
            <CampoParticulas
              cor={tokens.cores.primaria}
              corLigacao={tokens.cores.secundaria}
              densidade={densidade}
            />
          </Suspense>
        )}
      </div>

      {/* ── Conteúdo ── */}
      <div className="creators-lab__conteudo">
        <AnimatePresence mode="wait">
          {etapa === 'boot' && (
            <BootSequence
              key="boot"
              movimentoReduzido={movimentoReduzido}
              aoTerminar={() => setEtapa('realidade')}
            />
          )}

          {etapa === 'realidade' && (
            <RealitySelect
              key="realidade"
              aoEscolher={escolherRealidade}
              movimentoReduzido={movimentoReduzido}
            />
          )}
        </AnimatePresence>

        {etapa === 'lab' && (
          <motion.main
            initial={movimentoReduzido ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-6xl px-4 pb-32 pt-20 sm:px-6"
          >
            <CreatorsHero />
            <PersonalDatabase />
            <ProjectArchive />
            <CodePlayground />
            <MathLab />
            <SecretTerminal
              aoSair={sair}
              aoTrocarTema={trocarTema}
              aoMatrix={dispararMatrix}
              aoAbrirConquistas={() => setConquistasAbertas(true)}
            />
            <DevStatus />
            <ContatoSecao />
            <FinalSecret aoSair={sair} />
          </motion.main>
        )}

        {etapa === 'lab' && (
          <BarraLab
            aoSair={sair}
            aoAbrirConquistas={() => setConquistasAbertas(true)}
            totalConquistas={progresso.entrou ? undefined : undefined}
          />
        )}
      </div>

      {/* ── Sobreposições ── */}
      <PainelConquistas
        aberto={conquistasAbertas}
        aoFechar={() => setConquistasAbertas(false)}
      />
      <AvisoConquista />

      {/* Efeito do comando `matrix`. Curto, e nunca com movimento reduzido. */}
      <AnimatePresence>
        {matrixLigado && !movimentoReduzido && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.75 }} exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[95]"
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
  );
}

export default function CreatorsLab() {
  return (
    <CreatorsProvider>
      <LabInterno />
    </CreatorsProvider>
  );
}
