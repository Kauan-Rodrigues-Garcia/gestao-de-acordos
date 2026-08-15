/**
 * ValorAnimado — o número conta até o valor novo em vez de pular.
 *
 * O painel troca de dia com as setas do teclado, e trocar de dia trocava seis
 * números de uma vez. Sem transição, a tela pisca e o olho perde qual número
 * mudou para qual — a animação curta preserva a continuidade entre o antes e o
 * depois.
 *
 * Curta de propósito (380ms): passar disso vira espera, e o painel existe para
 * responder em um relance.
 *
 * Com `prefers-reduced-motion` o valor aparece direto, sem contagem. Movimento
 * de números é um dos gatilhos mais citados de desconforto vestibular, e a
 * informação aqui não depende dele.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const DURACAO = 380;

/** easeOutCubic: rápido no começo, assentando no fim. */
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface ValorAnimadoProps {
  valor: number;
  /** Como desenhar o número — `formatCurrency`, `String`, o que for. */
  formatar: (v: number) => string;
  className?: string;
}

export function ValorAnimado({ valor, formatar, className }: ValorAnimadoProps) {
  const semMovimento = useReducedMotion();
  const [exibido, setExibido] = useState(valor);
  const anterior = useRef(valor);
  const quadro = useRef<number | null>(null);

  useEffect(() => {
    if (semMovimento || anterior.current === valor) {
      anterior.current = valor;
      setExibido(valor);
      return;
    }

    const de = anterior.current;
    const ate = valor;
    const inicio = performance.now();

    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO);
      setExibido(de + (ate - de) * suavizar(t));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
      else anterior.current = ate;
    };

    quadro.current = requestAnimationFrame(passo);
    return () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current);
      // Sem isto, desmontar no meio da contagem deixaria `anterior` num valor
      // intermediário, e a próxima animação partiria de um número que a tela
      // nunca chegou a mostrar por inteiro.
      anterior.current = ate;
    };
  }, [valor, semMovimento]);

  return <span className={className}>{formatar(exibido)}</span>;
}
