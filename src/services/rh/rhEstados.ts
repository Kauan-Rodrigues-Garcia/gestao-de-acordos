/**
 * rhEstados.ts — a máquina de estados do RH Gestão, e os estados DERIVADOS.
 *
 * ## Por que equipe e setor não têm status próprio
 *
 * O estado de uma equipe é uma leitura dos lançamentos dela, e não um campo.
 * Guardar os dois abriria a possibilidade de a equipe dizer "validada" com um
 * operador dentro dizendo "devolvido" — o estado contraditório que este módulo
 * existe para não ter. Sem a coluna, não há o que divergir.
 *
 * A regra é sempre a mesma: **o nível de cima está no estado X quando TODOS os
 * filhos alcançaram X**. Um operador devolvido puxa a equipe para «com
 * pendência» sozinho, e é exatamente isso que se quer — sem reprovar os outros.
 *
 * ## Puro e sem React
 *
 * Como `fechamentoMes.ts` e `mesReferencia.ts`: são regras que precisam
 * responder o mesmo na tela do líder, na da gerência e na do RH. Ficando aqui,
 * respondem uma vez só e têm teste próprio.
 */

// ── A máquina ────────────────────────────────────────────────────────────────

/**
 * Os sete estados de um lançamento, do início ao fim.
 *
 * ```
 * pendente ─> preenchido ─> concluido_lider ─> validado_gerencia
 *      ^                                              │
 *      │                                              v
 *      │                                        enviado_rh ─┬─> aprovado_rh
 *      └──────────────── devolvido_rh <────────────────────┘
 * ```
 *
 * Sete, e não dezenas: cada um responde a uma pergunta que alguém faz de
 * verdade («já preencheram?», «o líder conferiu?», «a gerência validou?», «o RH
 * recebeu?»).
 *
 * `preenchido` e `concluido_lider` são passos DIFERENTES, e a distinção é o
 * requisito 8 do pedido: ter valor digitado em todo mundo não é a mesma coisa
 * que o líder declarar a equipe conferida — e é nessa segunda hora que o
 * percentual é congelado. Fundir os dois faria a equipe se declarar pronta
 * sozinha, no instante em que o último valor fosse digitado.
 */
export const STATUS_LANCAMENTO = [
  'pendente', 'preenchido', 'concluido_lider', 'validado_gerencia',
  'enviado_rh', 'devolvido_rh', 'aprovado_rh',
] as const;

export type StatusLancamento = typeof STATUS_LANCAMENTO[number];

/**
 * Ordem de AVANÇO no fluxo. `devolvido_rh` fica em -1 de propósito: ele não é
 * um passo adiante, é um passo para trás que precisa ser tratado antes de
 * qualquer outra coisa.
 */
const AVANCO: Record<StatusLancamento, number> = {
  devolvido_rh: -1,
  pendente: 0,
  preenchido: 1,
  concluido_lider: 2,
  validado_gerencia: 3,
  enviado_rh: 4,
  aprovado_rh: 5,
};

export interface EstadoMeta {
  label: string;
  /** Frase curta que explica de quem é a bola agora. */
  ajuda: string;
  /** Classes do badge, no vocabulário visual já usado no projeto. */
  cls: string;
}

export const ESTADO_META: Record<StatusLancamento, EstadoMeta> = {
  pendente: {
    label: 'Pendente',
    ajuda: 'Ainda sem valor informado',
    cls: 'bg-muted text-muted-foreground border-border',
  },
  preenchido: {
    label: 'Preenchido',
    ajuda: 'Valor informado, aguardando a conclusão da equipe pelo líder',
    cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  },
  concluido_lider: {
    label: 'Concluído',
    ajuda: 'Conferido pelo líder, aguardando a validação da gerência',
    cls: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  },
  validado_gerencia: {
    label: 'Validado',
    ajuda: 'Conferido pela gerência, aguardando envio ao RH',
    cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  },
  enviado_rh: {
    label: 'No RH',
    ajuda: 'Enviado ao RH, aguardando decisão',
    cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  },
  devolvido_rh: {
    label: 'Devolvido',
    ajuda: 'O RH devolveu para correção',
    cls: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
  aprovado_rh: {
    label: 'Aprovado',
    ajuda: 'Aprovado pelo RH',
    cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  },
};

/** O lançamento já passou (ou está em) este ponto do fluxo? */
export function alcancou(status: StatusLancamento, alvo: StatusLancamento): boolean {
  // Devolvido nunca "alcançou" nada: ele voltou.
  if (status === 'devolvido_rh') return false;
  return AVANCO[status] >= AVANCO[alvo];
}

/**
 * Quem preenche ainda pode mexer no valor?
 *
 * `concluido_lider` entra: corrigir depois de concluir é legítimo, e o efeito é
 * a linha voltar para `preenchido` — a equipe deixa de estar concluída e o líder
 * conclui de novo. Isso é visível de propósito: uma correção depois da conclusão
 * não pode passar despercebida por quem vai validar.
 *
 * `validado_gerencia` e `enviado_rh` ficam de fora: mudar o valor por baixo de
 * uma conferência já feita é o que a devolução existe para evitar.
 */
export function editavel(status: StatusLancamento): boolean {
  return status === 'pendente'
      || status === 'preenchido'
      || status === 'concluido_lider'
      || status === 'devolvido_rh';
}

// ── Estado derivado de um conjunto ───────────────────────────────────────────

/** O mínimo que uma linha precisa expor para o estado do grupo ser calculado. */
export interface LinhaResumivel {
  status: StatusLancamento;
  valor: number | null;
  /**
   * Fora da folha desta competência (não atingiu, afastamento, admissão no
   * meio do mês).
   *
   * Ele NÃO é pendente: não há valor a informar, e contá-lo como falta faria a
   * equipe aparecer eternamente «em preenchimento» com um número que ninguém
   * vai digitar. Também não é preenchido — não há o que conferir. Tem contagem
   * própria.
   */
  dispensado?: boolean | null;
}

/**
 * O estado de um grupo (equipe, setor, cidade, competência).
 *
 * Não é um dos sete estados de linha: um grupo pode estar «em conferência» com
 * metade validada, e nenhum status de linha descreve isso.
 */
export type EstadoGrupo =
  | 'vazio'            // não há operadores aqui
  | 'nao_iniciado'     // nada preenchido
  | 'em_preenchimento' // começou, ainda falta
  | 'concluido'        // o líder concluiu, esperando a gerência
  | 'validado'         // gerência conferiu, ainda não enviou
  | 'enviado'          // no RH, aguardando decisão
  | 'com_devolucao'    // há pelo menos uma devolução aberta
  | 'aprovado';        // tudo aprovado

export interface ResumoGrupo {
  estado: EstadoGrupo;
  total: number;
  preenchidos: number;
  pendentes: number;
  devolvidos: number;
  aprovados: number;
  /** Marcados como fora da folha. Não são pendentes nem preenchidos. */
  dispensados: number;
  /** Quantos realmente entram na folha — `total - dispensados`. */
  naFolha: number;
  /** Soma dos valores informados. Linha sem valor não entra. */
  valorTotal: number;
}

/**
 * Lê o estado de um conjunto de lançamentos.
 *
 * A ordem das perguntas importa e é a ordem da urgência de quem olha:
 *
 *   1. **tem devolução?** — é o que precisa de ação agora, e uma devolução no
 *      meio de um setor aprovado não pode ser escondida pela maioria;
 *   2. tudo aprovado?
 *   3. tudo enviado (ou adiante)?
 *   4. tudo validado (ou adiante)?
 *   5. o líder concluiu tudo (ou adiante)?
 *   6. começou?
 *
 * Inverter 1 e 2 faria «9 aprovados e 1 devolvido» aparecer como aprovado — e
 * essa é justamente a situação que o RH precisa enxergar de longe.
 */
export function resumirGrupo(linhas: readonly LinhaResumivel[]): ResumoGrupo {
  const total = linhas.length;
  const base: ResumoGrupo = {
    estado: 'vazio', total,
    preenchidos: 0, pendentes: 0, devolvidos: 0, aprovados: 0,
    dispensados: 0, naFolha: total, valorTotal: 0,
  };
  if (total === 0) return base;

  for (const l of linhas) {
    if (l.valor != null) base.valorTotal += Number(l.valor) || 0;
    // A dispensa é lida ANTES do status: uma linha fora da folha com status
    // `pendente` não é uma falta de preenchimento, e contá-la como tal é o que
    // deixava a equipe travada em «em preenchimento» para sempre.
    if (l.dispensado) base.dispensados++;
    else if (l.status === 'devolvido_rh') base.devolvidos++;
    else if (l.status === 'pendente') base.pendentes++;
    else base.preenchidos++;
    if (l.status === 'aprovado_rh') base.aprovados++;
  }
  base.naFolha = total - base.dispensados;

  const todos = (alvo: StatusLancamento) => linhas.every(l => alcancou(l.status, alvo));

  if (base.devolvidos > 0)        base.estado = 'com_devolucao';
  else if (todos('aprovado_rh'))  base.estado = 'aprovado';
  else if (todos('enviado_rh'))   base.estado = 'enviado';
  else if (todos('validado_gerencia')) base.estado = 'validado';
  // «Concluído» é o líder ter declarado a equipe pronta — não «todo mundo tem
  // valor digitado». Ver o comentário de STATUS_LANCAMENTO.
  else if (todos('concluido_lider')) base.estado = 'concluido';
  else if (base.preenchidos > 0)  base.estado = 'em_preenchimento';
  // Todo mundo fora da folha e nada preenchido: a equipe não está parada, ela
  // não tem o que lançar. Dizer «não enviado» aqui cobraria uma ação que não
  // existe.
  else if (base.dispensados === total) base.estado = 'concluido';
  else                            base.estado = 'nao_iniciado';

  return base;
}

export const GRUPO_META: Record<EstadoGrupo, { label: string; cls: string }> = {
  vazio:            { label: 'Sem operadores',  cls: 'bg-muted text-muted-foreground border-border' },
  nao_iniciado:     { label: 'Não enviado',     cls: 'bg-muted text-muted-foreground border-border' },
  em_preenchimento: { label: 'Em preenchimento', cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
  concluido:        { label: 'Concluído',       cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30' },
  validado:         { label: 'Em conferência',  cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  enviado:          { label: 'Recebido',        cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  com_devolucao:    { label: 'Com pendência',   cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  aprovado:         { label: 'Aprovado',        cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
};

// ── Prazo ────────────────────────────────────────────────────────────────────

export type EstadoPrazo = 'sem_prazo' | 'dentro' | 'proximo' | 'encerrado' | 'enviado';

/** A partir de quantos dias restantes o prazo vira «próximo». */
export const DIAS_PRAZO_PROXIMO = 2;

/**
 * Em que pé está o prazo — do ponto de vista de um grupo.
 *
 * `jaEnviou` vence tudo: quem entregou não precisa ver «prazo encerrado» em
 * vermelho no dia seguinte. O aviso existe para quem ainda deve algo.
 *
 * As datas são comparadas como texto `yyyy-MM-dd` de propósito: `new Date()` de
 * uma data pura vira meia-noite UTC e, no fuso de São Paulo, antecipa o
 * vencimento em três horas — o prazo apareceria vencido às 21h do dia anterior.
 */
export function estadoDoPrazo(
  prazo: string | null | undefined,
  hojeISO: string,
  jaEnviou: boolean,
): EstadoPrazo {
  if (jaEnviou) return 'enviado';
  if (!prazo) return 'sem_prazo';
  if (hojeISO > prazo) return 'encerrado';
  if (diasEntreISO(hojeISO, prazo) <= DIAS_PRAZO_PROXIMO) return 'proximo';
  return 'dentro';
}

/** Dias corridos entre duas datas `yyyy-MM-dd`. Negativo quando `ate` já passou. */
export function diasEntreISO(de: string, ate: string): number {
  const MS_DIA = 86_400_000;
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

export const PRAZO_META: Record<EstadoPrazo, { label: string; cls: string }> = {
  sem_prazo: { label: 'Sem prazo definido', cls: 'text-muted-foreground' },
  dentro:    { label: 'Dentro do prazo',    cls: 'text-emerald-500' },
  proximo:   { label: 'Prazo próximo',      cls: 'text-amber-500' },
  encerrado: { label: 'Prazo encerrado',    cls: 'text-red-400' },
  enviado:   { label: 'Enviado',            cls: 'text-emerald-500' },
};

// ── Tipo de remuneração ──────────────────────────────────────────────────────

export type TipoRemuneracao = 'premiacao' | 'comissao';

export const TIPO_REMUNERACAO_LABEL: Record<TipoRemuneracao, string> = {
  premiacao: 'Premiação',
  comissao:  'Comissão',
};

/**
 * O rótulo da coluna de valor, que muda com o contexto do setor.
 *
 * Existe aqui, e não escrito na tela, porque o pedido é explícito: nada de
 * condicional por nome de setor espalhada pelo código. A tela pergunta o tipo
 * ao lançamento (que o carrega em snapshot) e pede o rótulo aqui.
 */
export function rotuloValor(tipo: string | null | undefined): string {
  return TIPO_REMUNERACAO_LABEL[(tipo ?? 'premiacao') as TipoRemuneracao] ?? 'Valor';
}
