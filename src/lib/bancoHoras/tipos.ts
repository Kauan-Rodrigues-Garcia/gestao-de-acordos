/**
 * Os tipos do Banco de Horas (relatório HRBH102 do DP).
 *
 * Horas sempre em MINUTOS (inteiro, com sinal: negativo = devendo). Datas em
 * ISO (`aaaa-mm-dd`).
 */

/** [data do vencimento, minutos que vencem nela] */
export type Vencimento = [string, number];

/** Uma pessoa como o DP manda. */
export interface PessoaDP {
  mat: string;
  nome: string;
  saldo: number;
  /** A data do saldo da pessoa (coluna «em» do relatório). */
  em: string | null;
  venc: Vencimento[];
}

/** Um setor do DP numa data de saldo. */
export interface SetorDP {
  setor: string;
  depto: string | null;
  hierarquia: string | null;
  empresa: string | null;
  /** Código da empresa no DP: 3 = Book Play, 5 = Pague Play. */
  empresaCode: string;
  arquivo: string | null;
  /** Quando o DP gerou o arquivo, «aaaa-mm-dd hh:mm». */
  gerado: string | null;
  usuario: string | null;
  people: PessoaDP[];
  importadoEm?: string | null;
}

/** Um relatório: uma data de «Saldo Banco em» com os setores dela (chave `empresaCode|setor`). */
export interface PosicaoBH {
  date: string;
  setores: Record<string, SetorDP>;
  importadoEm: string | null;
  gerado: string | null;
  usuario: string | null;
}

/** O que vai para o banco: um setor de uma data, com a assinatura do conteúdo. */
export interface SetorParaGravar extends SetorDP {
  date: string;
  assinatura: string;
}
