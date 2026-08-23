/**
 * dadosVivos.ts — trocar dado sem trocar a tela.
 *
 * ## O defeito que isto existe para desfazer
 *
 * O padrão que se espalhou pelo projeto é este:
 *
 * ```ts
 * onEvento: () => { void recarregar(); }   // e `recarregar` faz setLoading(true)
 * ```
 *
 * O resultado, medido: o Analítico com 2.400 linhas troca a tabela inteira por
 * um esqueleto a cada evento de importação; a fila de Tickets volta ao topo
 * quando alguém responde um ticket que nem está na tela; o Pix redesenha 100
 * linhas porque uma delas mudou de status. Quem estava lendo perde o lugar, o
 * scroll salta e o input aberto some.
 *
 * O dado novo quase sempre é o MESMO dado. Chegam 2.400 linhas e 2.399 são
 * idênticas às que já estavam ali — mas como o `fetch` devolve objetos novos,
 * toda identidade de referência se quebra, todo `React.memo` erra e o React
 * remonta o que não mudou.
 *
 * ## O que este módulo faz
 *
 * `reconciliarLista` compara o que chegou com o que já existe e devolve um
 * array em que **os itens iguais são exatamente os objetos antigos** — mesma
 * referência. Quando nada mudou, devolve o array anterior INTEIRO, também por
 * referência: `setDados(reconciliarLista(...))` com resultado idêntico não
 * dispara render nenhum, porque o React compara por `Object.is`.
 *
 * Assim a releitura completa continua acontecendo (é ela que garante que a tela
 * está certa depois de uma queda de realtime), mas ela deixa de custar uma
 * remontagem.
 *
 * ## Por que a comparação é rasa por padrão
 *
 * As linhas vêm do PostgREST: objetos planos de colunas escalares. Uma
 * comparação rasa acerta 100% desses casos e custa uma passada nas chaves.
 * Quando a linha carrega um objeto aninhado (um `join`, um `jsonb`), quem chama
 * passa o próprio `iguais` — é o caso do Analítico, cujas linhas trazem o perfil
 * do operador embutido.
 *
 * ## O que este módulo NÃO faz
 *
 * Não busca dado, não conhece Supabase e não conhece React. É função pura, com
 * teste próprio. Quem junta as peças é `useDadosVivos`.
 */

/** Resultado de uma reconciliação, para quem precisa saber o que mudou. */
export interface DiffLista<T> {
  /** A lista final. Igual (por referência) à anterior quando nada mudou. */
  lista: T[];
  /** Chaves que não existiam antes. */
  entraram: string[];
  /** Chaves que existiam e sumiram. */
  sairam: string[];
  /** Chaves cujo conteúdo mudou. */
  mudaram: string[];
}

/** Comparação rasa de dois registros planos. */
export function iguaisRaso<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const ca = a as Record<string, unknown>;
  const cb = b as Record<string, unknown>;
  const chavesA = Object.keys(ca);
  if (chavesA.length !== Object.keys(cb).length) return false;

  for (const k of chavesA) {
    if (!Object.is(ca[k], cb[k])) return false;
  }
  return true;
}

/**
 * Comparação que desce em objetos e arrays aninhados.
 *
 * Existe porque nem toda linha é plana: a do Analítico traz `perfis` (um
 * `join`) e `pagamentos_detalhados` (um array), e o `fetch` cria objetos novos
 * para os dois a cada leitura. Com a comparação rasa, NENHUMA linha do
 * Analítico seria considerada igual — a reconciliação devolveria tudo novo e
 * não teria servido para nada.
 *
 * O custo é uma passada nos campos de cada linha. Para as 2.400 linhas de um
 * mês são poucos milissegundos, contra remontar 2.400 `<tr>` — que é a
 * alternativa.
 *
 * Não trata ciclos, e não precisa: o que entra aqui é resposta de PostgREST,
 * que é JSON e portanto acíclico por construção.
 */
export function iguaisProfundo<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!iguaisProfundo(a[i], b[i])) return false;
    }
    return true;
  }

  const ca = a as Record<string, unknown>;
  const cb = b as Record<string, unknown>;
  const chaves = Object.keys(ca);
  if (chaves.length !== Object.keys(cb).length) return false;
  for (const k of chaves) {
    if (!iguaisProfundo(ca[k], cb[k])) return false;
  }
  return true;
}

export interface OpcoesReconciliacao<T> {
  /** Identidade estável do item. Quase sempre `x => x.id`. */
  chave: (item: T) => string;
  /** Comparação de conteúdo. Padrão: `iguaisRaso`. */
  iguais?: (anterior: T, novo: T) => boolean;
}

/**
 * Funde a lista nova na atual preservando a identidade do que não mudou.
 *
 * A ORDEM é a da lista nova — ela vem do servidor, que é quem sabe ordenar.
 * O que se preserva é a identidade dos objetos, não a posição deles.
 *
 * Devolve o array anterior por referência quando o conteúdo e a ordem são os
 * mesmos. É esse detalhe que faz `setDados(...)` não renderizar nada numa
 * releitura que não trouxe novidade — e releitura sem novidade é a maioria.
 */
export function reconciliarLista<T>(
  atual: readonly T[],
  nova: readonly T[],
  opcoes: OpcoesReconciliacao<T>,
): T[] {
  return reconciliarComDiff(atual, nova, opcoes).lista;
}

/**
 * A mesma reconciliação, dizendo o que entrou, saiu e mudou.
 *
 * Quem anima entrada e saída de linha precisa da lista de chaves — sem ela a
 * tela teria de comparar de novo o que esta função já comparou.
 */
export function reconciliarComDiff<T>(
  atual: readonly T[],
  nova: readonly T[],
  { chave, iguais = iguaisRaso }: OpcoesReconciliacao<T>,
): DiffLista<T> {
  const porChaveAtual = new Map<string, T>();
  for (const item of atual) porChaveAtual.set(chave(item), item);

  const entraram: string[] = [];
  const mudaram:  string[] = [];
  const vistas = new Set<string>();

  let identica = atual.length === nova.length;
  const lista: T[] = new Array(nova.length);

  for (let i = 0; i < nova.length; i++) {
    const item = nova[i];
    const k = chave(item);
    vistas.add(k);
    const anterior = porChaveAtual.get(k);

    if (anterior === undefined) {
      entraram.push(k);
      lista[i] = item;
      identica = false;
      continue;
    }

    if (iguais(anterior, item)) {
      // O ponto do módulo: o objeto ANTIGO segue na lista. Quem depende de
      // identidade de referência (React.memo, key de animação, useMemo com o
      // item na dependência) não vê mudança nenhuma.
      lista[i] = anterior;
      // Posição diferente ainda é mudança de lista, mesmo com todo item igual.
      if (identica && atual[i] !== anterior) identica = false;
    } else {
      mudaram.push(k);
      lista[i] = item;
      identica = false;
    }
  }

  const sairam: string[] = [];
  for (const k of porChaveAtual.keys()) {
    if (!vistas.has(k)) { sairam.push(k); identica = false; }
  }

  return {
    // Array anterior por REFERÊNCIA quando nada mudou — é o que corta o render.
    lista: identica ? (atual as T[]) : lista,
    entraram, sairam, mudaram,
  };
}

/**
 * A mesma ideia para um registro só (um objeto de configuração, um resumo).
 *
 * Devolve o anterior quando o conteúdo é igual, para o `setState` não
 * renderizar. `null` de um lado só é igual a `null` do outro.
 */
export function reconciliarItem<T>(
  atual: T | null,
  novo: T | null,
  iguais: (a: T, b: T) => boolean = iguaisRaso,
): T | null {
  if (atual === null || novo === null) return novo;
  return iguais(atual, novo) ? atual : novo;
}

/**
 * Reconcilia um mapa `chave → registro`.
 *
 * Mesma promessa: o objeto do mapa anterior é devolvido quando nada mudou, e
 * cada valor igual mantém a referência antiga.
 */
export function reconciliarMapa<T>(
  atual: Readonly<Record<string, T>>,
  novo: Readonly<Record<string, T>>,
  iguais: (a: T, b: T) => boolean = iguaisRaso,
): Record<string, T> {
  const chavesNovas = Object.keys(novo);
  let identico = chavesNovas.length === Object.keys(atual).length;
  const saida: Record<string, T> = {};

  for (const k of chavesNovas) {
    const anterior = atual[k];
    if (anterior !== undefined && iguais(anterior, novo[k])) {
      saida[k] = anterior;
    } else {
      saida[k] = novo[k];
      identico = false;
    }
  }

  return identico ? (atual as Record<string, T>) : saida;
}
