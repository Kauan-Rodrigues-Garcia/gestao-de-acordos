/**
 * descontoDaEdicao.ts — trocar o desconto de uma campanha já lançada (11/11/2026).
 *
 * Pedido: ao editar a campanha, o líder também muda o desconto, e a mudança
 * vale SÓ para esta campanha. As mensagens já enviadas (ou copiadas, ou «não
 * deu») não mudam, as outras campanhas não mudam, e as configurações de
 * desconto do setor também não.
 *
 * Na liberação, o desconto é «assado» nas variáveis de cada mensagem
 * ({{quitacao}} = R$ 700,00). Para refazer a conta com outro %, cada mensagem
 * guarda agora os números do cliente que a conta usa (`base`: parcelas em
 * atraso, valor, valor aberto e valor atualizado). A conta é a mesma do core
 * (`deriveRecord` + `variablesFor`) — o que sai na edição é o que sairia se a
 * campanha tivesse sido montada com o % novo.
 *
 * Só as variáveis de valor e de % são refeitas; nome, CPF, contrato, empresa,
 * link e os dados do mailing ficam como estavam. A parcela mínima de R$ 30
 * (`parcela-minima.ts`) vale aqui também: o % novo pode derrubar uma parcela.
 *
 * Campanha lançada antes disso não tem `base`: o desconto dela não muda.
 */
import { CampaignCore, type CampaignItem, type Discounts, type RawRecord } from './lib/campaign-core';
import {
  aplicarParcelaMinima, parcelasBaixasDoItem, variaveisParceladasDoModelo, type ContagemDasParcelas,
} from './parcela-minima';
import { lerPercentual } from './percentual';

/** Cada %, e o que ele muda (21/10/2026): um desconto, um grupo de variáveis. */
export const DISCOUNT_FIELDS: [keyof Discounts, string, string][] = [
  ['overdue', 'Atrasadas', 'Todas e 1 parcela'],
  ['settlement', 'Quitação', 'Pix e cartão'],
  ['interest', 'Juros', 'Saldo com juros'],
  ['bundle', 'Junção', 'À vista, 6x e 12x'],
  ['annual', 'Anual', 'À vista e cartão'],
  ['pix_automatico', 'Pix Automático', 'Com desconto e só a parcela'],
  ['cartao_recorrente', 'Cartão Recorrente', 'Com desconto e só a parcela'],
];

/** Os números do cliente que a conta do desconto usa, como o core os leu do arquivo. */
export interface BaseDoContato {
  parcelas: number;
  valor: number;
  valor_aberto: number;
  valor_atualizado: number;
}

/** A base de um item da campanha. Sem valores no arquivo (relatório 245): `null`. */
export function baseDoItem(item: CampaignItem): BaseDoContato | null {
  if (!item.financialDataAvailable) return null;
  return {
    parcelas: item.overdueCount ?? 0,
    valor: item.value ?? 0,
    valor_aberto: item.openValue ?? 0,
    valor_atualizado: item.updatedValue ?? 0,
  };
}

/** A variável que mostra cada % na mensagem ({{pct_quitacao}} = «30%»). */
export const VARIAVEL_DO_PCT: Readonly<Record<keyof Discounts, string>> = {
  overdue: 'pct_atraso',
  settlement: 'pct_quitacao',
  interest: 'pct_juros',
  bundle: 'pct_juncao',
  annual: 'pct_anual',
  pix_automatico: 'pct_pix_automatico',
  cartao_recorrente: 'pct_cartao_recorrente',
};

/**
 * Os % com que a campanha foi montada, lidos das variáveis de uma mensagem
 * («7,5%» → 7.5). `null` se faltar algum — a campanha é de antes dele existir.
 */
export function descontosDasVariaveis(vars: Record<string, string> | null | undefined): Discounts | null {
  if (!vars) return null;
  const d = {} as Discounts;
  for (const [chave, variavel] of Object.entries(VARIAVEL_DO_PCT) as [keyof Discounts, string][]) {
    const n = lerPercentual(String(vars[variavel] ?? ''));
    if (n === null) return null;
    d[chave] = n;
  }
  return d;
}

export function descontosIguais(a: Discounts, b: Discounts): boolean {
  return DISCOUNT_FIELDS.every(([k]) => Number(a[k]) === Number(b[k]));
}

/** 1234.5 → «1234,5»: o core lê vírgula sozinha como decimal, sem ambiguidade de milhar. */
const numeroDoArquivo = (n: number) => (Number.isFinite(n) ? String(n).replace('.', ',') : '');

/**
 * O item refeito a partir da base, com os % novos. Só as contas de valor
 * servem: nome, telefone e o resto não estão aqui (ficam nas variáveis antigas).
 */
export function itemDaBase(base: BaseDoContato, discounts: Discounts, rowNumber = 0): CampaignItem {
  const h = CampaignCore.normalizeHeader;
  const record: RawRecord = {
    rowNumber,
    values: {},
    normalized: {
      [h('Parcelas em atraso')]: numeroDoArquivo(base.parcelas),
      [h('Valor')]: numeroDoArquivo(base.valor),
      [h('Valor Aberto')]: numeroDoArquivo(base.valor_aberto),
      [h('Valor Atualizado')]: numeroDoArquivo(base.valor_atualizado),
    },
    sourceType: 'report-247',
    financialDataAvailable: true,
  };
  return CampaignCore.deriveRecord(record, discounts);
}

/**
 * As variáveis que dependem dos valores do cliente ou dos % — as que a edição
 * refaz. As outras (nome, CPF, contrato, empresa, link, mailing) ficam.
 */
const VARIAVEL_DE_VALOR = /^(?:pct_|parcela_desconto$|uma_parcela_desconto$|quitacao$|valor_com_juros$|juncao|anual$|cartao_|pix_automatico)/;

export function eVariavelDeValor(chave: string): boolean {
  return VARIAVEL_DE_VALOR.test(chave);
}

/** Só as variáveis de valor e de %, calculadas com os % novos. */
export function variaveisDeValor(item: CampaignItem, discounts: Discounts): Record<string, string> {
  const todas = CampaignCore.variablesFor(item, discounts);
  const novas: Record<string, string> = {};
  for (const [k, v] of Object.entries(todas)) if (eVariavelDeValor(k)) novas[k] = v;
  return novas;
}

/** Uma mensagem pendente da campanha, como a edição lê do banco. */
export interface PendenteComBase {
  id: string;
  variaveis: Record<string, string> | null;
  base: BaseDoContato | null;
}

export interface RecalculoDosPendentes {
  /** O que vai ao banco: só as variáveis de valor, que sobrescrevem as antigas. */
  novas: { id: string; variaveis: Record<string, string> }[];
  /** Mensagens com alguma parcela abaixo de R$ 30 com o desconto novo, antes de qualquer conserto. */
  comParcelaBaixa: number;
  /** Mensagens que ainda ficam com parcela abaixo de R$ 30: travam o salvar. */
  travadas: number;
  contagem: ContagemDasParcelas;
}

/**
 * Refaz as variáveis de valor de cada pendente com os % novos, e aplica a
 * parcela mínima do mesmo jeito que a montagem da campanha.
 */
export function recalcularPendentes(
  pendentes: readonly PendenteComBase[],
  modelo: string,
  discounts: Discounts,
  opcoes: { recalcular: boolean; manter: boolean },
): RecalculoDosPendentes {
  const comBase = pendentes.filter((p): p is PendenteComBase & { base: BaseDoContato } => !!p.base);
  const itens = comBase.map((p, i) => {
    const item = itemDaBase(p.base, discounts, i + 1);
    item.message = '';
    return item;
  });
  const parceladas = variaveisParceladasDoModelo(modelo);
  const comParcelaBaixa = parceladas.length === 0 ? 0
    : itens.filter((item) => parcelasBaixasDoItem(item, parceladas, discounts).length > 0).length;
  const { travadas, contagem } = aplicarParcelaMinima(itens, modelo, discounts, {
    ...opcoes, editadas: new Map(),
  });
  const novas = comBase.map((p, i) => ({
    id: p.id,
    variaveis: { ...variaveisDeValor(itens[i], discounts), ...(itens[i].variableOverrides ?? {}) },
  }));
  return { novas, comParcelaBaixa, travadas: travadas.size, contagem };
}

/** Por que o desconto desta campanha não pode ser trocado; `null` = pode. */
export function motivoSemDesconto(pendentes: readonly PendenteComBase[]): string | null {
  if (pendentes.length === 0) return 'Não há mensagem pendente: tudo já foi enviado, e o que foi enviado não muda.';
  if (pendentes.some((p) => !p.base || !p.variaveis) || !descontosDasVariaveis(pendentes[0].variaveis)) {
    return 'Esta campanha foi liberada antes de guardar os valores de cada cliente: o desconto dela não pode ser trocado. As campanhas liberadas de agora em diante já permitem.';
  }
  return null;
}
