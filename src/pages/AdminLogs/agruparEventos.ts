/**
 * agruparEventos.ts — junta numa linha só os eventos que foram UMA ação.
 *
 * ## O problema relatado
 *
 * A trilha mostrava isto, em duas linhas seguidas:
 *
 *   Alterou a titularidade do NR 12983305 — Sirlei Stephanie: acordo
 *   Alterou o acordo NR 12983305 — TATIANE RIEGEL: parcelas
 *
 * São eventos diferentes, de tabelas diferentes, e parecem repetição. Na verdade
 * são as duas metades de uma coisa só: acrescentar uma parcela ao mesmo NR cria
 * um acordo novo, move a titularidade do NR para ele e atualiza a contagem de
 * parcelas do antigo.
 *
 * ## Dois níveis, e a diferença entre eles importa
 *
 * **Mesma transação — exato, não é chute.** `logs_sistema.criado_em` tem default
 * `now()`, que no PostgreSQL é o carimbo da TRANSAÇÃO, não do statement. Logo,
 * `criado_em` idêntico + mesmo autor significa literalmente "gravado na mesma
 * transação". Em 17/08/2026 isso cobria 2.943 das 5.357 linhas da semana — e
 * inclui uma importação de 428 linhas que virou um card.
 *
 * **Mesmo NR numa janela curta — heurística.** O exemplo acima são DUAS
 * transações, 79 ms uma da outra. Nenhuma chave exata as une. Então há uma
 * segunda regra: mesmo autor, mesmo NR, dentro de poucos segundos.
 *
 * ## O que o agrupamento não faz
 *
 * Não some com nada. O card guarda todos os eventos e o detalhe de cada um
 * continua alcançável. Auditoria que perde granularidade para ficar bonita deixa
 * de ser auditoria — a única coisa que se ganha aqui é onde o olho pousa.
 *
 * Só agrupa eventos VIZINHOS na lista. Reordenar para juntar quebraria a leitura
 * cronológica, que é a razão de a linha do tempo existir.
 */

import type { LogSistema } from '@/lib/supabase';

/** Janela para a regra heurística de mesmo NR. */
export const JANELA_AGRUPAMENTO_MS = 15_000;

export interface GrupoEventos {
  /** Identidade estável para `key` do React: o id do primeiro evento. */
  chave: string;
  eventos: LogSistema[];
  /**
   * Todos os eventos vieram da MESMA transação?
   *
   * `true` = certeza (carimbo de transação idêntico). `false` num grupo de mais
   * de um evento = foram unidos pela regra do NR, que é aproximação. A tela usa
   * isso para escolher a palavra: "na mesma operação" contra "em sequência".
   */
  mesmaTransacao: boolean;
  /** NR comum ao grupo, quando há. Vira o título do card. */
  nr: string | null;
}

/** O NR que aparece no rótulo do alvo, se houver. */
export function nrDoEvento(log: Pick<LogSistema, 'alvo_rotulo'>): string | null {
  const m = /\bNR (\d+)/.exec(log.alvo_rotulo ?? '');
  return m ? m[1] : null;
}

function instante(log: Pick<LogSistema, 'criado_em'>): number {
  const t = new Date(log.criado_em).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * `b` entra no grupo de `a`?
 *
 * Autor diferente nunca agrupa: duas pessoas mexendo no mesmo NR no mesmo
 * segundo são justamente o que um auditor precisa ver separado.
 */
function podeAgrupar(a: LogSistema, b: LogSistema, janelaMs: number): boolean {
  if ((a.usuario_id ?? null) !== (b.usuario_id ?? null)) return false;

  // Mesma transação: exato.
  if (a.criado_em === b.criado_em) return true;

  // Mesmo NR, perto no tempo: aproximação.
  const nrA = nrDoEvento(a);
  if (!nrA || nrA !== nrDoEvento(b)) return false;
  return Math.abs(instante(a) - instante(b)) <= janelaMs;
}

/**
 * Agrupa a lista preservando a ordem recebida.
 *
 * A comparação é sempre com o ÚLTIMO evento já aceito no grupo, não com o
 * primeiro: numa importação os carimbos são todos iguais, e numa sequência de
 * ações sobre o mesmo NR cada passo está perto do anterior, não necessariamente
 * do primeiro. Comparar com o primeiro cortaria grupos longos ao meio.
 */
export function agruparEventos(
  logs: readonly LogSistema[],
  janelaMs: number = JANELA_AGRUPAMENTO_MS,
): GrupoEventos[] {
  const grupos: GrupoEventos[] = [];

  for (const log of logs) {
    const atual = grupos[grupos.length - 1];
    const ultimo = atual?.eventos[atual.eventos.length - 1];

    if (atual && ultimo && podeAgrupar(ultimo, log, janelaMs)) {
      atual.eventos.push(log);
      if (log.criado_em !== atual.eventos[0].criado_em) atual.mesmaTransacao = false;
      // O NR do grupo só sobrevive se TODOS o compartilham; senão o card não
      // pode anunciar um NR que não vale para as linhas de dentro.
      if (atual.nr !== null && nrDoEvento(log) !== atual.nr) atual.nr = null;
      continue;
    }

    grupos.push({
      chave: log.id,
      eventos: [log],
      mesmaTransacao: true,
      nr: nrDoEvento(log),
    });
  }

  return grupos;
}

/**
 * Resumo de um grupo para o cabeçalho do card.
 *
 * Conta tabelas e ações distintas em vez de repetir a frase de cada evento: o
 * card fechado tem que caber numa linha, e "3 eventos · acordos, nr_registros"
 * diz mais sobre o que aconteceu do que a primeira das três frases.
 */
export function resumirGrupo(grupo: GrupoEventos): {
  quantidade: number;
  tabelas: string[];
  acoes: string[];
  autor: string | null;
} {
  const tabelas = new Set<string>();
  const acoes = new Set<string>();
  for (const e of grupo.eventos) {
    if (e.tabela) tabelas.add(e.tabela);
    if (e.acao) acoes.add(e.acao);
  }
  return {
    quantidade: grupo.eventos.length,
    tabelas: [...tabelas],
    acoes: [...acoes],
    autor: grupo.eventos[0].usuario_nome ?? null,
  };
}
