/**
 * payloadEdicaoAcordo.ts — o que a tela de edição grava no acordo.
 *
 * ## Por que virou módulo
 *
 * O payload era montado dentro de `gravar()`, em `AcordoEditInline`. Quando a
 * autorização de NR passou a ser por SOLICITAÇÃO (o líder decide depois, de
 * outra máquina), o mesmo objeto precisou existir em dois momentos: na hora de
 * salvar direto, e na hora de mandar o pedido — porque quem grava, na aprovação,
 * é o servidor, e ele aplica o payload em vez de recalculá-lo.
 *
 * Duas montagens seriam duas verdades: a edição autorizada salvaria coisa
 * diferente da edição comum, e ninguém notaria até o primeiro campo novo.
 *
 * Aqui entra estado de formulário e sai o objeto do `update`. Sem React, sem
 * Supabase — o que permite testar a regra dos 40 % sem montar tela nenhuma.
 */

import {
  buildObservacoesComEstado, formatarTelefonePP,
} from '@/lib/index';
import { calcularParcelas } from '@/lib/money';

/** Formas que aceitam parcelamento na PaguePlay. */
export const TIPOS_PARCELADOS_PP = ['boleto', 'cartao_recorrente', 'pix_automatico'];

export interface EntradaPayloadEdicao {
  isPaguePlay: boolean;
  nomeCliente: string;
  nrCliente: string;
  instituicao: string;
  vencimento: string;
  /** Valor já convertido — na PaguePlay parcelada, é lido como TOTAL. */
  valorNum: number;
  tipo: string;
  parcelasNum: number;
  whatsapp: string;
  status: string;
  observacoes: string;
  /** PaguePlay: vai embutido nas observações. */
  estado: string;
  isExtra: boolean;
  tagIds: string[];
  /**
   * PaguePlay e o parcelamento mudou: o valor da linha e o total precisam ser
   * recalculados. Fora disso, os campos de parcela não são tocados.
   */
  parcelamentoAlterado: boolean;
  /** Do acordo em edição — base do recálculo. */
  usouQuarentaPct: boolean;
  numeroParcela: number;
  /**
   * Campos que os casos Direto/Extra impõem (`tipo_vinculo` e o par do
   * vínculo). Aplicados por último: a decisão do fluxo vence o toggle da tela.
   */
  override?: Record<string, unknown>;
}

/**
 * O objeto do `update`.
 *
 * Toda chave presente aqui SERÁ gravada, inclusive as com `null` — limpar uma
 * observação é mandar `null` de propósito. O servidor, quando aplica este mesmo
 * payload na aprovação de um pedido, respeita isso: só toca no que veio.
 */
export function montarPayloadEdicao(e: EntradaPayloadEdicao): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nome_cliente: e.nomeCliente.trim(),
    nr_cliente:   e.nrCliente.trim(),
    vencimento:   e.vencimento,
    valor:        e.valorNum,
    tipo:         e.tipo,
    // BookPlay: qualquer forma parcela, então o número vale sempre. Na
    // PaguePlay a trava por forma continua valendo.
    parcelas: e.isPaguePlay
      ? (TIPOS_PARCELADOS_PP.includes(e.tipo) && !Number.isNaN(e.parcelasNum) ? e.parcelasNum : 1)
      : (Number.isNaN(e.parcelasNum) ? 1 : e.parcelasNum),
    whatsapp: e.isPaguePlay ? formatarTelefonePP(e.whatsapp) : (e.whatsapp.trim() || null),
    status:   e.status,
    observacoes: e.isPaguePlay
      ? buildObservacoesComEstado(e.estado, e.observacoes)
      : (e.observacoes.trim() || null),
    tipo_vinculo: e.isExtra ? 'extra' : 'direto',
    tag_ids: e.tagIds.length > 0 ? e.tagIds : null,
    instituicao: e.instituicao.trim() || null,
  };

  // Depois do payload base: os casos Direto/Extra mandam em `tipo_vinculo` e no
  // par do vínculo, e o toggle da tela não pode desfazer a decisão do fluxo.
  Object.assign(payload, e.override ?? {});

  // PP + parcelamento alterado: mesma fórmula do acordo novo. O valor digitado é
  // lido como TOTAL; a linha guarda a parcela corrente (`valor`) e o total
  // (`valor_total`), respeitando a regra dos 40 % do acordo.
  if (e.parcelamentoAlterado) {
    const ehParcelado = TIPOS_PARCELADOS_PP.includes(e.tipo) && e.parcelasNum > 1;
    if (ehParcelado) {
      // A regra dos 40 % só existe a partir de três parcelas — com duas, a
      // primeira seria 40 % e a segunda 60 %, que não é o acordo que se vendeu.
      const quarentaEfetivo = e.usouQuarentaPct && e.parcelasNum > 2;
      const numeroParcela   = Math.min(e.numeroParcela, e.parcelasNum);
      const todas = calcularParcelas(e.valorNum, e.parcelasNum, quarentaEfetivo);
      payload.valor             = todas[numeroParcela - 1];
      payload.valor_total       = e.valorNum;
      payload.usou_quarenta_pct = quarentaEfetivo;
      payload.numero_parcela    = numeroParcela;
    } else {
      payload.valor_total       = null;
      payload.usou_quarenta_pct = false;
    }
  }

  return payload;
}
