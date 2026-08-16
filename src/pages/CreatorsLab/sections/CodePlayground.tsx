/**
 * CodePlayground — o "compilador" que constrói algo de verdade no fim.
 *
 * O código na tela é FIXO e o resultado é encenado — nada é avaliado. A regra
 * é a mesma do terminal: nenhum `eval`, nenhuma `Function`, nenhuma entrada do
 * usuário virando execução.
 *
 * O que salva a encenação de ser só texto é o fim: ao terminar, uma grade se
 * monta de verdade na tela, peça por peça. A "compilação" é falsa; a construção
 * que ela dispara é real.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab } from '../components/SecaoLab';

const CODIGO = `const creators = ["Kauan", "Cleber"];

creators.forEach(dev => {
  buildSomethingAwesome(dev);
});`;

const PASSOS = [
  '> compiling...',
  '> Kauan loaded ✓',
  '> Cleber loaded ✓',
  '> resolving dependencies...',
  '> building...',
];

const CELULAS = 24;

export function CodePlayground() {
  const { tokens, movimentoReduzido } = useCreators();
  const [estado, setEstado] = useState<'parado' | 'rodando' | 'pronto'>('parado');
  const [passo, setPasso] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Todo timer criado aqui é registrado e limpo na saída — sem isso, sair da
  // página no meio da "compilação" deixaria callbacks tentando mexer em estado
  // de um componente desmontado.
  const agendar = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const rodar = useCallback(() => {
    if (estado === 'rodando') return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setEstado('rodando');
    setPasso(0);
    setProgresso(0);

    const passoMs = movimentoReduzido ? 90 : 260;
    PASSOS.forEach((_, i) => agendar(() => setPasso(i + 1), passoMs * (i + 1)));

    const inicioBarra = passoMs * PASSOS.length;
    for (let p = 0; p <= 100; p += 5) {
      agendar(() => setProgresso(p), inicioBarra + p * (movimentoReduzido ? 2 : 7));
    }
    agendar(() => setEstado('pronto'), inicioBarra + 100 * (movimentoReduzido ? 2 : 7) + 200);
  }, [estado, agendar, movimentoReduzido]);

  const arcade = tokens.id === 'arcade';

  return (
    <SecaoLab
      id="playground"
      rotulo={tokens.vocab.playground}
      titulo={arcade ? 'TRAINING MODE' : 'CODE PLAYGROUND'}
      descricao="O código é fixo e a compilação é encenada. O que se monta no fim, não."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="creators-lab__painel p-4">
          <pre className="creators-lab__mono overflow-x-auto text-xs leading-relaxed"
               style={{ color: tokens.cores.texto }}>
            <code>{CODIGO}</code>
          </pre>
          <button
            className="creators-lab__btn mt-4"
            onClick={rodar}
            disabled={estado === 'rodando'}
            style={estado === 'rodando' ? { opacity: 0.5, cursor: 'wait' } : undefined}
          >
            {estado === 'rodando' ? '...' : `▶ ${arcade ? 'START' : 'RUN'}`}
          </button>
        </div>

        <div className="creators-lab__painel p-4">
          <div className="creators-lab__mono min-h-[7rem] text-xs" aria-live="polite">
            {PASSOS.slice(0, passo).map((p, i) => (
              <p key={i} style={{ color: p.includes('✓') ? tokens.cores.acento : tokens.cores.textoSuave }}>
                {p}
              </p>
            ))}
            {progresso > 0 && (
              <>
                <div className="creators-lab__barra mt-3">
                  <span style={{ width: `${progresso}%` }} />
                </div>
                <p className="mt-1" style={{ color: tokens.cores.primaria }}>{progresso}%</p>
              </>
            )}
            {estado === 'pronto' && (
              <p className="mt-2 font-bold" style={{ color: tokens.cores.acento }}>
                {arcade ? 'PERFECT!' : 'BUILD SUCCESSFUL'}
              </p>
            )}
          </div>

          {/* A construção real: a grade se monta célula por célula. */}
          <div className="mt-4 grid grid-cols-8 gap-1">
            {Array.from({ length: CELULAS }).map((_, i) => (
              <motion.span
                key={i}
                initial={false}
                animate={estado === 'pronto'
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 0.08, scale: 0.6 }}
                transition={{
                  delay: estado === 'pronto' && !movimentoReduzido ? i * 0.03 : 0,
                  duration: 0.3,
                }}
                className="aspect-square"
                style={{
                  background: i % 3 === 0 ? tokens.cores.primaria : tokens.cores.acento,
                  borderRadius: tokens.raio,
                }}
                aria-hidden
              />
            ))}
          </div>
        </div>
      </div>
    </SecaoLab>
  );
}
