/**
 * O contexto do desafio na unidade do Painel do Líder — 30/09/2026.
 *
 * O card de equipe e de setor do Painel (Desempenho Equipes → `CardEquipe`) lê
 * a PaguePlay em H.O.: o recebido é a coluna `total_ho` do relatório e a meta é
 * a bruta convertida pelo percentual da aba Metas (`metaNaUnidade`). O desafio
 * lia em bruto contra a meta bruta, e a projeção das duas telas divergia desde
 * que o H.O. passou a vir do relatório (29/09/2026).
 *
 * Aqui a equipe e o setor de empresa que mede em H.O. (`empresas_ho`, de
 * `fn_desafio_contexto_equipe` — migration 20260930115849) trocam os dois
 * números para H.O. Daí em diante `calcularDesafio` não sabe de unidade
 * nenhuma: a mesma conta, com os números que o Painel usa.
 *
 * O percentual é o DA EMPRESA DA EQUIPE, não o de quem olha: o desafio pode
 * juntar BookPlay e PaguePlay, e quem abre da BookPlay tem outro percentual
 * carregado (ou nenhum).
 *
 * Sem `empresas_ho` (migration não aplicada), nada muda — o comportamento de
 * antes, em bruto.
 */

export interface SomaMes { total: number; qtd: number }
export interface SomaMesComHO extends SomaMes { totalHO?: number }

/** A meta bruta em H.O., ao centavo — a mesma conta de `metaNaUnidade`. */
export function metaEmHO(bruta: number, percentual: number): number {
  return Math.round(bruta * percentual * 100) / 100;
}

export function converterParaHO(
  metas: Record<string, number> | undefined,
  recebidos: Record<string, SomaMesComHO> | undefined,
  empresaDe: Record<string, string> | undefined,
  empresasHO: Record<string, number> | undefined,
): { metas: Record<string, number> | undefined; recebidos: Record<string, SomaMes> | undefined } {
  const semHO = (r: Record<string, SomaMesComHO> | undefined) => r
    ? Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { total: v.total, qtd: v.qtd }]))
    : undefined;

  if (!empresasHO || Object.keys(empresasHO).length === 0) {
    return { metas, recebidos: semHO(recebidos) };
  }
  const pct = (id: string): number | null => {
    const emp = empresaDe?.[id];
    const p = emp ? empresasHO[emp] : undefined;
    return typeof p === 'number' && p > 0 && p < 1 ? p : null;
  };

  const metasHO = metas
    ? Object.fromEntries(Object.entries(metas).map(([id, v]) => {
        const p = pct(id);
        return [id, p === null ? v : metaEmHO(v, p)];
      }))
    : undefined;

  const recebidosHO = recebidos
    ? Object.fromEntries(Object.entries(recebidos).map(([id, v]) => {
        const p = pct(id);
        return [id, { total: p === null ? v.total : (v.totalHO ?? 0), qtd: v.qtd }];
      }))
    : undefined;

  return { metas: metasHO, recebidos: recebidosHO };
}
