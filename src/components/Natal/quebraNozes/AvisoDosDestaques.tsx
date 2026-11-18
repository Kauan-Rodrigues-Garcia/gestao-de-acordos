/**
 * O aviso com sirene, no alto da tela, nos 5 segundos antes da chamada dos
 * destaques (Cleber, 18/11/2026). Conta sozinho para o palco não redesenhar a
 * cada segundo. Quem chega com menos de 2 s para o começo vê o aviso sem a sirene.
 */
import { memo, useEffect, useState } from 'react';
import { AVISO_DOS_DESTAQUES_MS } from './agenda';
import { tocarSom } from './sons';

const MINIMO_PARA_A_SIRENE_MS = 2_000;

export const AvisoDosDestaques = memo(function AvisoDosDestaques({ comecaEm, quadrinho }: {
  /** Quando o espetáculo começa, no relógio de `performance.now()`. */
  comecaEm: number;
  quadrinho: boolean;
}) {
  const [faltam, setFaltam] = useState<number | null>(null);

  useEffect(() => {
    let relogio = 0;
    let tocou = false;
    const passo = () => {
      const falta = comecaEm - performance.now();
      if (falta <= 0) { setFaltam(null); return; }
      if (falta > AVISO_DOS_DESTAQUES_MS) {
        relogio = window.setTimeout(passo, falta - AVISO_DOS_DESTAQUES_MS);
        return;
      }
      if (!tocou) {
        tocou = true;
        if (falta >= MINIMO_PARA_A_SIRENE_MS) tocarSom('sirene');
      }
      setFaltam(Math.ceil(falta / 1000));
      relogio = window.setTimeout(passo, falta % 1000 || 1000);
    };
    passo();
    return () => window.clearTimeout(relogio);
  }, [comecaEm]);

  if (faltam === null) return null;
  return (
    <div className="qn-aviso" role="status" data-quadrinho={quadrinho ? '' : undefined} data-anima-sempre={quadrinho ? '' : undefined} data-nao-pausa="">
      <svg className="qn-sirene" viewBox="0 0 48 48" aria-hidden>
        <g className="qn-sirene-luz" stroke="#FFD98A" strokeWidth="3" strokeLinecap="round">
          <path d="M24 3v5M7 10l4 4M41 10l-4 4M2 26h5M46 26h-5" />
        </g>
        <path d="M13 36V25a11 11 0 0 1 22 0v11z" fill="#FFF6DC" stroke="#2B1B12" strokeWidth="2" strokeLinejoin="round" />
        <path d="M19 25a5 5 0 0 1 5-5" fill="none" stroke="#E4393D" strokeWidth="3" strokeLinecap="round" />
        <rect x="9" y="36" width="30" height="7" rx="2" fill="#F2C04E" stroke="#2B1B12" strokeWidth="2" />
      </svg>
      <div className="qn-aviso-texto">
        <small>Atenção, Cobrança!</small>
        Os destaques vão ser anunciados agora
      </div>
      <b className="qn-aviso-conta" aria-hidden>{faltam}</b>
    </div>
  );
});
