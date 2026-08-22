/**
 * ValorAnimado — o número conta até o valor novo em vez de pular.
 *
 * O painel troca seis números de uma vez ao mudar de dia. Sem transição a tela
 * pisca e o olho perde qual número virou qual; a contagem curta preserva a
 * ligação entre o antes e o depois.
 *
 * ## Por que ele escreve direto no DOM
 *
 * A primeira versão guardava o valor em `useState` e o atualizava a cada quadro.
 * Funcionava e era caro: 60 `setState` por segundo, cada um disparando
 * reconciliação do React na faixa inteira — e havia mais de um número animando
 * ao mesmo tempo. Em máquina modesta isso sozinho comia o orçamento de 16ms do
 * quadro, e a animação que deveria ser suave engasgava.
 *
 * Agora o componente renderiza UMA vez e a contagem escreve em `textContent`
 * pelo ref. Não é atalho: o valor exibido durante a transição é estado de
 * apresentação, não estado da aplicação — nada mais na árvore precisa saber dele,
 * e envolver o React nisso é pagar reconciliação por pixel.
 *
 * Curta de propósito (380ms): passar disso vira espera, e o painel existe para
 * responder num relance.
 *
 * Movimento de números é gatilho conhecido de desconforto vestibular, então
 * quem PEDE menos movimento recebe o valor direto, sem contagem. Mas quem pede
 * é a pessoa, não a máquina: ver `hooks/useMovimentoPreferido.ts`. Obedecer a
 * media query crua deixava a contagem morta em PC com modo de desempenho
 * ligado, onde ninguém tinha configurado acessibilidade nenhuma.
 */

import { useEffect, useRef } from 'react';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';

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
  const { semMovimento } = useMovimentoPreferido();
  const no = useRef<HTMLSpanElement>(null);
  const anterior = useRef(valor);
  const quadro = useRef<number | null>(null);
  // Sem isto, mudar o formatador entre renders faria o efeito reiniciar a
  // contagem — as funções chegam como literais e nunca são a mesma referência.
  const formatarRef = useRef(formatar);
  formatarRef.current = formatar;

  useEffect(() => {
    const alvo = no.current;
    if (!alvo) return;

    const de = anterior.current;
    anterior.current = valor;

    if (semMovimento || de === valor) {
      alvo.textContent = formatarRef.current(valor);
      return;
    }

    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO);
      alvo.textContent = formatarRef.current(de + (valor - de) * suavizar(t));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);

    return () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current);
      // Interrompida no meio, a próxima contagem parte do valor final e não de
      // um número intermediário que a tela nunca chegou a mostrar por inteiro.
      alvo.textContent = formatarRef.current(valor);
    };
  }, [valor, semMovimento]);

  // O texto inicial vem do render; daqui em diante quem escreve é o efeito.
  return <span ref={no} className={className}>{formatar(valor)}</span>;
}
