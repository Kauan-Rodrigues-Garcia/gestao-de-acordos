/**
 * O que se diz ao parabenizar os destaques dos quebra-nozes (Cleber, 18/11/2026).
 *
 * Um botão só por espetáculo: na chamada das dez ele vale para todos os
 * destaques; no boletim, para quem mais recebeu. As frases são prontas e nunca
 * falam de valor. Puro, sem React e sem banco: tem teste.
 */
import type { Destaque } from './diretor';
import { rostoDeExemplo } from './exemplos';
import type { AoVivoDoPalco } from './parabensAoVivo';

export interface PessoaDoParabens {
  nome: string;
  foto: string | null;
}

export interface ParabensDoPalco {
  eu: PessoaDoParabens;
  /** Quem está nos cartões não ganha botão: ganha o aviso de que está sendo aplaudido. */
  souDestaque: boolean;
  /** Teste nesta tela: colegas de mentira chegam, e nada sai do navegador. */
  ensaio: boolean;
  /** Show de verdade: o clique vai para os colegas da cidade, e os deles chegam aqui. */
  aoVivo?: AoVivoDoPalco;
}

export interface BalaoDeParabens extends PessoaDoParabens {
  frase: string;
  meu?: boolean;
}

/** Quantos balões cabem na tela ao mesmo tempo. */
export const TETO_DE_BALOES = 6;
/** De quanto em quanto tempo chega um colega no ensaio: o ritmo que a cidade verá. */
export const ENTRE_COLEGAS_MS = 2_000;
/** Quanto o botão leva para recarregar entre um parabéns e outro (também em `.recarregando`, no CSS). */
export const RECARGA_DO_BOTAO_MS = 700;

export const FRASES_PARA_TODOS: readonly string[] = [
  'Parabéns, pessoal!', 'Vocês arrasaram!', 'Merecido demais!', 'Orgulho de vocês!',
  'Show de bola!', 'Mandaram muito bem!', 'Que time!', 'Bora pra cima!',
];

export const FRASES_PARA_UM: readonly string[] = [
  'Parabéns!', 'Arrasou!', 'Merecido demais!', 'Que orgulho!',
  'Show de bola!', 'Mandou muito bem!', 'Tá voando!', 'É isso aí!',
];

export const frasesDoEspetaculo = (quantos: number) => (quantos === 1 ? FRASES_PARA_UM : FRASES_PARA_TODOS);

/** Sorteia a frase. `aleatorio` é injetável para o teste fixar. */
export function sortearFrase(quantos: number, aleatorio: () => number = Math.random): string {
  const lista = frasesDoEspetaculo(quantos);
  const i = Math.floor(aleatorio() * lista.length);
  return lista[Math.min(Math.max(0, i), lista.length - 1)];
}

/** Para quem clica várias vezes: nunca a mesma frase duas vezes seguidas. */
export function sortearOutraFrase(quantos: number, anterior: string | null, aleatorio: () => number = Math.random): string {
  const lista = frasesDoEspetaculo(quantos).filter(frase => frase !== anterior);
  const i = Math.floor(aleatorio() * lista.length);
  return lista[Math.min(Math.max(0, i), lista.length - 1)];
}

export function textoDoBotao(destaques: readonly Pick<Destaque, 'nome'>[]): string {
  return destaques.length === 1 ? `Parabenizar ${destaques[0].nome}` : 'Parabenizar os destaques';
}

export const TEXTO_DE_NOVO = 'Parabenizar de novo';
export const TEXTO_DO_DESTAQUE = 'Seus colegas estão te parabenizando!';

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** `meuNome` já no formato curto dos cartões. Só vale o cartão do meu setor: nome igual em outro setor é outra pessoa. */
export function souDestaque(destaques: readonly Pick<Destaque, 'nome' | 'meu'>[], meuNome: string): boolean {
  const eu = semAcento(meuNome);
  return !!eu && destaques.some(d => d.meu && semAcento(d.nome) === eu);
}

const COLEGAS: readonly PessoaDoParabens[] = [
  { nome: 'Ana Clara', foto: rostoDeExemplo('#F0C7A6', '#5A3524', '#F2DCE2', true) },
  { nome: 'Bruno Melo', foto: rostoDeExemplo('#C9946A', '#1F1A18', '#D9EBDD') },
  { nome: 'Carla Reis', foto: null },
  { nome: 'Diego Prado', foto: rostoDeExemplo('#E8B990', '#3B2B22', '#CFE0F2') },
  { nome: 'Elisa Moura', foto: rostoDeExemplo('#A9744C', '#1F1A18', '#E3E9F1', true) },
  { nome: 'Fábio Dantas', foto: null },
  { nome: 'Gabi Torres', foto: rostoDeExemplo('#F0C7A6', '#B98522', '#F2DCE2', true) },
  { nome: 'Hugo Lopes', foto: rostoDeExemplo('#C9946A', '#7A4A22', '#D9EBDD') },
];

/** O colega de mentira da vez, para o ensaio. */
export function colegaDoEnsaio(vez: number, quantos: number, aleatorio: () => number = Math.random): BalaoDeParabens {
  return { ...COLEGAS[vez % COLEGAS.length], frase: sortearFrase(quantos, aleatorio) };
}
