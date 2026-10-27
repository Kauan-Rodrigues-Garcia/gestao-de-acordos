/**
 * parcela-minima.ts — nenhuma parcela da campanha abaixo de R$ 30 (26/10/2026).
 *
 * Pedido do usuário: «qualquer tipo de parcelamento, o valor mínimo da parcela
 * tem que ser de R$ 30». Um Pix Automático em 21x de R$ 15 não pode sair.
 *
 * A campanha trava, e o líder escolhe: tira esses clientes, troca a mensagem,
 * edita a mensagem do cliente, ou (27/10/2026):
 *
 * • Recalcula: as variáveis de parcelamento passaram a sair com as vezes
 *   («21x de R$ 15,00»), então dá para trocar as vezes junto com o valor —
 *   «10x de R$ 32,00», no máximo de vezes que mantém a parcela no mínimo, sem
 *   mudar o total.
 * • Mantém mesmo assim: algumas formas de pagamento aceitam parcela menor, e
 *   isso fica com o líder que libera. Pix Automático e Cartão Recorrente NÃO
 *   aceitam (`rigida`): esses continuam travando.
 *
 * Vale só para o que se monta daqui em diante; as campanhas já lançadas ficam
 * como estão.
 */
import { CampaignCore, type CampaignItem, type Discounts } from './lib/campaign-core';

export const PARCELA_MINIMA = 30;

/** A pendência, como aparece na tabela e no grupo de pendências. */
export const PENDENCIA_PARCELA_MINIMA = `Parcela abaixo de ${CampaignCore.formatCurrency(PARCELA_MINIMA)}`;

/** A parcela baixa que o líder decidiu manter (27/10/2026). Não trava. */
export const PENDENCIA_PARCELA_MANTIDA = `Parcela abaixo de ${CampaignCore.formatCurrency(PARCELA_MINIMA)} mantida pelo líder`;

interface VariavelParcelada {
  variavel: string;
  rotulo: string;
  vezes: number;
  parcela: (i: CampaignItem) => number | null | undefined;
  /** O total que foi dividido — é dele que sai a sugestão de vezes. */
  total: (i: CampaignItem, d: Discounts) => number | null | undefined;
  /** Pix Automático e Cartão Recorrente: abaixo do mínimo não sai nunca. */
  rigida?: boolean;
}

const comDesconto = (pct: keyof Discounts) => (i: CampaignItem, d: Discounts) =>
  i.openValue == null ? null : i.openValue * (1 - (Number(d[pct]) || 0) / 100);
const pixComDesconto = comDesconto('pix_automatico');
const recorrenteComDesconto = comDesconto('cartao_recorrente');

/**
 * As variáveis que são UMA parcela de um total dividido. Ficam de fora as que
 * são valor à vista ({{quitacao}}, {{juncao}}, {{anual}}…) e as «_parcela»
 * do Pix Automático e do Cartão Recorrente, que são a parcela do próprio
 * contrato do cliente, não um parcelamento que a campanha oferece.
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
  { variavel: 'pix_automatico_12x', rotulo: 'Pix Automático em 12x', vezes: 12, parcela: (i) => i.installments?.pixAuto[12], total: (i) => i.openValue, rigida: true },
  { variavel: 'pix_automatico_20x', rotulo: 'Pix Automático em 20x', vezes: 20, parcela: (i) => i.installments?.pixAuto[20], total: (i) => i.openValue, rigida: true },
  { variavel: 'pix_automatico_21x', rotulo: 'Pix Automático em 21x', vezes: 21, parcela: (i) => i.pixAuto, total: (i) => i.openValue, rigida: true },
  { variavel: 'pix_automatico_desconto_12x', rotulo: 'Pix Automático com desconto em 12x', vezes: 12, parcela: (i) => i.installments?.pixAutoDiscount[12], total: pixComDesconto, rigida: true },
  { variavel: 'pix_automatico_desconto_20x', rotulo: 'Pix Automático com desconto em 20x', vezes: 20, parcela: (i) => i.installments?.pixAutoDiscount[20], total: pixComDesconto, rigida: true },
  { variavel: 'pix_automatico_desconto_21x', rotulo: 'Pix Automático com desconto em 21x', vezes: 21, parcela: (i) => i.pixAutoDiscount, total: pixComDesconto, rigida: true },
  { variavel: 'cartao_recorrente_12x', rotulo: 'Cartão Recorrente em 12x', vezes: 12, parcela: (i) => i.installments?.cardRecurring?.[12], total: (i) => i.openValue, rigida: true },
  { variavel: 'cartao_recorrente_20x', rotulo: 'Cartão Recorrente em 20x', vezes: 20, parcela: (i) => i.installments?.cardRecurring?.[20], total: (i) => i.openValue, rigida: true },
  { variavel: 'cartao_recorrente_21x', rotulo: 'Cartão Recorrente em 21x', vezes: 21, parcela: (i) => i.cardRecurring, total: (i) => i.openValue, rigida: true },
  { variavel: 'cartao_recorrente_desconto_12x', rotulo: 'Cartão Recorrente com desconto em 12x', vezes: 12, parcela: (i) => i.installments?.cardRecurringDiscount?.[12], total: recorrenteComDesconto, rigida: true },
  { variavel: 'cartao_recorrente_desconto_20x', rotulo: 'Cartão Recorrente com desconto em 20x', vezes: 20, parcela: (i) => i.installments?.cardRecurringDiscount?.[20], total: recorrenteComDesconto, rigida: true },
  { variavel: 'cartao_recorrente_desconto_21x', rotulo: 'Cartão Recorrente com desconto em 21x', vezes: 21, parcela: (i) => i.cardRecurringDiscount, total: recorrenteComDesconto, rigida: true },
];

/**
 * Quantas vezes cada variável de parcelamento já escreve («12x de …»). O
 * editor avisa quando a mensagem repete as vezes antes dela.
 */
export const VEZES_DA_VARIAVEL: Readonly<Record<string, number>> = Object.fromEntries(
  VARIAVEIS_PARCELADAS.map((v) => [v.variavel, v.vezes]),
);

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
  /** Pix Automático e Cartão Recorrente: não dá para manter. */
  rigida: boolean;
}

/** A variável como sai na mensagem: «21x de R$ 15,00». */
export function textoParcelado(vezes: number, parcela: number): string {
  return `${vezes}x de ${CampaignCore.formatCurrency(parcela)}`;
}

/**
 * O parcelamento refeito de cada parcela baixa que tem conserto: a variável →
 * o texto novo («10x de R$ 32,00»). Sem sugestão (nem 2x cabe), fica de fora.
 */
export function recalculoDasBaixas(baixas: readonly ParcelaBaixa[]): Record<string, string> {
  const novas: Record<string, string> = {};
  for (const b of baixas) {
    if (b.sugestao) novas[b.variavel] = textoParcelado(b.sugestao.vezes, b.sugestao.parcela);
  }
  return novas;
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
      rigida: !!v.rigida,
    });
  }
  return baixas;
}

export interface ContagemDasParcelas {
  /** Clientes com alguma parcela baixa que o recálculo conserta. */
  recalculaveis: number;
  /** Clientes com o parcelamento refeito (com «recalcular» ligado). */
  recalculadas: number;
  /** Clientes que saem com parcela baixa porque o líder manteve. */
  mantidas: number;
  /** Clientes travados por Pix Automático ou Cartão Recorrente. */
  rigidas: number;
  /** Clientes travados que o «manter mesmo assim» libera. */
  mantiveis: number;
}

/**
 * A parcela mínima aplicada à campanha montada (26/10 e 27/10/2026). Mexe nos
 * itens: troca a mensagem dos editados à mão, refaz o parcelamento quando
 * `recalcular`, e marca a pendência. Devolve as parcelas que ainda TRAVAM,
 * por linha, e a contagem para o aviso.
 */
export function aplicarParcelaMinima(
  itens: CampaignItem[],
  corpo: string,
  discounts: Discounts,
  opcoes: { recalcular: boolean; manter: boolean; editadas: ReadonlyMap<number, string> },
): { travadas: Map<number, ParcelaBaixa[]>; contagem: ContagemDasParcelas } {
  const travadas = new Map<number, ParcelaBaixa[]>();
  const contagem: ContagemDasParcelas = { recalculaveis: 0, recalculadas: 0, mantidas: 0, rigidas: 0, mantiveis: 0 };
  const variaveis = variaveisParceladasDoModelo(corpo);
  for (const item of itens) {
    const editada = opcoes.editadas.get(item.rowNumber);
    if (editada != null) item.message = editada;
    if (variaveis.length === 0) continue;
    let baixas = parcelasBaixasDoItem(item, variaveis, discounts);
    if (baixas.length === 0) continue;
    // Editada sem o valor baixo, passa.
    if (editada != null && !mensagemAindaTemParcelaBaixa(editada, baixas)) continue;
    const novas = recalculoDasBaixas(baixas);
    const temConserto = Object.keys(novas).length > 0;
    if (temConserto) contagem.recalculaveis++;
    // A editada à mão é do líder: o recálculo não mexe nela.
    if (opcoes.recalcular && temConserto && editada == null) {
      item.variableOverrides = novas;
      for (const b of baixas) {
        const nova = novas[b.variavel];
        if (nova) item.message = item.message.split(textoParcelado(b.vezes, b.parcela)).join(nova);
      }
      baixas = baixas.filter((b) => !novas[b.variavel]);
      contagem.recalculadas++;
      if (baixas.length === 0) continue;
    }
    const rigida = baixas.some((b) => b.rigida);
    item.status = 'Revisar';
    if (opcoes.manter && !rigida) {
      contagem.mantidas++;
      item.issues.push(PENDENCIA_PARCELA_MANTIDA);
      continue;
    }
    if (rigida) contagem.rigidas++;
    else contagem.mantiveis++;
    travadas.set(item.rowNumber, baixas);
    item.issues.push(PENDENCIA_PARCELA_MINIMA);
  }
  return { travadas, contagem };
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
