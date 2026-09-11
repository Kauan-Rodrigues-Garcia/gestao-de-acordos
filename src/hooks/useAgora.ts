/**
 * useAgora — o relógio da tela, um só para todos os cronômetros.
 *
 * Uma tela de Meus Chips tem dezenas de números, e cada um com prazo mostra uma
 * contagem regressiva. Um `setInterval` por número seria um relógio por número,
 * todos desalinhados entre si. Aqui há um relógio: ele liga quando o primeiro
 * cronômetro aparece, bate uma vez por segundo para todos, e desliga quando o
 * último some.
 *
 * O instante é arredondado ao segundo. Sem isso, dois cronômetros desenhados no
 * mesmo passo poderiam discordar por um segundo — e uma tela mostrando
 * `00:00:01` ao lado de «Pronto» para o mesmo prazo parece defeito.
 */
import { useSyncExternalStore } from 'react';

const ouvintes = new Set<() => void>();
let agora = 0;
let relogio: ReturnType<typeof setInterval> | null = null;

function segundoAtual(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  if (!relogio) {
    agora = segundoAtual();
    relogio = setInterval(() => {
      agora = segundoAtual();
      for (const o of ouvintes) o();
    }, 1000);
  }
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0 && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  };
}

/**
 * Com o relógio desligado, o segundo atual — estável dentro do mesmo segundo,
 * que é o que o `useSyncExternalStore` exige entre duas leituras seguidas.
 */
function ler(): number {
  return relogio ? agora : segundoAtual();
}

/** O instante atual, em milissegundos, atualizado a cada segundo. */
export function useAgora(): number {
  return useSyncExternalStore(assinar, ler, ler);
}
