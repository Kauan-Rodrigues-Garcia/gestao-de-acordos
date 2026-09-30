/**
 * O número que muda sem pular — usado nos valores grandes do celular.
 *
 * Pedido de 30/09/2026: «ao carregar algum dado novo, carregue suavemente
 * mascarando o loading» — o valor rola do antigo para o novo (e, na primeira
 * carga, sobe do zero) em vez de trocar seco. Quem prefere movimento reduzido
 * vê o valor final direto.
 */
import { useEffect, useRef, useState } from 'react';

/** Curva de saída: rápido no começo, assenta no fim. */
export function suavizar(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 3);
}

/** O valor no instante `t` (0..1) entre `de` e `para`. */
export function valorNoInstante(de: number, para: number, t: number): number {
  return de + (para - de) * suavizar(t);
}

function movimentoReduzido(): boolean {
  try {
    return typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export type Direcao = 'subiu' | 'desceu' | null;

/**
 * Anima de onde estava até `alvo`. Devolve o valor do quadro e a direção da
 * última mudança (para a tela acender verde/vermelho por um instante).
 */
export function useNumeroAnimado(alvo: number, duracaoMs = 750): { valor: number; direcao: Direcao } {
  const [valor, setValor] = useState(() => (movimentoReduzido() ? alvo : 0));
  const [direcao, setDirecao] = useState<Direcao>(null);
  const atual = useRef(valor);
  const primeira = useRef(true);

  useEffect(() => {
    const de = atual.current;
    if (de === alvo) return;
    if (movimentoReduzido() || typeof requestAnimationFrame === 'undefined') {
      atual.current = alvo;
      setValor(alvo);
      return;
    }
    // A primeira carga sobe do zero sem acender cor: não é mudança, é chegada.
    if (!primeira.current) setDirecao(alvo > de ? 'subiu' : 'desceu');
    primeira.current = false;

    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = (agora - inicio) / duracaoMs;
      const v = t >= 1 ? alvo : valorNoInstante(de, alvo, t);
      atual.current = v;
      setValor(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    const apagar = setTimeout(() => setDirecao(null), duracaoMs + 900);
    return () => { cancelAnimationFrame(quadro); clearTimeout(apagar); };
  }, [alvo, duracaoMs]);

  return { valor, direcao };
}
