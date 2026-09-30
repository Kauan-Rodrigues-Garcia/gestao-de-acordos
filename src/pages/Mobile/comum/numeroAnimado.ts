/**
 * O número que muda sem pular — usado nos valores grandes do celular.
 *
 * Pedido de 30/09/2026: «ao carregar algum dado novo, carregue suavemente
 * mascarando o loading» — o valor rola do antigo para o novo (e, na primeira
 * carga, sobe do zero) em vez de trocar seco. Quem prefere movimento reduzido
 * vê o valor final direto.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * A duração da última mudança de `valor` (ver `duracaoDaSubida`), para o
 * número, a % e a barra de um mesmo card subirem juntos e chegarem juntos.
 * Guarda o valor anterior em estado e acerta durante a renderização (o padrão
 * do React para «derivar do valor anterior»), então a duração nova já vale na
 * mesma renderização em que o valor muda.
 */
export function useDuracaoDaSubida(valor: number): number {
  const [ultima, setUltima] = useState(() => ({
    valor, duracao: movimentoReduzido() ? 0 : duracaoDaSubida(0, valor),
  }));
  if (ultima.valor !== valor) {
    const nova = { valor, duracao: duracaoDaSubida(ultima.valor, valor) };
    setUltima(nova);
    return nova.duracao;
  }
  return ultima.duracao;
}

/** Curva de saída: rápido no começo, assenta no fim. */
export function suavizar(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * A curva da «subida de aposta»: sobe num ritmo quase constante e só assenta
 * no fim — o olho acompanha o número crescendo, em vez de ver um salto e uma
 * cauda longa (que é o que a `suavizar` faz).
 */
export function subirDevagar(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 2);
}

/** O valor no instante `t` (0..1) entre `de` e `para`. */
export function valorNoInstante(
  de: number, para: number, t: number, curva: (t: number) => number = suavizar,
): number {
  return de + (para - de) * curva(t);
}

/**
 * Quanto tempo a subida leva — pedido de 30/09/2026: «demore mais, o número
 * vai subindo mais lentamente, tipo aposta quando ganha um valor alto». Quanto
 * maior o salto, mais longa a subida: ~2,1 s para dezenas de reais, ~2,7 s
 * para milhares, no máximo 3,2 s.
 */
export function duracaoDaSubida(de: number, para: number): number {
  const salto = Math.abs(para - de);
  if (salto < 0.005) return 0;
  return Math.round(1800 + Math.min(1400, Math.log10(Math.max(1, salto)) * 300));
}

/** Curva da barra em CSS que acompanha a `subirDevagar` (easeOutQuad). */
export const CURVA_APOSTA_CSS = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

function movimentoReduzido(): boolean {
  try {
    return typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export type Direcao = 'subiu' | 'desceu' | null;

export interface RitmoAnimacao {
  /** Duração fixa. Sem ela, com `aposta`, a duração sai do tamanho do salto. */
  duracaoMs?: number;
  /** A subida lenta e contínua dos cards principais (`subirDevagar`). */
  aposta?: boolean;
}

/**
 * Anima de onde estava até `alvo`. Devolve o valor do quadro e a direção da
 * última mudança (para a tela acender verde/vermelho por um instante).
 */
export function useNumeroAnimado(alvo: number, ritmo: RitmoAnimacao = {}): { valor: number; direcao: Direcao } {
  const { aposta = false } = ritmo;
  const duracaoFixa = ritmo.duracaoMs;
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

    const duracaoMs = duracaoFixa ?? (aposta ? duracaoDaSubida(de, alvo) : 750);
    const curva = aposta ? subirDevagar : suavizar;
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = (agora - inicio) / Math.max(1, duracaoMs);
      const v = t >= 1 ? alvo : valorNoInstante(de, alvo, t, curva);
      atual.current = v;
      setValor(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    const apagar = setTimeout(() => setDirecao(null), duracaoMs + 900);
    return () => { cancelAnimationFrame(quadro); clearTimeout(apagar); };
  }, [alvo, duracaoFixa, aposta]);

  return { valor, direcao };
}
