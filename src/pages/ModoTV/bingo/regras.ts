/**
 * regras.ts — o bingo de 75 bolas, sem React e sem banco.
 *
 * Cartela 5×5 guardada linha a linha (índices 0–24); o meio (12) é 0, a
 * estrela, e vale sempre como marcado. A mesma regra está no banco
 * (`fn_bingo_padrao`): o banco confere o grito e a comemoração, e o front usa
 * esta para acender o «BINGO!» e montar o painel do líder.
 *
 * Testado em `bingo.test.ts`.
 */
import type { AvisoBingo, CartelaNoControle, TipoVitoria } from './tipos';

export const LETRAS = ['B', 'I', 'N', 'G', 'O'] as const;
export const TOTAL_PEDRAS = 75;
export const ESTRELA = 12;

/** «B» para 1–15, «I» 16–30… */
export function letraDe(n: number): string {
  return LETRAS[Math.min(4, Math.max(0, Math.floor((n - 1) / 15)))];
}

/** As 12 linhas que fazem quina: 5 linhas, 5 colunas, 2 diagonais. */
export const LINHAS: readonly number[][] = [
  ...[0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map(c => [0, 1, 2, 3, 4].map(r => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

const marcado = (numeros: number[], i: number, marcadas: ReadonlySet<number>) =>
  numeros[i] === 0 || marcadas.has(numeros[i]);

/** Os índices da linha que fecha (quina) ou os 25 (cheia); `null` = não fechou. */
export function padrao(numeros: number[], marcadas: ReadonlySet<number>, tipo: TipoVitoria): number[] | null {
  if (numeros.length !== 25) return null;
  if (tipo === 'cheia') {
    return numeros.every((_, i) => marcado(numeros, i, marcadas)) ? numeros.map((_, i) => i) : null;
  }
  return LINHAS.find(l => l.every(i => marcado(numeros, i, marcadas))) ?? null;
}

/** O melhor que esta cartela já fez. */
export function melhorFeito(numeros: number[], marcadas: ReadonlySet<number>): TipoVitoria | null {
  if (padrao(numeros, marcadas, 'cheia')) return 'cheia';
  if (padrao(numeros, marcadas, 'quina')) return 'quina';
  return null;
}

/**
 * As pedras da sorte: os números que faltam nas linhas a UMA pedra da quina
 * (uma por linha, sem repetir), em ordem.
 */
export function pedrasDaSorteQuina(numeros: number[], sorteadas: ReadonlySet<number>): number[] {
  const sorte = new Set<number>();
  for (const l of LINHAS) {
    const faltam = l.filter(i => !marcado(numeros, i, sorteadas));
    if (faltam.length === 1) sorte.add(numeros[faltam[0]]);
  }
  return [...sorte].sort((a, b) => a - b);
}

/** O que falta para a cartela cheia. */
export function faltamParaCheia(numeros: number[], sorteadas: ReadonlySet<number>): number[] {
  return numeros.filter((n, i) => !marcado(numeros, i, sorteadas)).sort((a, b) => a - b);
}

/** Quantas pedras faltam para a cartela cheia ser «perto». */
export const PERTO_DA_CHEIA = 3;

export interface PessoaNoGrupo {
  cartela: CartelaNoControle;
  /** Nos grupos «perto»: os números que fecham. */
  sorte: number[];
}

export interface GruposDoLider {
  pertoDaQuina: PessoaNoGrupo[];
  fezQuina: PessoaNoGrupo[];
  pertoDaCheia: PessoaNoGrupo[];
  bingo: PessoaNoGrupo[];
}

/**
 * O painel do líder, refeito a cada pedra no navegador dele. Conta pelas
 * pedras SORTEADAS, nunca pelo que a pessoa marcou: é a mesma régua da
 * comemoração (`fn_bingo_comemorar`). Cada pessoa aparece num grupo só — o
 * mais adiantado; quem fez quina e está perto da cheia fica em «perto da
 * cheia».
 */
export function gruposDoLider(cartelas: CartelaNoControle[], pedras: number[]): GruposDoLider {
  const sorteadas = new Set(pedras);
  const g: GruposDoLider = { pertoDaQuina: [], fezQuina: [], pertoDaCheia: [], bingo: [] };
  for (const cartela of cartelas) {
    const n = cartela.numeros;
    if (padrao(n, sorteadas, 'cheia')) { g.bingo.push({ cartela, sorte: [] }); continue; }
    const faltam = faltamParaCheia(n, sorteadas);
    if (faltam.length <= PERTO_DA_CHEIA) { g.pertoDaCheia.push({ cartela, sorte: faltam }); continue; }
    if (padrao(n, sorteadas, 'quina')) { g.fezQuina.push({ cartela, sorte: [] }); continue; }
    const sorte = pedrasDaSorteQuina(n, sorteadas);
    if (sorte.length) g.pertoDaQuina.push({ cartela, sorte });
  }
  // Mais pedras da sorte = mais chance: em cima.
  g.pertoDaQuina.sort((a, b) => b.sorte.length - a.sorte.length || a.cartela.nome.localeCompare(b.cartela.nome, 'pt-BR'));
  g.pertoDaCheia.sort((a, b) => a.sorte.length - b.sorte.length || a.cartela.nome.localeCompare(b.cartela.nome, 'pt-BR'));
  return g;
}

/** Quem pode ser comemorado agora por este tipo. */
export function elegiveis(cartelas: CartelaNoControle[], pedras: number[], tipo: TipoVitoria): CartelaNoControle[] {
  const sorteadas = new Set(pedras);
  return cartelas.filter(c => padrao(c.numeros, sorteadas, tipo));
}

/** A máquina da TV gira este tempo antes de a pedra aparecer (`BingoTv`). */
export const MAQUINA_GIRANDO_MS = 2200;

/**
 * O jogador só vê a pedra depois que a TV a mostrou (pedido do Cleber,
 * 30/10/2026). O aviso chega aos dois ao mesmo tempo e a TV ainda gira a
 * máquina; a folga cobre o aviso que chega à TV um pouco depois.
 */
export const REVELAR_AO_JOGADOR_MS = MAQUINA_GIRANDO_MS + 600;

/**
 * Do que o banco devolveu, o que já pode aparecer para o jogador e a pedra que
 * ainda espera a TV: a última, se esta tela não a conhecia. As que já esperam
 * (`pendentes`) continuam esperando.
 */
export function pedrasParaMostrar(
  doBanco: readonly number[],
  conhecidas: ReadonlySet<number>,
  pendentes: ReadonlySet<number>,
): { visiveis: number[]; aRevelar: number | null } {
  const ultima = doBanco[doBanco.length - 1];
  const aRevelar = ultima !== undefined && !conhecidas.has(ultima) ? ultima : null;
  return {
    visiveis: doBanco.filter(n => n !== aRevelar && !pendentes.has(n)),
    aRevelar,
  };
}

/**
 * A pedra que chegou encaixa na sequência? `ordem` é a posição dela. Se pulou
 * (chegou a 24 sem a 23), o cliente relê do banco em vez de remendar.
 */
export function encaixa(pedras: number[], aviso: Extract<AvisoBingo, { tipo: 'pedra' }>): 'nova' | 'repetida' | 'buraco' {
  if (aviso.ordem <= pedras.length) return pedras[aviso.ordem - 1] === aviso.numero ? 'repetida' : 'buraco';
  return aviso.ordem === pedras.length + 1 ? 'nova' : 'buraco';
}

/** Lê um aviso cru do canal. Nada que não tenha a forma certa passa. */
export function lerAviso(bruto: Record<string, unknown>): AvisoBingo | null {
  const partida = typeof bruto.partida === 'string' ? bruto.partida : null;
  if (!partida) return null;
  switch (bruto.tipo) {
    case 'pedra': {
      const ordem = Number(bruto.ordem), numero = Number(bruto.numero);
      return Number.isInteger(ordem) && Number.isInteger(numero) && numero >= 1 && numero <= TOTAL_PEDRAS
        ? { tipo: 'pedra', partida, ordem, numero } : null;
    }
    case 'grito':
      return typeof bruto.quem === 'string' && (bruto.grito === 'quina' || bruto.grito === 'cheia')
        ? { tipo: 'grito', partida, quem: bruto.quem, grito: bruto.grito } : null;
    case 'partida': case 'vitoria': case 'convite':
      return { tipo: bruto.tipo, partida };
    default:
      return null;
  }
}

/**
 * As pedras que a cartela marca sozinha agora: saíram, são da cartela, a
 * pessoa não marcou, e já passou o tempo da partida desde que a tela as viu.
 */
export function paraMarcarSozinho(
  numeros: number[], pedras: number[], marcadas: ReadonlySet<number>, auto: ReadonlySet<number>,
  vistaEm: ReadonlyMap<number, number>, agoraMs: number, limiteMs: number,
): number[] {
  const daCartela = new Set(numeros);
  return pedras.filter(n => daCartela.has(n) && !marcadas.has(n) && !auto.has(n)
    && agoraMs - (vistaEm.get(n) ?? agoraMs) >= limiteMs);
}

/** O grito vale a pena? Só se a cartela fez mais do que já gritou. */
export function podeGritar(feito: TipoVitoria | null, jaGritou: TipoVitoria | null): boolean {
  if (!feito) return false;
  if (!jaGritou) return true;
  return feito === 'cheia' && jaGritou === 'quina';
}

/** «Quina!» / «Bingo!». */
export const nomeDaVitoria = (t: TipoVitoria) => (t === 'cheia' ? 'BINGO' : 'QUINA');
