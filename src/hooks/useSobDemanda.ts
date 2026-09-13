import { useEffect, useState } from 'react';
import { precarregarQuandoOcioso } from '@/lib/sobDemanda';

/**
 * `true` a partir da primeira vez que `aberto` foi `true` — e para sempre.
 *
 * É o que deixa um painel sob demanda fechar com animação: montar só enquanto
 * está aberto desmontaria o painel no mesmo quadro em que ele devia sair
 * deslizando. Depois da primeira abertura ele fica montado, como sempre ficou.
 *
 * O ajuste de estado durante a renderização é o padrão do React para estado
 * derivado de prop: o render seguinte já sai com o valor novo, sem o quadro
 * vazio que um `useEffect` deixaria.
 */
export function useJaAbriu(aberto: boolean): boolean {
  const [jaAbriu, setJaAbriu] = useState(aberto);
  if (aberto && !jaAbriu) setJaAbriu(true);
  return jaAbriu || aberto;
}

/**
 * Pré-carrega os pedaços quando a tela assenta. Ver `precarregarQuandoOcioso`.
 *
 * `carregadores` precisa ter identidade estável (constante de módulo ou
 * `useMemo`): uma lista nova a cada render reagendaria o download a cada render.
 */
export function usePrecarregarQuandoOcioso(
  carregadores: ReadonlyArray<() => Promise<unknown>>,
): void {
  useEffect(() => precarregarQuandoOcioso(carregadores), [carregadores]);
}
