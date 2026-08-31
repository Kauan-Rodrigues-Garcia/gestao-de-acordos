/**
 * pixPremiacao.ts — quanto cada pessoa TEM A RECEBER, de verdade.
 *
 * ## A pergunta que faltava
 *
 * A tela sabia dizer «comissão aprovada» e «já pago». Não sabia dizer o que a
 * operação pergunta toda semana: *quanto ainda sai para esta pessoa?* Faltavam
 * duas parcelas dessa conta, e as duas erravam para o mesmo lado — para mais.
 *
 * **A divergência era só enfeite.** O saldo em aberto aparecia num painel ao
 * lado e não entrava em número nenhum. Operador com R$ 40,00 de premiação
 * devendo R$ 20,00 de divergência era mostrado como R$ 40,00 a receber, e a
 * correção só acontecia se alguém lembrasse de carimbar o acerto num acordo à
 * mão. Quem não lembrasse pagava a mais.
 *
 * **A dobra ignorava o que já saiu.** «Premiação dobrada: R$ 2.000,00» era o
 * total do mês, não o que faltava. Com R$ 1.000,00 já pagos, o número certo é
 * R$ 1.000,00 — e o líder que lesse o primeiro pagaria duas vezes.
 *
 * ## O que NÃO entra aqui
 *
 * Desempenho. `comissaoDe` continua sendo a comissão pura, e é ela que manda
 * no ranking de produção, no contador de acordos e na meta. Um acerto de
 * divergência do mês passado não é trabalho feito neste, e misturá-lo ali faria
 * duas pessoas com a mesma produção aparecerem em posições diferentes.
 *
 * Aqui é CAIXA: o que sai. São perguntas diferentes, e é por isso que este
 * módulo existe separado de `pixAutomaticoView.ts`.
 *
 * ## Nada é abatido em silêncio
 *
 * `Premiacao` devolve as parcelas separadas — total, já pago, divergência,
 * falta — e não só o resultado. A tela mostra a linha do desconto com o motivo
 * ao lado: um número que encolheu sem explicação é pior que um número errado,
 * porque ninguém sabe o que conferir.
 */
import type { PixAutoAcordo, PixAutoSaldo } from '@/services/pix_automatico.service';
import { comissaoDe, valorAPagarDe } from '@/services/pix_automatico.service';
import { calcularDobraComissao, type MetaRecebimentoDobra } from './pixAutomaticoView';
import type { MesRef } from '@/lib/mesReferencia';

/** Duas casas, sempre — somar centavos em ponto flutuante escorrega. */
function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * O saldo de divergência que ainda NÃO foi carimbado em nenhum pagamento.
 *
 * `acordo_id` preenchido significa que o acerto já está dentro de um acordo
 * aprovado, e `valorAPagarDe` daquela linha já o soma. Contá-lo aqui de novo
 * descontaria duas vezes a mesma divergência — que é exatamente o erro que
 * este módulo existe para não cometer.
 *
 * Positivo = a empresa deve à pessoa. Negativo = a pessoa deve à empresa.
 */
export function divergenciaEmAberto(
  operadorId: string | null | undefined,
  saldos: readonly PixAutoSaldo[],
): { valor: number; motivo: string | null } {
  if (!operadorId) return { valor: 0, motivo: null };
  const s = saldos.find(x => x.operador_id === operadorId && !x.acordo_id);
  if (!s) return { valor: 0, motivo: null };
  return { valor: centavos(Number(s.valor) || 0), motivo: s.motivo ?? null };
}

export interface Premiacao {
  operadorId: string;
  nome: string;

  /** Comissão aprovada do mês, sem dobra e sem acerto. É a base de tudo. */
  comissao: number;
  /** Os dois requisitos da dobra fecharam? */
  dobrou: boolean;
  /** O que a pessoa tem direito a receber no mês: comissão, dobrada se dobrou. */
  premiacao: number;

  /** O que já saiu — soma de `valorAPagarDe` das linhas marcadas como pagas. */
  jaPago: number;
  /** Divergência ainda não carimbada. Negativa = a pessoa deve. */
  divergencia: number;
  divergenciaMotivo: string | null;

  /**
   * O que ainda sai: premiação − já pago + divergência.
   *
   * Pode ficar NEGATIVO, e o sinal é informação: quer dizer que a empresa já
   * pagou mais do que devia (ou que a dívida da pessoa passa do que ela tem a
   * receber). Zerar aqui esconderia justamente o caso que precisa de decisão.
   */
  falta: number;
}

/**
 * A premiação de UMA pessoa no mês.
 *
 * `metaRecebimento` é o que decide a dobra, e sem ele a dobra não acontece —
 * mesma regra de `calcularDobraComissao`: afirmar que dobrou sem ter contra o
 * que comparar é prometer dinheiro que ninguém conferiu.
 */
export function premiacaoDoOperador(p: {
  operadorId: string;
  nome: string;
  itens: readonly PixAutoAcordo[];
  saldos: readonly PixAutoSaldo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  metaRecebimento?: MetaRecebimentoDobra;
  metaPorSetor?: Record<string, number>;
}): Premiacao {
  const doOperador = p.itens.filter(i => i.operador_id === p.operadorId);
  const doMes = doOperador.filter(i => i.criado_em.startsWith(p.mes));

  const dobra = calcularDobraComissao(
    [...p.itens], p.operadorId, p.pctPorSetor, p.mes,
    p.metaRecebimento, p.metaPorSetor ?? {},
  );

  const comissao  = centavos(dobra.comissao);
  const premiacao = centavos(dobra.comissaoFinal);

  /*
   * O que já saiu conta o MÊS TODO, inclusive linha desaprovada que chegou a
   * ser paga: dinheiro que saiu do caixa saiu, e a régua aqui não é mérito, é
   * extrato. `valorAPagarDe` já inclui o acerto carimbado naquela linha.
   */
  const jaPago = centavos(
    doMes.filter(i => i.pago).reduce((s, i) => s + valorAPagarDe(i, p.pctPorSetor), 0),
  );

  const { valor: divergencia, motivo } = divergenciaEmAberto(p.operadorId, p.saldos);

  return {
    operadorId: p.operadorId,
    nome: p.nome,
    comissao,
    dobrou: dobra.atingiu,
    premiacao,
    jaPago,
    divergencia,
    divergenciaMotivo: motivo,
    falta: centavos(premiacao - jaPago + divergencia),
  };
}

/**
 * A premiação de TODO MUNDO que aparece na lista — o painel do líder.
 *
 * Uma linha por pessoa com registro no mês, ordenada por quem tem mais a
 * receber. Quem já está quitado cai para o fim: o painel existe para dizer o
 * que ainda falta pagar, e uma lista que começa pelos zerados obriga a rolar
 * para achar o trabalho.
 *
 * `metaPorOperador` traz a meta de recebimento de cada um — é ela que decide a
 * dobra. Sem entrada para a pessoa, a dobra dela fica em aberto e a premiação
 * é a comissão simples; é o mesmo comportamento conservador do card individual.
 */
export function painelPremiacoes(p: {
  itens: readonly PixAutoAcordo[];
  saldos: readonly PixAutoSaldo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  nomePorOperador?: Record<string, string>;
  metaPorOperador?: Record<string, MetaRecebimentoDobra>;
  metaPorSetor?: Record<string, number>;
}): Premiacao[] {
  const ids = new Map<string, string>();
  for (const i of p.itens) {
    if (!i.criado_em.startsWith(p.mes)) continue;
    if (!ids.has(i.operador_id)) {
      ids.set(i.operador_id, p.nomePorOperador?.[i.operador_id] ?? i.operador_nome ?? '—');
    }
  }

  /*
   * Quem tem divergência aberta entra mesmo SEM registro no mês.
   *
   * É o caso que mais importa: alguém que recebeu a mais em agosto e não
   * lançou nada em setembro precisa aparecer, senão a dívida some da tela
   * junto com a pessoa e ninguém a desconta nunca.
   */
  for (const s of p.saldos) {
    if (s.acordo_id) continue;
    if (!ids.has(s.operador_id)) {
      ids.set(s.operador_id, p.nomePorOperador?.[s.operador_id] ?? s.operador_nome ?? '—');
    }
  }

  return [...ids.entries()]
    .map(([operadorId, nome]) => premiacaoDoOperador({
      operadorId, nome,
      itens: p.itens, saldos: p.saldos, pctPorSetor: p.pctPorSetor, mes: p.mes,
      metaRecebimento: p.metaPorOperador?.[operadorId],
      metaPorSetor: p.metaPorSetor,
    }))
    .filter(l => l.premiacao > 0 || l.jaPago > 0 || l.divergencia !== 0)
    .sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O total do painel, para o cabeçalho não obrigar a somar de cabeça. */
export function totalDoPainel(linhas: readonly Premiacao[]): {
  premiacao: number; jaPago: number; divergencia: number; falta: number; comDobra: number;
} {
  return {
    premiacao:   centavos(linhas.reduce((s, l) => s + l.premiacao, 0)),
    jaPago:      centavos(linhas.reduce((s, l) => s + l.jaPago, 0)),
    divergencia: centavos(linhas.reduce((s, l) => s + l.divergencia, 0)),
    falta:       centavos(linhas.reduce((s, l) => s + l.falta, 0)),
    comDobra:    linhas.filter(l => l.dobrou).length,
  };
}

/**
 * O total a pagar de um CONJUNTO de linhas, já com a divergência aberta.
 *
 * É a versão de caixa do `totalPagoPix`: serve os cards e os gráficos, que
 * mostram «a pagar» e precisavam mostrar o valor que de fato vai sair. A
 * divergência entra uma vez por PESSOA, não por linha — ela é um saldo do
 * operador, não uma propriedade do acordo.
 */
export function aPagarComDivergencia(
  visiveis: readonly PixAutoAcordo[],
  saldos: readonly PixAutoSaldo[],
  pctPorSetor: Record<string, number>,
): { bruto: number; divergencia: number; liquido: number } {
  const bruto = centavos(
    visiveis
      .filter(i => i.status === 'aprovado' && !i.pago)
      .reduce((s, i) => s + valorAPagarDe(i, pctPorSetor), 0),
  );

  // Só de quem aparece na lista: um líder filtrando a própria equipe não pode
  // ver descontada a divergência de gente que ele nem está olhando.
  const presentes = new Set(visiveis.map(i => i.operador_id));
  const divergencia = centavos(
    saldos
      .filter(s => !s.acordo_id && presentes.has(s.operador_id))
      .reduce((acc, s) => acc + (Number(s.valor) || 0), 0),
  );

  return { bruto, divergencia, liquido: centavos(bruto + divergencia) };
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
