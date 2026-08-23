/**
 * estadoAtualizacao.ts — o único lugar onde o sistema admite que está buscando.
 *
 * ## A troca que este módulo representa
 *
 * O jeito antigo de dizer "estou buscando" era apagar o conteúdo e pôr um
 * esqueleto no lugar. Isso responde a pergunta errada: quem está olhando não
 * perguntou se o sistema está ocupado — ele quer ler o número que estava ali.
 *
 * O jeito novo é um fio de 2 px no topo da janela. Ele não empurra nada, não
 * apaga nada e não pede atenção. E, principalmente, **ele só aparece quando a
 * espera passa de um terço de segundo**: uma releitura de 80 ms não produz sinal
 * nenhum, porque um sinal que pisca a cada evento de tempo real é ruído.
 *
 * ## Contador, não booleano
 *
 * Três telas podem estar relendo ao mesmo tempo (fila, métricas, notificações).
 * Com um booleano, a primeira a terminar apagaria o sinal das outras duas. O
 * contador só chega a zero quando a última termina.
 *
 * ## Por que não zustand
 *
 * `useSyncExternalStore` é do próprio React e resolve exatamente isto, incluindo
 * o rasgo de concorrência que um `useState` global teria. O `zustand` está no
 * `package.json` mas não é usado em nenhum lugar do `src` — introduzir um
 * gerenciador de estado inteiro para um contador seria pagar caro por nada.
 */

export interface EstadoAtualizacao {
  /** Quantas releituras em silêncio estão em andamento agora. */
  emAndamento: number;
  /** `Date.now()` do início da rajada atual. `null` quando parado. */
  desde: number | null;
  /** `Date.now()` da última releitura que terminou bem. */
  ultimoSucesso: number | null;
}

const PARADO: EstadoAtualizacao = { emAndamento: 0, desde: null, ultimoSucesso: null };

/**
 * O objeto é trocado, nunca mutado: `useSyncExternalStore` compara o retorno de
 * `ler()` por identidade, e um objeto novo a cada leitura renderizaria em laço.
 */
let estado: EstadoAtualizacao = PARADO;

const ouvintes = new Set<() => void>();

function publicar(proximo: EstadoAtualizacao): void {
  estado = proximo;
  for (const ouvinte of [...ouvintes]) ouvinte();
}

/** Instantâneo atual. Estável entre mudanças — pode ir direto no `useSyncExternalStore`. */
export function lerAtualizacao(): EstadoAtualizacao {
  return estado;
}

export function assinarAtualizacao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/**
 * Registra o começo de uma releitura silenciosa.
 *
 * @returns a função de encerramento. Chame-a SEMPRE — inclusive no erro, e
 *          inclusive quando o componente desmontou no meio. Um `finally` sem
 *          esta chamada deixa o fio no topo aceso para sempre.
 */
export function comecouAtualizacao(): (ok?: boolean) => void {
  publicar({
    emAndamento: estado.emAndamento + 1,
    desde: estado.desde ?? Date.now(),
    ultimoSucesso: estado.ultimoSucesso,
  });

  let encerrada = false;
  return (ok = true) => {
    // Idempotente: um `finally` que roda depois de um `catch` que já encerrou
    // levaria o contador a número negativo, e o fio nunca mais apagaria.
    if (encerrada) return;
    encerrada = true;

    const restantes = Math.max(0, estado.emAndamento - 1);
    publicar({
      emAndamento: restantes,
      desde: restantes === 0 ? null : estado.desde,
      ultimoSucesso: ok ? Date.now() : estado.ultimoSucesso,
    });
  };
}

/** Só para os testes: o estado é de módulo e vazaria de um caso para o outro. */
export function __resetAtualizacaoParaTestes(): void {
  ouvintes.clear();
  estado = PARADO;
}
