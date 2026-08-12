/**
 * composicaoAcumulado.ts — de onde vem o acumulado de um setor.
 *
 * ## Por que existe
 *
 * A regra do acumulado é "o total do setor é exatamente o total do relatório
 * que ele importou". Ela depende de o relatório do setor trazer só o pessoal do
 * setor, e o ERP nem sempre coopera: em agosto/2026 o relatório do Play 5 veio
 * com 2 linhas de operadores do Play Mix Marília e do Play 4 — R$ 1.933,21 que
 * o card do Play 5 exibia como se fossem dele.
 *
 * Em vez de uma exceção no código para o setor da vez, a tela lista as ORIGENS
 * que apareceram no relatório e deixa desmarcar as que não são daquele setor. O
 * que este módulo faz é responder, de forma pura e testável, duas perguntas:
 *
 *   • de que origem é esta linha? (`origemDaLinha`)
 *   • quanto cada origem trouxe, e quanto sobra depois das exclusões?
 *     (`montarOrigens`)
 *
 * Mora fora de `analitico.service` porque as DUAS agregações de setor precisam
 * dele — a que soma pelo carimbo (`buscarTotalPorSetor`, que alimenta a aba
 * Analítico e o Painel Líder) e a que filtra linha a linha (`linhaNoEscopo`, que
 * alimenta o dashboard e o Painel Diretoria). Foi por essas duas terem
 * respondido "esta linha é do setor?" de jeitos diferentes que os totais das
 * telas divergiam antes de `escopoAnalitico` existir.
 */

/** Chave da origem "linha sem operador". Não é UUID: nunca colide com setor. */
export const ORIGEM_SEM_OPERADOR = 'sem_operador';

/** Identidade de uma origem: o setor do operador, ou `sem_operador`. */
export type OrigemKey = string;

/** Origens que um setor deixou de fora do acumulado, num mês. */
export type ExclusoesPorSetor = Readonly<Record<string, ReadonlySet<OrigemKey>>>;

export interface OrigemDoAcumulado {
  chave: OrigemKey;
  /** `null` para a origem sem operador. */
  setorId: string | null;
  /** `true` quando é o próprio setor dono do card — nunca some no total. */
  propria: boolean;
  total: number;
  ho: number;
  qtd: number;
  /** Está desmarcada, isto é, fora do acumulado? */
  excluida: boolean;
}

/** O mínimo que uma linha precisa expor para ter origem. */
export interface LinhaComOrigem {
  operador_id: string | null;
  valor_recebido?: number | string | null;
  total_ho?: number | string | null;
}

/**
 * De que origem é esta linha?
 *
 * `setorDoOperador` devolve o setor de uma pessoa. É sempre o setor da EQUIPE
 * dela, caindo no setor do cadastro quando não tem equipe — a mesma definição
 * que `operadorEquipeMap` usa no resto do analítico. Usar `perfis.setor_id` cru
 * aqui e a equipe ali daria duas listas de origem diferentes para o mesmo mês.
 */
export function origemDaLinha(
  operadorId: string | null,
  setorDoOperador: (id: string) => string | null | undefined,
): OrigemKey {
  if (operadorId == null) return ORIGEM_SEM_OPERADOR;
  return setorDoOperador(operadorId) ?? ORIGEM_SEM_OPERADOR;
}

/**
 * A linha entra no acumulado do setor?
 *
 * Só responde pela EXCLUSÃO — quem decide se a linha é do setor (carimbo ou
 * soma de operadores) é `linhaNoEscopo`. Duas perguntas, duas funções: juntá-las
 * foi o que produziu as três contas divergentes que `escopoAnalitico` unificou.
 */
export function origemConta(
  origem: OrigemKey,
  excluidas: ReadonlySet<OrigemKey> | undefined,
): boolean {
  return !excluidas?.has(origem);
}

function numero(v: number | string | null | undefined): number {
  return Number(v) || 0;
}

/**
 * Quebra as linhas de UM setor pelas origens que as trouxeram.
 *
 * A origem do próprio setor vem primeiro e é marcada `propria`; as demais saem
 * ordenadas por valor, maior primeiro, que é a ordem em que alguém conferindo o
 * número quer vê-las. A origem sem operador fica por último — ela é do setor da
 * importação, não de outro time, e some da lista quando não há nenhuma.
 */
export function montarOrigens(params: {
  setorId: string;
  linhas: readonly LinhaComOrigem[];
  setorDoOperador: (id: string) => string | null | undefined;
  excluidas?: ReadonlySet<OrigemKey>;
}): OrigemDoAcumulado[] {
  const { setorId, linhas, setorDoOperador, excluidas } = params;

  const porChave = new Map<OrigemKey, OrigemDoAcumulado>();
  for (const l of linhas) {
    const chave = origemDaLinha(l.operador_id, setorDoOperador);
    let acc = porChave.get(chave);
    if (!acc) {
      acc = {
        chave,
        setorId:  chave === ORIGEM_SEM_OPERADOR ? null : chave,
        propria:  chave === setorId,
        total: 0, ho: 0, qtd: 0,
        excluida: !origemConta(chave, excluidas),
      };
      porChave.set(chave, acc);
    }
    acc.total += numero(l.valor_recebido);
    acc.ho    += numero(l.total_ho);
    acc.qtd   += 1;
  }

  return [...porChave.values()].sort((a, b) => {
    if (a.propria !== b.propria) return a.propria ? -1 : 1;
    const aSem = a.chave === ORIGEM_SEM_OPERADOR;
    const bSem = b.chave === ORIGEM_SEM_OPERADOR;
    if (aSem !== bSem) return aSem ? 1 : -1;
    return b.total - a.total;
  });
}

/** Soma das origens que continuam marcadas. */
export function totalLiquido(origens: readonly OrigemDoAcumulado[]): number {
  return origens.reduce((s, o) => (o.excluida ? s : s + o.total), 0);
}

/** Soma das origens desmarcadas — o que a tela precisa mostrar em voz alta. */
export function totalExcluido(origens: readonly OrigemDoAcumulado[]): number {
  return origens.reduce((s, o) => (o.excluida ? s + o.total : s), 0);
}
