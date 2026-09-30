/**
 * Onde a pessoa está no ranking do mês — «4º de 18, faltam R$ 320 para o 3º».
 *
 * Saiu de `AnaliticoOperador` para a tela mínima do celular (`/m`) responder a
 * mesma pergunta com a mesma conta: ordem por `total_recebido`, sem quem está
 * de férias ou desligado (`idsOcultosRankingQuartil`).
 */

export interface LinhaRanking {
  operador_id: string;
  total_recebido: number;
}

export interface PosicaoNoRanking {
  posicao: number;
  de: number;
  /** Quanto falta para o degrau de cima. `null` no primeiro lugar. */
  faltam: number | null;
}

export function posicaoNoRanking(
  ranking: readonly LinhaRanking[],
  ocultos: ReadonlySet<string>,
  operadorId: string,
): PosicaoNoRanking | null {
  const visiveis = ranking
    .filter(r => !ocultos.has(r.operador_id))
    .sort((a, b) => b.total_recebido - a.total_recebido);
  const i = visiveis.findIndex(r => r.operador_id === operadorId);
  if (i < 0) return null;
  return {
    posicao: i + 1,
    de: visiveis.length,
    faltam: i === 0 ? null : visiveis[i - 1].total_recebido - visiveis[i].total_recebido,
  };
}
