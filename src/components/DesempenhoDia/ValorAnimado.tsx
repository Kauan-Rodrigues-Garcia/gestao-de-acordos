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
 * Em 900ms: tempo suficiente para perceber a aceleração e a desaceleração sem
 * transformar a atualização do painel em espera.
 *
 * Esta contagem curta é executada mesmo quando o Windows ativa as opções de
 * desempenho/redução de movimento. Ela não desloca o layout nem move grandes
 * áreas: só interpola o conteúdo numérico para a atualização continuar legível.
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import { DURACAO_VALOR_ANIMADO, suavizarValorAnimado } from './valorAnimadoCurva';

interface ValorAnimadoProps {
  valor: number;
  /** Como desenhar o número — `formatCurrency`, `String`, o que for. */
  formatar: (v: number) => string;
  className?: string;
  style?: CSSProperties;
}

export function ValorAnimado({ valor, formatar, className, style }: ValorAnimadoProps) {
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

    if (de === valor) {
      alvo.textContent = formatarRef.current(valor);
      return;
    }

    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_VALOR_ANIMADO);
      alvo.textContent = formatarRef.current(de + (valor - de) * suavizarValorAnimado(t));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);

    return () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current);
      // Interrompida no meio, a próxima contagem parte do valor final e não de
      // um número intermediário que a tela nunca chegou a mostrar por inteiro.
      alvo.textContent = formatarRef.current(valor);
    };
  }, [valor]);

  // O texto inicial vem do render; daqui em diante quem escreve é o efeito.
  return <span ref={no} className={className} style={style}>{formatar(valor)}</span>;
}
