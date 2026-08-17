/**
 * desempenhoEquipe.ts — as contas do card expandido de Desempenho Equipes.
 *
 * ## Por que é um arquivo à parte
 *
 * `DesempenhoEquipes.tsx` tem 866 linhas e mistura busca de dados, upload de
 * foto, edição do Receptivo e o placar. Nada ali é testado. As contas novas do
 * card expandido decidem NÚMERO — quanto falta para cada quartil, quanto a
 * equipe fecha o mês se mantiver o ritmo, quantas pessoas estão em cada faixa —
 * e esse é o tipo de lógica que o projeto já aprendeu a tirar de dentro de
 * `useMemo`: é o mesmo motivo que criou `agregacaoLider.ts`, cujo cabeçalho
 * conta que os três incidentes de clone nasceram dentro de um `useMemo` sem
 * teste.
 *
 * Aqui entra dado e sai número. Sem React, sem fetch.
 *
 * ## A decisão que atravessa o arquivo
 *
 * Os quartis dos operadores são calculados com os MESMOS `totalUteis` e
 * `decorridos` da equipe que os contém. Parece detalhe e não é: a aba Quartis
 * usava o mês cheio para todo mundo, enquanto Desempenho Equipes já reduzia os
 * dias úteis de equipe em treinamento. O mesmo operador aparecia em duas faixas
 * diferentes em duas abas do mesmo painel. Recebendo os dias por parâmetro, a
 * contagem da equipe é a única fonte — quem chama decide se o mês é cheio ou
 * reduzido, e as duas telas passam a concordar por construção.
 */

import { calcularProjecao, degrausQuartis, type DegrauQuartil } from '@/lib/projecaoMetas';
import { quartilAtual } from '@/lib/diasUteis';

import type { QuartilConfig } from '@/lib/supabase';

/** O mínimo que um operador precisa expor para entrar nas contas da equipe. */
export interface OperadorNaEquipe {
  id: string;
  nome: string;
  fotoUrl?: string | null;
  recebido: number;
  /** Meta individual do mês. `null` = sem meta — não entra na distribuição. */
  meta: number | null;
}

export interface EntradaDetalheEquipe {
  /** Acumulado da equipe (ou do setor) no mês. */
  acumulado: number;
  /** Meta do mês vinda da aba Metas. `null` = não configurada. */
  meta: number | null;
  /** Dias úteis do mês — reduzidos quando a equipe é de treinamento. */
  totalUteis: number;
  /** Dias úteis já trabalhados, na mesma base de `totalUteis`. */
  decorridos: number;
  quartis: QuartilConfig[];
  /** Operadores que compõem o acumulado, com meta e recebimento de cada um. */
  operadores: readonly OperadorNaEquipe[];
}

export interface FaixaPessoas {
  quartil: number;
  minPct: number;
  qtd: number;
  /** Quem está na faixa, do maior recebimento para o menor. */
  nomes: string[];
}

export interface DetalheEquipe {
  // ── Ritmo ────────────────────────────────────────────────────────────────
  /** Acumulado ÷ dias trabalhados. 0 dias trabalhados = 0, não Infinity. */
  mediaDiaria: number;
  /** Dias úteis que ainda faltam no mês. Nunca negativo. */
  diasRestantes: number;
  /**
   * Onde a equipe fecha o mês mantendo a média atual.
   *
   * Sem dia trabalhado não há ritmo a projetar, e a estimativa é o próprio
   * acumulado — não zero, e não uma extrapolação de um dia inventado.
   */
  projecaoFechamento: number;
  /** Quanto falta para a meta do mês. `null` sem meta. */
  faltaMeta: number | null;
  /** `projecaoFechamento − meta`. Positivo = fecha acima. `null` sem meta. */
  sobraProjetada: number | null;
  /**
   * Quanto precisa entrar por dia útil RESTANTE para bater a meta.
   *
   * Diferente da "diária p/ meta" do card fechado, que divide a meta pelo mês
   * inteiro e não muda com o tempo. Esta responde o que dá para fazer a partir
   * de amanhã, e é a que sobe quando a equipe atrasa.
   *
   * `null` quando não há meta, quando a meta já foi batida, ou quando não
   * sobrou dia útil — nesse último caso não existe ritmo capaz de resolver, e
   * um número aqui mentiria.
   */
  ritmoNecessario: number | null;
  // ── Quartis ──────────────────────────────────────────────────────────────
  /** % de projeção da equipe (acumulado ÷ esperado até hoje). `null` sem meta. */
  projecaoPct: number | null;
  /** Faixa em que a equipe está. `null` sem meta ou sem quartis. */
  faixaAtual: QuartilConfig | null;
  /** Quanto falta para cada faixa, da melhor para a pior. Vazio sem meta. */
  degraus: DegrauQuartil[];
  // ── Pessoas ──────────────────────────────────────────────────────────────
  /** Quantos operadores em cada faixa, da melhor para a pior. */
  porQuartil: FaixaPessoas[];
  /** Operadores sem meta configurada — ficam fora da distribuição. */
  semMeta: number;
  totalOperadores: number;
  /** Acumulado ÷ nº de operadores. 0 operadores = 0. */
  mediaPorOperador: number;
  /** Maior recebimento da equipe. `null` sem operadores. */
  destaque: OperadorNaEquipe | null;
  /**
   * Quem está mais longe do próprio ritmo — a menor % de projeção.
   *
   * Deliberadamente NÃO é "o menor recebimento": quem tem meta baixa e recebeu
   * pouco pode estar em dia, e quem tem meta alta pode estar atrás recebendo
   * mais que todos. Operador sem meta não entra, porque não há ritmo a comparar.
   */
  atencao: OperadorNaEquipe | null;
}

/**
 * As contas do card expandido.
 *
 * Nunca devolve `null`: um card sempre abre. O que não dá para calcular vem
 * como `null` campo a campo, para a tela mostrar "—" no lugar certo em vez de
 * um zero que parece dado real.
 */
export function detalharEquipe(entrada: EntradaDetalheEquipe): DetalheEquipe {
  const { acumulado, meta, totalUteis, decorridos, quartis, operadores } = entrada;

  const mediaDiaria   = decorridos > 0 ? acumulado / decorridos : 0;
  const diasRestantes = Math.max(0, totalUteis - decorridos);
  const projecaoFechamento = decorridos > 0
    ? acumulado + mediaDiaria * diasRestantes
    : acumulado;

  const faltaMeta      = meta !== null && meta > 0 ? Math.max(0, meta - acumulado) : null;
  const sobraProjetada = meta !== null && meta > 0 ? projecaoFechamento - meta : null;
  const ritmoNecessario = faltaMeta !== null && faltaMeta > 0 && diasRestantes > 0
    ? faltaMeta / diasRestantes
    : null;

  // A projeção da equipe passa pela MESMA função dos operadores e do header
  // pessoal (`lib/projecaoMetas`), e não por uma conta local: o card fechado já
  // mostra essa % e as duas não podem divergir.
  const proj = calcularProjecao({ meta, recebido: acumulado, totalUteis, decorridos, quartis });

  const degraus = proj
    ? degrausQuartis({ recebido: acumulado, esperado: proj.esperado, quartis })
    : [];

  // ── Distribuição dos operadores ─────────────────────────────────────────
  // Cada operador é projetado com os dias úteis DA EQUIPE (ver o cabeçalho).
  const comFaixa = operadores
    .map(op => {
      const p = calcularProjecao({
        meta: op.meta, recebido: op.recebido, totalUteis, decorridos, quartis,
      });
      return {
        op,
        pct:    p?.projecaoPct ?? null,
        faixa:  p ? quartilAtual(p.projecaoPct, quartis) : null,
      };
    });

  const porQuartil: FaixaPessoas[] = [...quartis]
    .sort((a, b) => a.quartil - b.quartil)
    .map(q => {
      const dentro = comFaixa
        .filter(x => x.faixa?.quartil === q.quartil)
        .sort((a, b) => b.op.recebido - a.op.recebido);
      return {
        quartil: q.quartil,
        minPct:  q.min_pct,
        qtd:     dentro.length,
        nomes:   dentro.map(x => x.op.nome),
      };
    });

  const semMeta = comFaixa.filter(x => x.faixa === null).length;

  const destaque = operadores.length
    ? operadores.reduce((a, b) => (b.recebido > a.recebido ? b : a))
    : null;

  const comPct = comFaixa.filter(x => x.pct !== null);
  const atencao = comPct.length
    ? comPct.reduce((a, b) => (b.pct! < a.pct! ? b : a)).op
    : null;

  return {
    mediaDiaria,
    diasRestantes,
    projecaoFechamento,
    faltaMeta,
    sobraProjetada,
    ritmoNecessario,
    projecaoPct: proj?.projecaoPct ?? null,
    faixaAtual:  proj?.quartil ?? null,
    degraus,
    porQuartil,
    semMeta,
    totalOperadores:  operadores.length,
    mediaPorOperador: operadores.length ? acumulado / operadores.length : 0,
    destaque,
    atencao,
  };
}

/**
 * Dá nome, recebimento e meta a um conjunto de operadores.
 *
 * Recebe os IDS já resolvidos, de propósito. Quem responde "quem pertence a esta
 * equipe/setor?" é `operadoresDaEquipe`/`operadoresDoSetor` de
 * `analitico.service` — as funções que já sabem que um clone conta na equipe que
 * o tomou emprestado SEM sair da de origem, e que já respeitam
 * `conta_recebimento`.
 *
 * A primeira versão desta função reimplementava aquela regra de participação. Se
 * tivesse ficado, seria a quinta cópia da pergunta que este projeto já
 * consolidou três vezes — é o defeito que `PERFIS_QUE_CONTAM_NO_RECEBIMENTO` e
 * `setoresDoOperador` existem para não repetir. Aqui só se enriquece.
 */
export function enriquecerOperadores(params: {
  /** Ids resolvidos por `operadoresDaEquipe`/`operadoresDoSetor`. */
  ids: ReadonlySet<string>;
  /** operador_id → { nome, foto }. Quem não estiver aqui é ignorado. */
  identidade: Record<string, { nome: string; fotoUrl?: string | null }>;
  /** operador_id → recebido no mês. Ausente = 0. */
  recebidoPorOperador: Record<string, number>;
  /** operador_id → meta do mês. Ausente = sem meta. */
  metaPorOperador: Record<string, number>;
}): OperadorNaEquipe[] {
  const { ids, identidade, recebidoPorOperador, metaPorOperador } = params;

  const out: OperadorNaEquipe[] = [];
  for (const id of ids) {
    const quem = identidade[id];
    // Sem identidade não há o que exibir: é alguém fora dos cargos que contam no
    // recebimento, ou alguém inativo — a tela só carrega quem conta e está ativo.
    if (!quem) continue;
    out.push({
      id,
      nome:     quem.nome,
      fotoUrl:  quem.fotoUrl ?? null,
      recebido: recebidoPorOperador[id] ?? 0,
      meta:     metaPorOperador[id] ?? null,
    });
  }
  return out.sort((a, b) => b.recebido - a.recebido);
}
