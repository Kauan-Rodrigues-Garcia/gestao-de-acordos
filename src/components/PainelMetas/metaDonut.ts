/**
 * As contas do `CardMetaDonut`: a cor do anel e as fatias do breakdown.
 *
 * Fora do componente para o teste alcançá-las sem desenhar o recharts, e
 * porque um arquivo de componente que exporta funções perde o Fast Refresh.
 */

import { agruparFormas } from '@/lib/formasPagamento';

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
 * Agrupa as formas, ordena e calcula a participação de cada uma.
 *
 * O agrupamento é o de `agruparFormas`, o MESMO do «Como o dinheiro chega» do
 * Painel Diretoria: com o 59 o ERP escreve «PIX», «Pix QR Code», «Boleto
 * Negociação»… e o card listava cada variação como se fosse um meio diferente
 * (pedido de 14/09/2026). Duas telas agrupando com regras próprias é como elas
 * passariam a discordar sobre quanto entrou por Pix.
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
  const grupos = agruparFormas(
    Object.entries(porForma).map(([forma, f]) => ({
      forma, valor: f.valor, qtd: f.qtd, valorAnterior: 0,
    })),
  );
  const total = grupos.reduce((s, g) => s + g.valor, 0);
  return grupos.map(g => ({
    label: g.rotulo,
    valor: g.valor,
    qtd: g.qtd,
    perc: total > 0 ? Math.round((g.valor / total) * 1000) / 10 : 0,
  }));
}
