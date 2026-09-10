/**
 * numerosRegras.ts — os estados de um número, e quem pode movê-lo.
 *
 * ## Os dois eixos, e por que não são um só
 *
 * `situacao` responde **como o número está**: aquecendo, ativo ou banido.
 * `posse` responde **onde ele está**: no Núcleo ou no setor.
 * `operadorId` responde **com quem**, dentro do setor.
 *
 * Juntar os dois primeiros numa lista só parece mais simples até aparecer
 * "banido no Núcleo" e "banido no setor" — dois estados reais e diferentes, que
 * obrigariam a lista a ser o produto dos dois eixos. O pedido é explícito em
 * não criar status a mais, e a forma de não criar é manter as perguntas
 * separadas.
 *
 * ## O caminho inteiro
 *
 * ```
 *   Núcleo                          setor                      operador
 *   ──────                          ─────                      ────────
 *   cadastro
 *     └─ em_aquecimento
 *          └─ ativo ──── liberar ──► posse=setor
 *                                      └── lançar ──────────► operadorId
 *                                      ◄── devolver ─────────┘
 *          ◄──── relançar (motivo) ───┘
 * ```
 *
 * ## Isto é o espelho, não a autoridade
 *
 * As mesmas perguntas são feitas em três lugares: o botão da tela, o serviço
 * antes de chamar a RPC, e a RPC dentro do Postgres. **Quem manda é o banco** —
 * estas funções existem para a tela não oferecer uma ação que o banco vai
 * recusar, o que é feio e confunde quem usa.
 *
 * Módulo puro, no mesmo espírito de `rhEstados.ts`.
 */

// ── Situação ────────────────────────────────────────────────────────────────

/**
 * As três situações, e a lista é curta porque o pedido manda ser.
 *
 * Cada uma responde a uma pergunta que alguém faz de verdade: «já dá para
 * usar?», «está em uso?», «morreu?». Um quarto status só entra aqui quando
 * houver uma quarta pergunta.
 */
export const SITUACOES = ['em_aquecimento', 'ativo', 'banido'] as const;
export type Situacao = typeof SITUACOES[number];

export const SITUACAO_LABELS: Record<Situacao, string> = {
  em_aquecimento: 'Em aquecimento',
  ativo:          'Ativo',
  banido:         'Banido',
};

// ── Posse ───────────────────────────────────────────────────────────────────

/** Onde o número está. Dois lugares, e não há um terceiro. */
export const POSSES = ['nucleo', 'setor'] as const;
export type Posse = typeof POSSES[number];

export const POSSE_LABELS: Record<Posse, string> = {
  nucleo: 'No Núcleo',
  setor:  'No setor',
};

// ── Motivo do retorno ───────────────────────────────────────────────────────

/**
 * Por que um número voltou.
 *
 * Lista curta com `outro` no fim, em vez de texto livre puro: o Núcleo precisa
 * conseguir contar quantos foram banidos no mês sem ler trezentas observações.
 * A observação livre continua existindo ao lado, para o que a lista não cobre.
 */
export const MOTIVOS_RETORNO = ['banido', 'sem_uso', 'problema_tecnico', 'outro'] as const;
export type MotivoRetorno = typeof MOTIVOS_RETORNO[number];

export const MOTIVO_LABELS: Record<MotivoRetorno, string> = {
  banido:           'Banido',
  sem_uso:          'Sem uso',
  problema_tecnico: 'Problema técnico',
  outro:            'Outro',
};

// ── O limite do celular ─────────────────────────────────────────────────────

/**
 * Seis números por celular.
 *
 * Aqui o valor serve à TELA — o contador `4/6` e o botão desabilitado no sexto.
 * A garantia é a trigger no Postgres, que conta com a linha do celular travada:
 * duas pessoas cadastrando ao mesmo tempo não passam de seis, e uma contagem
 * feita no navegador nunca conseguiria prometer isso.
 */
export const LIMITE_POR_CELULAR = 6;

/** Ainda cabe um número neste celular? */
export function cabeMaisNumero(quantidadeAtual: number): boolean {
  return quantidadeAtual < LIMITE_POR_CELULAR;
}

/** Quantas vagas sobram. Nunca negativo — a tela mostraria "-1 vagas". */
export function vagasNoCelular(quantidadeAtual: number): number {
  return Math.max(0, LIMITE_POR_CELULAR - quantidadeAtual);
}

// ── As transições ───────────────────────────────────────────────────────────

/** O que basta saber de um número para decidir o que pode ser feito com ele. */
export interface EstadoNumero {
  situacao: Situacao;
  posse: Posse;
  operadorId: string | null;
}

/**
 * O Núcleo pode disponibilizar este número ao setor dono?
 *
 * Só número ATIVO sai do Núcleo. Liberar um que ainda aquece entregaria ao
 * setor um número que não funciona, e o setor devolveria — movimentação a mais
 * no histórico para nada.
 */
export function podeLiberarAoSetor(n: EstadoNumero): boolean {
  return n.posse === 'nucleo' && n.situacao === 'ativo';
}

/**
 * A liderança pode lançar este número a um operador?
 *
 * Vale também para TROCAR o operador de um número já lançado — é a mesma ação,
 * e o histórico guarda de quem para quem.
 *
 * Número banido não é lançado mesmo estando no setor: entregar a alguém um
 * número que já se sabe que não funciona é criar trabalho perdido. O caminho
 * dele é o relançamento.
 */
export function podeLancarAoOperador(n: EstadoNumero): boolean {
  return n.posse === 'setor' && n.situacao !== 'banido';
}

/**
 * Este operador pode devolver este número à liderança?
 *
 * Só o dono devolve, e o número não sai do setor — é o passo curto, para o
 * operador não precisar de ninguém quando o número para de servir. Banido
 * devolve também: é justamente o caso mais comum.
 */
export function podeDevolverALideranca(n: EstadoNumero, usuarioId: string): boolean {
  return n.posse === 'setor' && n.operadorId !== null && n.operadorId === usuarioId;
}

/**
 * A liderança pode devolver este número ao Núcleo?
 *
 * Com ou sem operador: relançar um número que está na mão de alguém é legítimo
 * (o operador saiu, o número foi banido), e a RPC solta o operador junto.
 */
export function podeRelancarAoNucleo(n: EstadoNumero): boolean {
  return n.posse === 'setor';
}

/**
 * O motivo informado está na lista?
 *
 * Motivo é obrigatório no relançamento: sem ele o Núcleo recebe o número de
 * volta sem saber o que precisa tratar, que é exatamente o que o pedido manda
 * evitar.
 */
export function motivoValido(motivo: unknown): motivo is MotivoRetorno {
  return typeof motivo === 'string'
    && (MOTIVOS_RETORNO as readonly string[]).includes(motivo);
}
