/**
 * As contas do `CardMetaDonut`: a cor do anel e as fatias do breakdown.
 *
 * Fora do componente para o teste alcançá-las sem desenhar o recharts, e
 * porque um arquivo de componente que exporta funções perde o Fast Refresh.
 */

/**
 * Faixas de cor do card original.
 *
 * As MESMAS do card antigo (100 / 70 / 40), e não as de quartil: aqui se mede
 * a meta do mês, não a projeção contra o esperado até hoje.
 */
export function corDaMeta(pct: number): string {
  if (pct >= 100) return '#22c55e';
  if (pct >= 70)  return '#6366f1';
  if (pct >= 40)  return '#f59e0b';
  return '#ef4444';
}

export interface FatiaForma {
  label: string;
  /**
   * Valor na unidade que o painel está exibindo — H.O. ou bruto.
   *
   * Chamava-se `bruto` quando só havia uma unidade possível. O nome neutro
   * evita a leitura errada de que a fatia é sempre o valor cheio: com o
   * alternador da PaguePlay em H.O., isto aqui é H.O.
   */
  valor: number;
  qtd: number;
  /** Participação no total recebido, em %. */
  perc: number;
}

/**
 * Ordena as formas e calcula a participação de cada uma.
 *
 * A % é sobre o VALOR, não sobre a quantidade de pagamentos: num painel de
 * recebimento, "40% veio de Pix" precisa querer dizer 40% do dinheiro. O
 * card antigo dividia por quantidade de acordos, o que fazia dez boletos
 * pequenos pesarem mais que um cartão grande.
 *
 * A participação é a mesma nas duas unidades — o H.O. é uma fração do bruto —,
 * então trocar o alternador reordena nada: só muda o valor impresso.
 */
export function fatiasDeForma(
  porForma: Record<string, { valor: number; qtd: number }>,
): FatiaForma[] {
  const entradas = Object.entries(porForma);
  const total = entradas.reduce((s, [, f]) => s + f.valor, 0);
  return entradas
    .map(([label, f]) => ({
      label,
      valor: f.valor,
      qtd: f.qtd,
      perc: total > 0 ? Math.round((f.valor / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}
