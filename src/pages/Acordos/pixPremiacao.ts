/**
 * pixPremiacao.ts — quanto ainda sai para quem DOBROU a comissão.
 *
 * ## A pergunta que faltava
 *
 * A tela sabia dizer «comissão aprovada» e «já pago». Não sabia dizer o que a
 * operação pergunta toda semana: *quanto ainda sai para esta pessoa?* Quem
 * precisava disso abria a lista, filtrava por operador, somava as linhas pagas
 * de cabeça e subtraía. Toda semana, para cada nome.
 *
 * E errava para mais no caso que mais custa: a **dobra** aparecia como o total
 * do mês, não como o resto. «R$ 2.000,00» com R$ 1.000,00 já pagos, e quem
 * lesse pagaria duas vezes.
 *
 * ## Só a dobra entra
 *
 * `painelPremiacoes` lista exclusivamente quem cumpriu os dois requisitos. O
 * pagamento de quem não dobrou já é controlado linha a linha na própria lista
 * do Pix automático, e repeti-lo aqui era um segundo lugar dizendo a mesma
 * coisa. Ver o cabeçalho daquela função.
 *
 * ## A dobra precisa da meta de RECEBIMENTO, não só dos acordos
 *
 * São dois requisitos, e é fácil esquecer o segundo: a quantidade de acordos
 * Pix no mês **e** a meta de recebimento batida. Sem a meta de recebimento na
 * mão, `calcularDobraComissao` responde «não dobrou» — corretamente, porque
 * afirmar que dobrou sem ter contra o que comparar seria prometer dinheiro que
 * ninguém conferiu.
 *
 * Foi exatamente o que aconteceu na primeira versão deste painel: ele passava
 * a meta de ACORDOS por setor e não passava a de recebimento por pessoa, e por
 * isso mostrava a comissão simples de quem tinha direito ao dobro. Quem
 * chamar `painelPremiacoes` sem `metaPorOperador` vai ver o mesmo — é o
 * comportamento conservador, e é por isso que ele está escrito aqui.
 *
 * ## O que NÃO entra aqui
 *
 * **Desempenho.** `comissaoDe` continua sendo a comissão pura, e é ela que
 * manda no ranking de produção, no contador de acordos e na meta.
 *
 * **A divergência.** Ela tem fluxo próprio: a liderança anota o saldo e o
 * carimba num acordo aprovado pela ação «Corrigir valor», e aí ele entra no
 * pagamento por `valorAPagarDe`. Este painel mostrou o saldo em aberto numa
 * coluna durante um dia e a coluna saiu a pedido do Cleber em 02/09/2026: com
 * o acerto já acontecendo do outro lado, o número aqui virava um segundo lugar
 * dizendo a mesma coisa — e uma linha de «−R$ 17,50» para quem tinha R$ 0,00
 * de premiação parecia dívida nova, não acerto pendente.
 *
 * O que já foi carimbado continua contando: está dentro de `jaPago`.
 */
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import { comissaoDe, valorAPagarDe } from '@/services/pix_automatico.service';
import { calcularDobraComissao, type MetaRecebimentoDobra } from './pixAutomaticoView';
import type { MesRef } from '@/lib/mesReferencia';

/** Duas casas, sempre — somar centavos em ponto flutuante escorrega. */
function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * O carimbo mensal da premiação, como o painel o entrega.
 *
 * `valorPago` NULL numa linha PAGA é o legado da migration 20260831203244,
 * quando o pagamento era só um booleano: não dá para saber quanto saiu, e o
 * único significado honesto é "quitou o que faltava". Ler assim preserva o
 * trabalho de quem já marcou pagamentos antes desta versão — o contrário seria
 * reabrir dívidas que a operação considera pagas.
 */
export interface PagamentoMensalPremiacao {
  pago: boolean;
  valorPago?: number | null;
}

export interface Premiacao {
  operadorId: string;
  nome: string;

  /** Comissão aprovada do mês, SEM dobra. É a base da conta. */
  comissao: number;
  /** Os dois requisitos da dobra fecharam? */
  dobrou: boolean;
  /** O extra que a dobra paga: a comissão de novo. Zero quando não dobrou. */
  bonus: number;
  /** O que a pessoa tem direito a receber no mês: comissão + bônus. */
  premiacao: number;

  /**
   * O que já saiu: as linhas marcadas como pagas MAIS o pagamento mensal da
   * premiação. Os dois são dinheiro que saiu do caixa pelo mesmo mês.
   */
  jaPago: number;

  /** Só a parte paga pelo carimbo mensal da premiação. */
  pagoNaPremiacao: number;

  /** A premiação do mês está marcada como paga? */
  premiacaoPaga: boolean;

  /**
   * O que ainda sai: premiação − já pago.
   *
   * Pode ficar NEGATIVO, e o sinal é informação: já saiu mais do que era
   * devido. Zerar aqui esconderia justamente o caso que precisa de decisão.
   */
  falta: number;
}

/**
 * A premiação de UMA pessoa no mês.
 *
 * `metaRecebimento` é o que decide a dobra. Sem ele a dobra não acontece —
 * ver o cabeçalho.
 */
export function premiacaoDoOperador(p: {
  operadorId: string;
  nome: string;
  itens: readonly PixAutoAcordo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  metaRecebimento?: MetaRecebimentoDobra;
  metaPorSetor?: Record<string, number>;
  /** O carimbo mensal, quando existir. Ver `PagamentoMensalPremiacao`. */
  pagamentoMensal?: PagamentoMensalPremiacao;
}): Premiacao {
  const doMes = p.itens.filter(
    i => i.operador_id === p.operadorId && i.criado_em.startsWith(p.mes),
  );

  const dobra = calcularDobraComissao(
    [...p.itens], p.operadorId, p.pctPorSetor, p.mes,
    p.metaRecebimento, p.metaPorSetor ?? {},
  );

  const comissao  = centavos(dobra.comissao);
  const bonus     = centavos(dobra.bonus);
  const premiacao = centavos(dobra.comissaoFinal);

  /*
   * O que já saiu conta o MÊS TODO, inclusive linha desaprovada que chegou a
   * ser paga: dinheiro que saiu do caixa saiu, e a régua aqui não é mérito, é
   * extrato. `valorAPagarDe` já inclui o acerto de divergência carimbado
   * naquela linha — é por ali que a divergência entra nesta conta.
   */
  const pagoNasLinhas = centavos(
    doMes.filter(i => i.pago).reduce((s, i) => s + valorAPagarDe(i, p.pctPorSetor), 0),
  );

  /*
   * O carimbo mensal também é dinheiro que saiu.
   *
   * Sem ele nesta conta, o painel mostrava "Pago" no switch e "Falta pagar
   * R$ 412,30" na mesma linha — dois números para o mesmo fato, discordando.
   * Sem valor gravado (linha antiga), o carimbo vale pelo que faltava: é o
   * único significado que não inventa número nem reabre pagamento feito.
   */
  const premiacaoPaga = p.pagamentoMensal?.pago === true;
  const pagoNaPremiacao = premiacaoPaga
    ? centavos(p.pagamentoMensal?.valorPago
        ?? Math.max(premiacao - pagoNasLinhas, 0))
    : 0;

  const jaPago = centavos(pagoNasLinhas + pagoNaPremiacao);

  return {
    operadorId: p.operadorId,
    nome: p.nome,
    comissao,
    dobrou: dobra.atingiu,
    bonus,
    premiacao,
    jaPago,
    pagoNaPremiacao,
    premiacaoPaga,
    falta: centavos(premiacao - jaPago),
  };
}

/**
 * A premiação de quem DOBROU — o painel do líder.
 *
 * ## O critério é a dobra, e não «tem saldo a pagar»
 *
 * A primeira versão listava todo mundo com premiação ou pagamento no mês
 * (`premiacao > 0 || jaPago > 0`), e isso fazia o painel repetir a tabela do Pix
 * automático com outro desenho: as mesmas pessoas, os mesmos valores, o mesmo
 * «falta pagar» que a lista de acordos já controla linha a linha.
 *
 * O que a lista de acordos NÃO sabe dizer é a dobra. Ela é mensal, cruza dois
 * requisitos (a quantidade de acordos Pix e a meta de recebimento) e nasce fora
 * de qualquer acordo individual — não existe linha onde carimbá-la. É esse o
 * pagamento que precisava de um lugar próprio, e é só ele que fica aqui.
 *
 * Quem não dobrou continua sendo pago pela lista de acordos, com o controle que
 * já existe lá. Mostrá-lo aqui de novo era um segundo lugar dizendo a mesma
 * coisa — o mesmo motivo pelo qual a coluna de divergência saiu em 02/09/2026.
 *
 * Ordenada por quem tem mais a receber; quem já está quitado cai para o fim: o
 * painel existe para dizer o que ainda falta pagar, e uma lista que começa pelos
 * zerados obriga a rolar para achar o trabalho.
 */
export function painelPremiacoes(p: {
  itens: readonly PixAutoAcordo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  nomePorOperador?: Record<string, string>;
  /** Meta de recebimento por operador — é ela que decide a dobra. */
  metaPorOperador?: Record<string, MetaRecebimentoDobra>;
  metaPorSetor?: Record<string, number>;
  /** Carimbo mensal por operador. Ausente = premiação ainda não paga. */
  pagamentoPorOperador?: Record<string, PagamentoMensalPremiacao>;
}): Premiacao[] {
  const ids = new Map<string, string>();
  for (const i of p.itens) {
    if (!i.criado_em.startsWith(p.mes)) continue;
    if (!ids.has(i.operador_id)) {
      ids.set(i.operador_id, p.nomePorOperador?.[i.operador_id] ?? i.operador_nome ?? '—');
    }
  }

  return [...ids.entries()]
    .map(([operadorId, nome]) => premiacaoDoOperador({
      operadorId, nome,
      itens: p.itens, pctPorSetor: p.pctPorSetor, mes: p.mes,
      metaRecebimento: p.metaPorOperador?.[operadorId],
      metaPorSetor: p.metaPorSetor,
      pagamentoMensal: p.pagamentoPorOperador?.[operadorId],
    }))
    // Só a dobra. Ver o cabeçalho desta função.
    .filter(l => l.dobrou)
    .sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O total do painel, para o cabeçalho não obrigar a somar de cabeça. */
export function totalDoPainel(linhas: readonly Premiacao[]): {
  premiacao: number; jaPago: number; pagoNaPremiacao: number;
  falta: number; bonus: number; comDobra: number;
} {
  return {
    premiacao: centavos(linhas.reduce((s, l) => s + l.premiacao, 0)),
    jaPago:    centavos(linhas.reduce((s, l) => s + l.jaPago, 0)),
    pagoNaPremiacao: centavos(linhas.reduce((s, l) => s + l.pagoNaPremiacao, 0)),
    falta:     centavos(linhas.reduce((s, l) => s + l.falta, 0)),
    bonus:     centavos(linhas.reduce((s, l) => s + l.bonus, 0)),
    comDobra:  linhas.filter(l => l.dobrou).length,
  };
}

/** Comissão aprovada do mês, sem dobra — a base que os cards já mostravam. */
export function comissaoAprovadaNoMes(
  itens: readonly PixAutoAcordo[],
  operadorId: string | null | undefined,
  pctPorSetor: Record<string, number>,
  mes: MesRef,
): number {
  if (!operadorId) return 0;
  return centavos(itens
    .filter(i => i.operador_id === operadorId
              && i.status === 'aprovado'
              && i.criado_em.startsWith(mes))
    .reduce((s, i) => s + comissaoDe(i, pctPorSetor), 0));
}
