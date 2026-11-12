/**
 * O elenco dos quebra-nozes (Cleber, 12/11/2026).
 *
 * São três, e cada cidade vê dois ao mesmo tempo:
 *
 *   Marília   o diretor Anderson + o head Robson
 *   Birigui   o diretor Anderson + a head Jessica
 *
 * Setor sem cidade não vê ninguém. A foto é a do perfil de cada um, lida na
 * hora de cada aparição: quem trocar a foto aparece com a nova, e quem ainda
 * não tem foto aparece com o rosto de madeira do boneco.
 *
 * A farda é a identidade de cada um e não muda: vermelha para o diretor, e a
 * cor da marca da cidade para o head (Birigui é azul, Marília é verde —
 * `lib/marca.ts`).
 */
import type { Quem } from './deixas';

export type Cidade = 'birigui' | 'marilia';
export type NomeFarda = 'vermelha' | 'verde' | 'azul';
export type Emblema = 'estrela' | 'floco' | 'pinheiro';

export interface Farda {
  casaco: string;
  escuro: string;
  claro: string;
  pluma: string;
  plumaSombra: string;
}

export const FARDAS: Record<NomeFarda, Farda> = {
  vermelha: { casaco: '#D42C30', escuro: '#9E1D25', claro: '#F36A5E', pluma: '#FFFFFF', plumaSombra: '#D9DDE6' },
  verde: { casaco: '#1F8F5A', escuro: '#12633D', claro: '#56C48E', pluma: '#E5403A', plumaSombra: '#B02A2A' },
  azul: { casaco: '#2B66C0', escuro: '#1A4588', claro: '#6AA0EA', pluma: '#F4C542', plumaSombra: '#C9962A' },
};

export interface Artista {
  q: Quem;
  /** O primeiro nome, como aparece na plaquinha e nas falas. */
  nome: string;
  /** «o Robson», «a Jessica»: as falas pedem o artigo. */
  artigo: 'o' | 'a';
  cargo: string;
  farda: NomeFarda;
  emblema: Emblema;
  /** A foto do perfil; `null` = rosto de madeira. */
  foto: string | null;
}

export const DIRETOR: Omit<Artista, 'foto'> = { q: 'a', nome: 'Anderson', artigo: 'o', cargo: 'Diretor', farda: 'vermelha', emblema: 'estrela' };

export const HEADS: Record<Cidade, Omit<Artista, 'foto'>> = {
  marilia: { q: 'b', nome: 'Robson', artigo: 'o', cargo: 'Head', farda: 'verde', emblema: 'pinheiro' },
  birigui: { q: 'b', nome: 'Jessica', artigo: 'a', cargo: 'Head', farda: 'azul', emblema: 'floco' },
};

export const NOME_DA_CIDADE: Record<Cidade, string> = { birigui: 'Birigui', marilia: 'Marília' };

/** A cidade do setor (como vier: «Marília», «marilia»…), ou `null` — e aí ninguém aparece. */
export function cidadeDoElenco(nomeDaCidade: string | null | undefined): Cidade | null {
  if (!nomeDaCidade) return null;
  const c = nomeDaCidade.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return c === 'birigui' || c === 'marilia' ? c : null;
}

export function elencoDaCidade(cidade: Cidade, fotos: { a?: string | null; b?: string | null } = {}): { a: Artista; b: Artista } {
  return { a: { ...DIRETOR, foto: fotos.a ?? null }, b: { ...HEADS[cidade], foto: fotos.b ?? null } };
}
