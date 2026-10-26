/**
 * parcela-minima.ts — nenhuma parcela da campanha abaixo de R$ 30 (26/10/2026).
 *
 * Pedido do usuário: «qualquer tipo de parcelamento, o valor mínimo da parcela
 * tem que ser de R$ 30». Um Pix Automático em 21x de R$ 15 não pode sair.
 *
 * Não dá para corrigir sozinho: o número de vezes («21x») é texto fixo da
 * mensagem na maioria dos modelos, não variável. Subir o valor sem mexer nas
 * vezes mudaria o total prometido. Então a campanha trava, e o líder escolhe:
 * tira esses clientes, troca a mensagem, ou edita a mensagem do cliente — e
 * aqui sai a sugestão de em quantas vezes o total cabe.
 *
 * Vale só para o que se monta daqui em diante; as campanhas já lançadas ficam
 * como estão.
 */
import { CampaignCore, type CampaignItem, type Discounts } from './lib/campaign-core';

export const PARCELA_MINIMA = 30;

/** A pendência, como aparece na tabela e no grupo de pendências. */
export const PENDENCIA_PARCELA_MINIMA = `Parcela abaixo de ${CampaignCore.formatCurrency(PARCELA_MINIMA)}`;

interface VariavelParcelada {
  variavel: string;
  rotulo: string;
  vezes: number;
  parcela: (i: CampaignItem) => number | null | undefined;
  /** O total que foi dividido — é dele que sai a sugestão de vezes. */
  total: (i: CampaignItem, d: Discounts) => number | null | undefined;
}

const pixComDesconto = (i: CampaignItem, d: Discounts) =>
  i.openValue == null ? null : i.openValue * (1 - (Number(d.pix_automatico) || 0) / 100);

/**
 * As variáveis que são UMA parcela de um total dividido. Ficam de fora as que
 * são valor à vista ({{quitacao}}, {{juncao}}, {{anual}}…) e a
 * {{pix_automatico_parcela}}, que é a parcela do próprio contrato do cliente,
 * não um parcelamento que a campanha oferece.
 */
const VARIAVEIS_PARCELADAS: readonly VariavelParcelada[] = [
  { variavel: 'juncao_6x', rotulo: 'Junção em 6x', vezes: 6, parcela: (i) => i.installments?.bundle[6], total: (i) => i.bundle },
  { variavel: 'juncao_12x', rotulo: 'Junção em 12x', vezes: 12, parcela: (i) => i.installments?.bundle[12], total: (i) => i.bundle },
  { variavel: 'cartao_quitacao', rotulo: 'Quitação em 12x no cartão', vezes: 12, parcela: (i) => i.cardSettlement, total: (i) => i.settlement },
  { variavel: 'cartao_quitacao_20x', rotulo: 'Quitação em 20x no cartão', vezes: 20, parcela: (i) => i.installments?.cardSettlement[20], total: (i) => i.settlement },
  { variavel: 'cartao_quitacao_21x', rotulo: 'Quitação em 21x no cartão', vezes: 21, parcela: (i) => i.installments?.cardSettlement[21], total: (i) => i.settlement },
  { variavel: 'cartao_anual', rotulo: 'Plano anual em 12x no cartão', vezes: 12, parcela: (i) => i.cardAnnual, total: (i) => i.annual },
  { variavel: 'cartao_anual_20x', rotulo: 'Plano anual em 20x no cartão', vezes: 20, parcela: (i) => i.installments?.cardAnnual[20], total: (i) => i.annual },
  { variavel: 'cartao_anual_21x', rotulo: 'Plano anual em 21x no cartão', vezes: 21, parcela: (i) => i.installments?.cardAnnual[21], total: (i) => i.annual },
  { variavel: 'pix_automatico_12x', rotulo: 'Pix Automático em 12x', vezes: 12, parcela: (i) => i.installments?.pixAuto[12], total: (i) => i.openValue },
  { variavel: 'pix_automatico_20x', rotulo: 'Pix Automático em 20x', vezes: 20, parcela: (i) => i.installments?.pixAuto[20], total: (i) => i.openValue },
  { variavel: 'pix_automatico_21x', rotulo: 'Pix Automático em 21x', vezes: 21, parcela: (i) => i.pixAuto, total: (i) => i.openValue },
  { variavel: 'pix_automatico_desconto_12x', rotulo: 'Pix Automático com desconto em 12x', vezes: 12, parcela: (i) => i.installments?.pixAutoDiscount[12], total: pixComDesconto },
  { variavel: 'pix_automatico_desconto_20x', rotulo: 'Pix Automático com desconto em 20x', vezes: 20, parcela: (i) => i.installments?.pixAutoDiscount[20], total: pixComDesconto },
  { variavel: 'pix_automatico_desconto_21x', rotulo: 'Pix Automático com desconto em 21x', vezes: 21, parcela: (i) => i.pixAutoDiscount, total: pixComDesconto },
];

/** As variáveis parceladas que o modelo cita. */
export function variaveisParceladasDoModelo(corpo: string): readonly VariavelParcelada[] {
  const texto = String(corpo ?? '');
  return VARIAVEIS_PARCELADAS.filter((v) => new RegExp(`{{\\s*${v.variavel}\\s*}}`, 'i').test(texto));
}

/** Em quantas vezes o total cabe sem passar do mínimo. `null` = nem 2x cabe. */
export function sugestaoDeParcelas(total: number | null | undefined): { vezes: number; parcela: number } | null {
  if (total == null || !Number.isFinite(total) || total <= 0) return null;
  const vezes = Math.floor(total / PARCELA_MINIMA);
  if (vezes < 2) return null;
  // Para cima, como o core arredonda as parcelas.
  return { vezes, parcela: Math.ceil(total / vezes - Number.EPSILON) };
}

export interface ParcelaBaixa {
  variavel: string;
  rotulo: string;
  vezes: number;
  parcela: number;
  /** O valor como está escrito na mensagem («R$ 15,00»). */
  parcelaTexto: string;
  total: number | null;
  sugestao: { vezes: number; parcela: number } | null;
}

/**
 * As parcelas deste cliente que ficam abaixo do mínimo. Parcela zero fica de
 * fora: só sai quando falta o valor no arquivo, e isso já é pendência grave.
 */
export function parcelasBaixasDoItem(
  item: CampaignItem,
  variaveis: readonly VariavelParcelada[],
  discounts: Discounts,
): ParcelaBaixa[] {
  if (!item.financialDataAvailable) return [];
  const baixas: ParcelaBaixa[] = [];
  for (const v of variaveis) {
    const parcela = v.parcela(item);
    if (parcela == null || !(parcela > 0) || parcela >= PARCELA_MINIMA) continue;
    const total = v.total(item, discounts) ?? null;
    baixas.push({
      variavel: v.variavel,
      rotulo: v.rotulo,
      vezes: v.vezes,
      parcela,
      parcelaTexto: CampaignCore.formatCurrency(parcela),
      total,
      sugestao: sugestaoDeParcelas(total),
    });
  }
  return baixas;
}

/**
 * A mensagem editada à mão ainda tem alguma das parcelas baixas? Se o líder
 * trocou «21x de R$ 15,00» por «10x de R$ 31,50», o valor baixo sumiu do texto
 * e a mensagem passa. Se só salvou sem mexer, continua travada.
 */
export function mensagemAindaTemParcelaBaixa(mensagem: string, baixas: readonly ParcelaBaixa[]): boolean {
  const texto = String(mensagem ?? '').replace(/\s+/g, ' ');
  return baixas.some((b) => texto.includes(b.parcelaTexto.replace(/\s+/g, ' ')));
}
