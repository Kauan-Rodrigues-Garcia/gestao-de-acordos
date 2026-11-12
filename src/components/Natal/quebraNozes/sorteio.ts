/**
 * O sorteio dos quebra-nozes — «aleatório», mas igual para todo mundo.
 *
 * Pedido do Cleber (12/11/2026): cada aparição tem de parecer diferente da
 * anterior, e a cidade inteira tem de ver a MESMA coisa na mesma hora («olha
 * aí»). As duas coisas juntas pedem um sorteio com semente: a semente sai da
 * cidade, do dia e do número da aparição, e daí em diante tudo o que é
 * «sorteado» (quem entra por onde, o que falam, o tique de cada um) sai dela.
 * Dois computadores com a mesma semente montam o mesmo espetáculo.
 *
 * Nada de `Math.random` aqui, e só conta de inteiro (`Math.imul`), que dá o
 * mesmo resultado em qualquer máquina.
 */

/** Uma semente a partir de textos e números (FNV-1a, com uma mexida no fim). */
export function sementeDe(...partes: readonly (string | number)[]): number {
  let h = 2166136261;
  for (const parte of partes) {
    const texto = String(parte);
    for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619) >>> 0;
    h = Math.imul(h ^ 0x7c, 16777619) >>> 0;
  }
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}

export interface Sorteio {
  /** De 0 (inclusive) a 1 (exclusive). */
  prox(): number;
  /** Um inteiro de 0 a `n - 1`. */
  int(n: number): number;
  /** Um número entre `a` e `b`, com duas casas (a hora das deixas não varia por arredondamento). */
  entre(a: number, b: number): number;
  chance(p: number): boolean;
  escolher<T>(lista: readonly T[]): T;
  embaralhar<T>(lista: readonly T[]): T[];
  /** Escolhe pelo peso: `[[item, peso], …]`. */
  pesado<T>(opcoes: readonly (readonly [T, number])[]): T;
  /** Outro sorteio, independente, derivado deste (um trecho não mexe no resto). */
  ramo(nome: string): Sorteio;
}

export function criarSorteio(semente: number): Sorteio {
  let a = semente >>> 0;
  const prox = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(prox() * n);
  return {
    prox,
    int,
    entre: (x, y) => Math.round((x + prox() * (y - x)) * 100) / 100,
    chance: p => prox() < p,
    escolher: lista => lista[int(lista.length)],
    embaralhar: lista => {
      const r = [...lista];
      for (let i = r.length - 1; i > 0; i--) { const j = int(i + 1); [r[i], r[j]] = [r[j], r[i]]; }
      return r;
    },
    pesado: opcoes => {
      const total = opcoes.reduce((soma, [, peso]) => soma + peso, 0);
      let alvo = prox() * total;
      for (const [item, peso] of opcoes) { alvo -= peso; if (alvo < 0) return item; }
      return opcoes[opcoes.length - 1][0];
    },
    ramo: nome => criarSorteio(sementeDe(semente, nome)),
  };
}

/**
 * A carta de número `n` de um baralho que nunca repete até acabar: as cartas
 * são embaralhadas por volta (a semente da volta sai de `chave`), e a primeira
 * de uma volta nunca é a última da anterior.
 */
export function cartaDoBaralho<T>(baralho: readonly T[], n: number, chave: string): T {
  const tamanho = baralho.length;
  if (tamanho === 1) return baralho[0];
  const volta = Math.floor(n / tamanho);
  const posicao = ((n % tamanho) + tamanho) % tamanho;
  const ordem = (v: number) => criarSorteio(sementeDe(chave, v)).embaralhar(baralho.map((_, i) => i));
  const desta = ordem(volta);
  const anterior = ordem(volta - 1);
  if (desta[0] === anterior[tamanho - 1]) [desta[0], desta[1]] = [desta[1], desta[0]];
  return baralho[desta[posicao]];
}
