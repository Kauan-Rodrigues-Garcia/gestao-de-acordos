/**
 * marca.ts — o nome e a cor que a pessoa vê, pela cidade do setor dela.
 *
 * Decisão do kauan em 02/10/2026: BookPlay e PaguePlay deixam de ser regra de
 * negócio e passam a ser só o nome. Quem diz o nome é a cidade do setor:
 *
 *   Birigui  BookPlay   tons azuis
 *   Marília  PaguePlay  tons verdes
 *
 * A COR da marca não é um tema: é o tom de destaque DENTRO dos temas (Claro,
 * Escuro...) — o `data-tenant` no `<html>`, posto por `TenantThemeApplier`
 * (App.tsx). É o mesmo verde que a PaguePlay sempre teve entrando pelo site
 * dela, agora pela pessoa e não pelo endereço. O tema (Claro, Verde, Azul...)
 * é escolha de cada um no menu, e a marca nunca o troca (Cleber, 04/10/2026).
 *
 * A regra de negócio é outra coisa e vem do setor (`lib/regraDoSetor.ts`).
 */

export interface Marca {
  nome: 'BookPlay' | 'PaguePlay';
  /** O tom da marca no `data-tenant`: os destaques azuis ou verdes dos temas. */
  tom: 'bookplay' | 'pagueplay';
}

const BOOKPLAY: Marca = { nome: 'BookPlay', tom: 'bookplay' };
const PAGUEPLAY: Marca = { nome: 'PaguePlay', tom: 'pagueplay' };

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
