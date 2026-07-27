/**
 * types.ts — tipos da importação de planilhas de operador (leitura + vínculo).
 *
 * Escopo: LER os Excel, classificar linhas (paga/pendente/revisão), vincular ao
 * operador cadastrado e montar a prévia consolidada por operador. Sem pagamento.
 */

/** Status de uma linha após a leitura e o vínculo. */
export type StatusLinha =
  | 'PENDENTE'            // pendente e válida (entra na consolidação)
  | 'PAGO_EXTERNO'        // verde no Excel → já paga fora; não consolida
  | 'NEEDS_REVIEW'        // cores conflitantes ou valor divergente > R$0,01
  | 'OPERATOR_NOT_FOUND'  // login não casou com nenhum operador
  | 'AMBIGUOUS_OPERATOR'  // login casou com mais de um operador
  | 'ALREADY_IMPORTED'    // mesma chave idempotente, mesmos valor+operador
  | 'CONFLICT'            // mesma chave, valor/operador diferente
  | 'INVALIDA';           // faltam obrigatórios (login/nr/valor>0)

/** Status de cor lido do preenchimento das células. */
export type StatusCor = 'PAGO' | 'PENDENTE' | 'CONFLITO';

/** Uma linha financeira lida da aba operacional. */
export interface LinhaPlanilha {
  /** Índice da linha na planilha (1-based, para auditoria/erro). */
  linhaExcel: number;
  /** Login original (preservado) e normalizado. */
  loginOriginal: string;
  loginNormalizado: string;
  /** NR original e normalizado. */
  nrOriginal: string;
  nrNormalizado: string;
  /** Responsável da linha (coluna Super), se houver. */
  superLinha: string | null;
  dataISO: string | null;
  matricula: string | null;
  /** Valores em string decimal (nunca float) — o consolidador usa precisão. */
  valorNota: string | null;
  percentual: string | null;
  valorCalculado: string | null;
  /** Valor a considerar para pagamento (Meta batida-Pendente). */
  metaBatidaPendente: string;
  statusCor: StatusCor;
  status: StatusLinha;
  /** Chave idempotente sha256(principal|nr|login). */
  chaveIdempotente: string;
  /** Operador vinculado (quando status permite). */
  operadorId: string | null;
  operadorNome: string | null;
  operadorSetorId: string | null;
  /** Observação para a prévia (motivo de revisão/erro). */
  observacao?: string;
}

/** Consolidação por operador dentro de um arquivo/responsável. */
export interface ConsolidadoOperador {
  operadorId: string;
  operadorNome: string;
  operadorSetorId: string | null;
  loginNormalizado: string;
  /** Soma dos pendentes (string decimal, precisão total). */
  totalBruto: string;
  /** Total arredondado uma vez (2 casas, ROUND_HALF_UP) — string "0.00". */
  totalArredondado: string;
  /** Linhas que compõem o total (auditoria). */
  linhas: LinhaPlanilha[];
}

/** Resultado da leitura de um arquivo. */
export interface ResultadoArquivo {
  nomeArquivo: string;
  principal: string;
  abaUsada: string | null;
  /** Hash sha256 do arquivo (auditoria/idempotência). */
  hashArquivo: string;
  ok: boolean;
  error?: string;
  /** Todas as linhas classificadas. */
  linhas: LinhaPlanilha[];
  /** Contagens para os critérios de aceite. */
  totais: {
    verdesPagas: number;
    pendentes: number;
    needsReview: number;
    operadoresComPendencia: number;
    /** Total pendente bruto (string decimal, precisão total). */
    totalPendenteBruto: string;
  };
  /** Consolidação por operador (só pendentes válidos). */
  consolidado: ConsolidadoOperador[];
}
