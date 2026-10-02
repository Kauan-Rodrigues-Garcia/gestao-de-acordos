/**
 * marca.ts — o nome e a cor que a pessoa vê, pela cidade do setor dela.
 *
 * Decisão do kauan em 02/10/2026: BookPlay e PaguePlay deixam de ser regra de
 * negócio e passam a ser só o nome. Quem diz o nome é a cidade do setor:
 *
 *   Birigui  BookPlay   azul  (tema Claro)
 *   Marília  PaguePlay  verde (tema Verde)
 *
 * A regra de negócio é outra coisa e vem do setor (`lib/regraDoSetor.ts`).
 */
import type { NomeTema } from './temas';

export interface Marca {
  nome: 'BookPlay' | 'PaguePlay';
  /** O tema claro da marca. Tema escuro escolhido pela pessoa fica como está. */
  tema: NomeTema;
}

const BOOKPLAY: Marca = { nome: 'BookPlay', tema: 'light' };
const PAGUEPLAY: Marca = { nome: 'PaguePlay', tema: 'verde' };

function chave(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** A marca da cidade, ou `null` para cidade sem marca (ou setor sem cidade). */
export function marcaDaCidade(nomeDaCidade: string | null | undefined): Marca | null {
  if (!nomeDaCidade) return null;
  const c = chave(nomeDaCidade);
  if (c === 'birigui') return BOOKPLAY;
  if (c === 'marilia') return PAGUEPLAY;
  return null;
}
