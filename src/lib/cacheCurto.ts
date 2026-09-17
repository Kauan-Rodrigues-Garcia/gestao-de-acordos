/**
 * src/lib/cacheCurto.ts — a mesma leitura, uma vez só, por pouco tempo.
 *
 * ## O que isto resolve (17/09/2026)
 *
 * Várias leituras do app respondem perguntas que mudam raramente — quem está
 * em qual equipe, as metas do mês, as exceções de ajuste — mas eram refeitas a
 * cada evento de tempo real e por cada componente montado. O
 * `buscarEquipesComOperadores`, sozinho, disparava seis consultas ~21 mil vezes
 * por dia: um acordo salvo por qualquer operador recarregava a composição de
 * equipes em todos os painéis abertos da empresa.
 *
 * Três garantias, nesta ordem de importância:
 *
 *   1. Busca em curso é compartilhada: dez componentes que pedem a mesma chave
 *      no mesmo instante fazem UMA requisição.
 *   2. Resposta vale por `validadeMs`; depois dela, a próxima leitura busca de
 *      novo.
 *   3. `invalidarCache(prefixo)` descarta na hora — quem grava chama, e a
 *      própria tela vê a mudança sem esperar a validade.
 *
 * Quem NÃO grava (outra pessoa, outra aba) enxerga a mudança em até
 * `validadeMs`. Por isso a validade é curta, e por isso nada que precise ser
 * exato no segundo passa por aqui.
 *
 * Sem dependências de propósito: `src/test/setup.ts` importa este módulo para
 * limpar o cache entre os testes, e importar o cliente Supabase ali quebraria
 * os `vi.mock` de cada arquivo.
 */

interface Entrada {
  valor?:    unknown;
  temValor:  boolean;
  guardadoEm: number;
  promessa?: Promise<unknown>;
}

const entradas = new Map<string, Entrada>();

export interface OpcoesCache<T> {
  /**
   * Guarda a resposta? Padrão: sempre. As buscas que engolem erro e devolvem
   * lista vazia usam para não guardar a falha por `validadeMs`.
   */
  guardarSe?: (valor: T) => boolean;
}

/**
 * Lê `chave` do cache, ou busca.
 *
 * Erro da busca não é guardado: rejeita para quem esperava e a próxima leitura
 * tenta de novo.
 */
export function lerComCache<T>(
  chave: string,
  validadeMs: number,
  buscar: () => Promise<T>,
  opcoes: OpcoesCache<T> = {},
): Promise<T> {
  const atual = entradas.get(chave);
  if (atual?.temValor && Date.now() - atual.guardadoEm < validadeMs) {
    return Promise.resolve(atual.valor as T);
  }
  if (atual?.promessa) return atual.promessa as Promise<T>;

  const entrada: Entrada = { temValor: false, guardadoEm: 0 };
  const promessa = buscar().then(
    (valor) => {
      // Invalidada (ou substituída) durante a busca: a resposta pode ser de
      // antes da gravação, então entrega a quem pediu mas não guarda.
      if (entradas.get(chave) === entrada) {
        entrada.promessa = undefined;
        if (opcoes.guardarSe && !opcoes.guardarSe(valor)) {
          entradas.delete(chave);
        } else {
          entrada.valor = valor;
          entrada.temValor = true;
          entrada.guardadoEm = Date.now();
        }
      }
      return valor;
    },
    (erro: unknown) => {
      if (entradas.get(chave) === entrada) entradas.delete(chave);
      throw erro;
    },
  );
  entrada.promessa = promessa;
  entradas.set(chave, entrada);
  return promessa;
}

/**
 * O valor guardado, se ainda válido — sem buscar. Para o primeiro render de um
 * componente que monta depois de outro já ter lido: começa pronto, sem
 * esqueleto.
 */
export function espiarCache<T>(chave: string, validadeMs: number): T | undefined {
  const atual = entradas.get(chave);
  if (atual?.temValor && Date.now() - atual.guardadoEm < validadeMs) return atual.valor as T;
  return undefined;
}

/** Descarta toda chave que começa com `prefixo` — inclusive a busca em curso. */
export function invalidarCache(prefixo: string): void {
  for (const chave of [...entradas.keys()]) {
    if (chave.startsWith(prefixo)) entradas.delete(chave);
  }
}

/**
 * Descarta tudo. Chamado na troca de pessoa: várias leituras aqui passam pela
 * RLS, e a resposta de um login não vale para o próximo na mesma aba.
 */
export function limparCacheCurto(): void {
  entradas.clear();
}

/** Para os testes: nada sobrevive de um caso para o outro. */
export function __limparCacheCurtoParaTestes(): void {
  entradas.clear();
}
