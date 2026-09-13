/**
 * sobDemanda.ts — baixar um pedaço do app só quando ele for usado.
 *
 * O `Layout` monta em toda página, e importava estaticamente painéis que só
 * aparecem com um clique: comissão, desafio, desempenho do dia, a janela do
 * chat. Tudo isso ia no pacote de entrada, que chegou a 850 KB, e era baixado
 * e interpretado antes da primeira tela — por quem nunca abriria nenhum deles.
 *
 * ## Por que não basta `lazy(() => import(...))`
 *
 * Duas coisas mudam quando um painel deixa de vir no pacote de entrada:
 *
 * - **O download pode falhar.** Um deploy troca os nomes dos arquivos; quem
 *   estava com a aba aberta pede um pedaço que já não existe. Um `import()`
 *   rejeitado dentro de `lazy` sobe até o `ErrorBoundary` mais próximo — que,
 *   para o `Layout`, é o do App inteiro. Abrir a comissão derrubaria a tela.
 *   Daí a segunda tentativa aqui, e o boundary próprio de `PainelSobDemanda`.
 *
 * - **A primeira abertura esperaria a rede.** Daí `precarregarQuandoOcioso`:
 *   depois que a tela assenta, os pedaços descem em segundo plano, e o clique
 *   encontra tudo no cache.
 */

/**
 * Um carregador que baixa UMA vez e tenta de novo se falhar.
 *
 * A promessa fica guardada: o pré-carregamento e a abertura de verdade dividem
 * o mesmo download, em vez de disputarem dois. Se as duas tentativas falharem,
 * a promessa é descartada — a próxima chamada começa do zero, porque a rede
 * que caiu agora pode ter voltado.
 */
export function comNovaTentativa<T>(
  carregar: () => Promise<T>,
  esperaMs = 800,
): () => Promise<T> {
  let emCurso: Promise<T> | null = null;
  return () => {
    if (!emCurso) {
      emCurso = carregar()
        .catch(async () => {
          await new Promise(resolver => setTimeout(resolver, esperaMs));
          return carregar();
        })
        .catch((erro: unknown) => {
          emCurso = null;
          throw erro;
        });
    }
    return emCurso;
  };
}

type JanelaComOcioso = Window & {
  requestIdleCallback?: (cb: () => void, opcoes?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Dispara os carregadores quando o navegador estiver ocioso.
 *
 * `requestIdleCallback` com prazo: sem o prazo, uma tela que nunca fica ociosa
 * (realtime chegando o tempo todo) adiaria o download para sempre. Safari não
 * tem a função — lá vai um `setTimeout`, que chega ao mesmo lugar.
 *
 * Falha de pré-carregamento é engolida: ninguém pediu nada ainda, e a abertura
 * de verdade tenta de novo com o próprio tratamento.
 *
 * Devolve a função que cancela — é o retorno de um `useEffect`.
 */
export function precarregarQuandoOcioso(
  carregadores: ReadonlyArray<() => Promise<unknown>>,
  prazoMs = 4_000,
): () => void {
  if (carregadores.length === 0) return () => {};
  const rodar = () => {
    for (const carregar of carregadores) void carregar().catch(() => {});
  };
  const janela = window as JanelaComOcioso;
  if (typeof janela.requestIdleCallback === 'function') {
    const id = janela.requestIdleCallback(rodar, { timeout: prazoMs });
    return () => janela.cancelIdleCallback?.(id);
  }
  const timer = setTimeout(rodar, 1_500);
  return () => clearTimeout(timer);
}
