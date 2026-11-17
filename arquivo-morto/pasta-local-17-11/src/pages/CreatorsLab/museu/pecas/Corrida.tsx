/**
 * Peça: uma largada da Corrida da Sorte, encenada.
 *
 * Três bichinhos, três raias, um botão de largar. Quem corre são «Corredor A»,
 * «B» e «C» — ninguém de verdade — e não há prêmio, histórico nem placar: cada
 * largada é sorteada na hora e esquecida na seguinte.
 *
 * O deslocamento é uma transição de CSS em `left`, com a duração sorteada por
 * raia. Com movimento reduzido a regra geral do Lab zera as transições, e os
 * três simplesmente aparecem na chegada — a ordem continua anunciada em texto.
 */
import { useEffect, useRef, useState } from 'react';
import { thumb } from '@/components/Corrida/motor/bichinhos';
import { useCreators } from '../../theme/CreatorsProvider';
import { BICHINHOS_DO_MUSEU, CORREDORES_DO_MUSEU } from '../bichinhos';

type Fase = 'parado' | 'correndo' | 'chegou';

/** Entre 2,2 s e 3,6 s por raia. */
function sortearTempos(): number[] {
  return CORREDORES_DO_MUSEU.map(() => 2200 + Math.random() * 1400);
}

export default function PecaCorrida() {
  const { tokens } = useCreators();
  const c = tokens.cores;
  const [fase, setFase] = useState<Fase>('parado');
  const [tempos, setTempos] = useState<number[]>(() => CORREDORES_DO_MUSEU.map(() => 0));
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const largar = () => {
    const novos = sortearTempos();
    setTempos(novos);
    setFase('correndo');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFase('chegou'), Math.max(...novos) + 150);
  };

  const voltar = () => setFase('parado');
  const vencedor = tempos.indexOf(Math.min(...tempos));

  return (
    <div>
      <div className="creators-lab__pista" aria-label="Pista fictícia com três raias">
        {CORREDORES_DO_MUSEU.map((nome, i) => (
          <div key={nome} className="creators-lab__raia">
            <span className="creators-lab__raia-nome">{nome}</span>
            <img
              src={thumb(BICHINHOS_DO_MUSEU[i], 44)}
              alt=""
              width={44}
              height={44}
              className="creators-lab__corredor"
              style={{
                left: fase === 'parado' ? '0%' : 'calc(100% - 44px)',
                transitionDuration: fase === 'parado' ? '0s' : `${tempos[i]}ms`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="creators-lab__btn"
          onClick={fase === 'chegou' ? voltar : largar}
          disabled={fase === 'correndo'}
        >
          {fase === 'chegou' ? 'voltar para a largada' : fase === 'correndo' ? 'correndo...' : 'largar'}
        </button>
        <p className="creators-lab__mono text-[.7rem]" style={{ color: c.textoSuave }} aria-live="polite">
          {fase === 'chegou'
            ? `${CORREDORES_DO_MUSEU[vencedor]} cruzou primeiro. Não valia nada.`
            : 'Corredores de mentira, sem prêmio.'}
        </p>
      </div>
    </div>
  );
}
