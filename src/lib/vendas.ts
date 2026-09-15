/**
 * vendas.ts — a régua do Comercial.
 *
 * ## A regra que este arquivo existe para segurar
 *
 * Uma venda só conta para o operador, para a equipe e para o setor quando ela
 * está **confirmada E assinada**. As duas coisas, sempre as duas.
 *
 * Parece detalhe, e não é. Medido no relatório de prospecção de setembro/2026,
 * empresa toda:
 *
 *   2.497 confirmadas e assinadas ...... R$ 11.890.148,62   ← a régua
 *     109 confirmadas SEM assinatura ... R$    536.355,71
 *     187 DEVOLVIDAS ainda assinadas ... R$    877.917,32
 *       1 CANCELADA ainda assinada ..... R$      6.972,00
 *
 * Olhar só a situação deixa entrar 109 vendas que ninguém assinou. Olhar só a
 * assinatura deixa entrar 188 vendas que voltaram — porque **a assinatura não
 * se desfaz na devolução**: o contrato foi assinado e continua marcado como
 * assinado, mesmo depois de o dinheiro voltar.
 *
 * Por isso `contaNaMeta` não aceita atalho, e por isso existe
 * `classificarVenda`: o que fica de fora não some, fica **separado** — cada
 * grupo numa gaveta com nome, porque cada um é uma conversa diferente do líder.
 *
 * ## As duas medidas que não se misturam
 *
 * `valor_total` é o valor da venda, e é ele que conta na meta. `valor_recebido`
 * é quanto o cliente pagou até agora. A entrada é o quanto entrou na hora.
 *
 * Uma venda de R$ 5.000,00 com R$ 2.000,00 de entrada vale **5.000 na meta** —
 * não 2.000. Somar recebimento onde se pede faturamento é o erro que a planilha
 * de agosto evitou por sorte, tendo só uma das duas colunas.
 *
 * ## O que este arquivo NÃO decide
 *
 * Não decide alcance (quem vê o quê) — isso é RLS, em `fn_vendas_alcanca`.
 * Não decide o dia — isso é `diaDaVenda`, logo abaixo, mas quem escolhe o
 * recorte é a tela.
 */

/**
 * A situação de uma venda, como o ERP a descreve.
 *
 * `aberta` é a única que **não** vem do relatório geral. Medido nos dois meses
 * inteiros de prospecção (agosto: 6.131/564/260; setembro: 2.606/188/44), o
 * geral nunca traz uma venda aberta — ele recorta por data de confirmação, e
 * para ter data de confirmação a venda precisou ser confirmada.
 *
 * Venda aberta chega por duas portas: o lançamento do operador e o relatório do
 * setor, que recorta por data da venda. Ver `OrigemVenda`.
 */
export type SituacaoVenda = 'aberta' | 'confirmada' | 'cancelada' | 'devolvida';

export const SITUACOES_VENDA: readonly SituacaoVenda[] = [
  'aberta', 'confirmada', 'cancelada', 'devolvida',
] as const;

/**
 * De onde esta linha veio — e, por consequência, o quanto se pode confiar nela.
 *
 * São as três camadas de adiantamento do Comercial, da mais adiantada para a
 * mais confiável:
 *
 *   manual .. digitado pelo operador na hora da venda. Ainda não passou por
 *             relatório nenhum.
 *   setor ... relatório do setor, recortado por data da venda. É a prévia — o
 *             único que enxerga venda aberta.
 *   geral ... relatório geral, recortado por data de confirmação. É o oficial:
 *             fecha o mês, a meta e o valor.
 *
 * Mesma lógica do 58 e do 59 na cobrança, com uma camada a mais na frente.
 * Nenhuma apaga a anterior em silêncio — a de cima corrige, e a correção vira
 * evento.
 */
export type OrigemVenda = 'manual' | 'setor' | 'geral';

export const ORIGENS_VENDA: readonly OrigemVenda[] = ['manual', 'setor', 'geral'] as const;

/** Precedência das origens: quanto maior, mais oficial. */
const PESO_ORIGEM: Record<OrigemVenda, number> = { manual: 1, setor: 2, geral: 3 };

/**
 * A origem `b` tem autoridade para sobrescrever o que veio por `a`?
 *
 * Igual conta como sim: reimportar o mesmo relatório é o caso normal de
 * correção, e é assim que a substituição de retrato funciona.
 */
export function origemSobrepoe(a: OrigemVenda, b: OrigemVenda): boolean {
  return PESO_ORIGEM[b] >= PESO_ORIGEM[a];
}

/** O mínimo que a régua precisa saber sobre uma venda. */
export interface VendaClassificavel {
  situacao: SituacaoVenda;
  contrato_assinado: boolean;
}

/**
 * Esta venda conta para a meta do operador, da equipe e do setor?
 *
 * **Confirmada E assinada.** Não existe outra resposta, e não existe atalho:
 * nem `situacao === 'confirmada'` sozinho, nem `contrato_assinado` sozinho.
 * Ver o cabeçalho do arquivo para os números que provam por quê.
 */
export function contaNaMeta(venda: VendaClassificavel): boolean {
  return venda.situacao === 'confirmada' && venda.contrato_assinado === true;
}

/**
 * Em que gaveta esta venda cai.
 *
 * Cinco gavetas, e o nome de cada uma é a conversa que o líder vai ter:
 *
 *   na_meta ............... conta. É o placar.
 *   pendente_assinatura ... confirmada, sem assinatura. Cobrança do líder — e
 *                           «falta de assinatura do contrato» é o maior motivo
 *                           de cancelamento no relatório (27 dos 44 de setembro).
 *   aberta ................ ainda não confirmada. Não conta, não é perda.
 *   devolvida ............. voltou. Entra no percentual de devolução.
 *   cancelada ............. caiu. Entra no percentual de cancelamento.
 *
 * Devolvida e cancelada vêm antes da assinatura de propósito: uma venda
 * devolvida e assinada é devolvida, não «pendente de alguma coisa».
 */
export type GavetaVenda =
  | 'na_meta' | 'pendente_assinatura' | 'aberta' | 'devolvida' | 'cancelada';

export function classificarVenda(venda: VendaClassificavel): GavetaVenda {
  switch (venda.situacao) {
    case 'devolvida':  return 'devolvida';
    case 'cancelada':  return 'cancelada';
    case 'aberta':     return 'aberta';
    case 'confirmada': return venda.contrato_assinado ? 'na_meta' : 'pendente_assinatura';
  }
}

export const GAVETA_LABELS: Record<GavetaVenda, string> = {
  na_meta:             'Na meta',
  pendente_assinatura: 'Pendente de assinatura',
  aberta:              'Em aberto',
  devolvida:           'Devolvida',
  cancelada:           'Cancelada',
};

/**
 * A ordem em que as gavetas aparecem na tela.
 *
 * O placar primeiro, o que dá trabalho ao líder logo depois, e as perdas no
 * fim. Não é ordem alfabética nem a ordem do `type` — é a ordem em que a
 * pergunta importa.
 */
export const GAVETAS_EM_ORDEM: readonly GavetaVenda[] = [
  'na_meta', 'pendente_assinatura', 'aberta', 'devolvida', 'cancelada',
] as const;

export const SITUACAO_LABELS: Record<SituacaoVenda, string> = {
  aberta:     'Em aberto',
  confirmada: 'Confirmada',
  cancelada:  'Cancelada',
  devolvida:  'Devolvida',
};

/**
 * Cor de cada gaveta, nos tokens do tema.
 *
 * `pendente_assinatura` é âmbar e não vermelho de propósito: é trabalho a
 * fazer, não perda. Quem pinta de vermelho o que ainda dá para salvar ensina o
 * líder a ignorar vermelho.
 */
export const GAVETA_COLORS: Record<GavetaVenda, string> = {
  na_meta:             'bg-success/15 text-success border-success/30',
  pendente_assinatura: 'bg-warning/15 text-warning border-warning/30',
  aberta:              'bg-muted text-muted-foreground border-border',
  devolvida:           'bg-destructive/15 text-destructive border-destructive/30',
  cancelada:           'bg-destructive/15 text-destructive border-destructive/30',
};

/**
 * O que a venda vale, para quem pergunta pela meta.
 *
 * Fora da régua é zero — não é `valor_total` com uma flag ao lado. A soma de
 * uma lista de vendas tem de poder ser feita sem que quem soma precise lembrar
 * de filtrar.
 */
export function valorParaMeta(
  venda: VendaClassificavel & { valor_total: number },
): number {
  return contaNaMeta(venda) ? (Number(venda.valor_total) || 0) : 0;
}

export interface ResumoVendas {
  /** Quantas contam. É a régua em quantidade. */
  quantidade: number;
  /** Quanto somam. É a régua em valor. */
  valor: number;
  /** Quantas linhas caíram em cada gaveta — inclusive as que contam. */
  porGaveta: Record<GavetaVenda, number>;
  /** Faturamento de cada gaveta, para a tela mostrar o que ficou de fora. */
  valorPorGaveta: Record<GavetaVenda, number>;
  /**
   * Devolvidas ÷ (o que já foi confirmado alguma vez).
   *
   * O denominador exclui as abertas: uma venda que nunca foi confirmada não
   * tinha como ser devolvida, e contá-la dilui o indicador até ele não medir
   * mais nada. `null` quando não há denominador.
   */
  pctDevolucao: number | null;
  /** Canceladas ÷ o mesmo denominador. */
  pctCancelamento: number | null;
  /** Quanto o cliente pagou, somando tudo que está na régua. */
  recebido: number;
  /** Quanto entrou de entrada, na régua. */
  entrada: number;
  /** Quantas vendas da régua tiveram entrada. Era assim que janeiro media. */
  comEntrada: number;
}

export interface VendaSomavel extends VendaClassificavel {
  valor_total: number;
  valor_recebido?: number | null;
  valor_entrada?: number | null;
}

function gavetasZeradas(): Record<GavetaVenda, number> {
  return {
    na_meta: 0, pendente_assinatura: 0, aberta: 0, devolvida: 0, cancelada: 0,
  };
}

/**
 * O resumo de uma lista de vendas, numa passada só.
 *
 * Devolve as duas réguas juntas — quantidade e valor — porque a configuração da
 * meta escolhe qual vale, e a tela precisa das duas para mostrar a que não foi
 * escolhida como referência.
 */
export function resumirVendas(vendas: readonly VendaSomavel[]): ResumoVendas {
  const porGaveta = gavetasZeradas();
  const valorPorGaveta = gavetasZeradas();
  let quantidade = 0, valor = 0, recebido = 0, entrada = 0, comEntrada = 0;

  for (const v of vendas) {
    const gaveta = classificarVenda(v);
    const total = Number(v.valor_total) || 0;
    porGaveta[gaveta] += 1;
    valorPorGaveta[gaveta] += total;

    if (gaveta !== 'na_meta') continue;
    quantidade += 1;
    valor += total;
    recebido += Number(v.valor_recebido) || 0;
    const ent = Number(v.valor_entrada) || 0;
    entrada += ent;
    if (ent > 0) comEntrada += 1;
  }

  // O denominador é «tudo que chegou a ser confirmado»: o placar, o que espera
  // assinatura, o que voltou e o que caiu. Aberta fica fora — ver ResumoVendas.
  const base = porGaveta.na_meta + porGaveta.pendente_assinatura
             + porGaveta.devolvida + porGaveta.cancelada;

  return {
    quantidade, valor, porGaveta, valorPorGaveta,
    pctDevolucao:    base > 0 ? porGaveta.devolvida / base : null,
    pctCancelamento: base > 0 ? porGaveta.cancelada / base : null,
    recebido, entrada, comEntrada,
  };
}

/**
 * O dia a que esta venda pertence, conforme o recorte escolhido.
 *
 * Os dois eixos existem porque os dois relatórios existem, e eles não recortam
 * igual:
 *
 *   confirmacao .. o eixo OFICIAL. Define mês, meta e valor. É o que o
 *                  relatório geral usa.
 *   venda ........ o eixo do trabalho do dia. É o que a aba Vendas fecha, e o
 *                  único jeito de enxergar o que ainda está em aberto.
 *
 * Uma venda confirmada sem data de confirmação não deveria existir; se
 * existir, cai no eixo da venda em vez de sumir da tela. Sumir calado é pior do
 * que aparecer no dia errado — o segundo alguém vê.
 */
export type EixoDaVenda = 'confirmacao' | 'venda';

export function diaDaVenda(
  venda: { data_venda: string; data_confirmacao?: string | null },
  eixo: EixoDaVenda,
): string {
  if (eixo === 'venda') return soData(venda.data_venda);
  return soData(venda.data_confirmacao || venda.data_venda);
}

/** `2026-09-14T16:48:45.913Z` e `2026-09-14` viram os mesmos dez caracteres. */
function soData(valor: string): string {
  return String(valor ?? '').slice(0, 10);
}

/**
 * Agrupa por dia, do mais recente para o mais antigo.
 *
 * A aba Vendas abre no dia de hoje e guarda os anteriores — «o dia 07 fica
 * salvo no dia 07» — então a ordem natural da tela é a inversa do calendário.
 */
export function agruparPorDia<T extends { data_venda: string; data_confirmacao?: string | null }>(
  vendas: readonly T[],
  eixo: EixoDaVenda,
): Array<{ dia: string; vendas: T[] }> {
  const mapa = new Map<string, T[]>();
  for (const v of vendas) {
    const dia = diaDaVenda(v, eixo);
    const lista = mapa.get(dia);
    if (lista) lista.push(v); else mapa.set(dia, [v]);
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([dia, lista]) => ({ dia, vendas: lista }));
}

/**
 * Este login é de robô?
 *
 * **Pista, nunca cadastro.** O prefixo `ia_` identifica os 21 robôs entre os
 * 358 vendedores do relatório de setembro, e serve para sugerir o vínculo na
 * tela de cadastro — mas quem decide é a marcação explícita em `perfis`.
 *
 * Confiar na string faria um humano chamado `ian_pereira` virar robô e sair do
 * placar sem ninguém entender por quê. Por isso esta função não é usada por
 * nenhuma régua de meta: só oferece o palpite.
 */
export function pareceLoginDeIa(login: string | null | undefined): boolean {
  return /^ia[_-]/i.test(String(login ?? '').trim());
}
