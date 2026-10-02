/**
 * regraDoSetor.ts — a regra de negócio de um setor: Nosso produto ou Cofen.
 *
 * Decisão do kauan em 02/10/2026: BookPlay e PaguePlay passam a ser só o nome
 * (dado pela cidade do setor), e a regra (relatório importado, tabela de
 * acordos, como o acordo é salvo) é escolhida por setor, pelo super admin.
 *
 *   nosso_produto  a regra que a BookPlay usa hoje
 *   cofen          a regra que a PaguePlay usa hoje
 *
 * Coluna `setores.regra` (migration 20261003150000).
 */

export type RegraDoSetor = 'nosso_produto' | 'cofen';

export const ROTULO_REGRA: Readonly<Record<RegraDoSetor, string>> = {
  nosso_produto: 'Nosso produto',
  cofen: 'Cofen',
};

export function ehRegraDoSetor(v: unknown): v is RegraDoSetor {
  return v === 'nosso_produto' || v === 'cofen';
}
