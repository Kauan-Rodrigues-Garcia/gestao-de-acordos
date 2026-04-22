/**
 * Definição declarativa das colunas da tabela "Dados reconhecidos" no preview
 * de ImportarExcel.
 *
 * Separado do componente React para permitir testes unitários puros (sem JSX).
 * A ordem é EXATAMENTE a ordem com que as <th>/<td> são renderizadas.
 *
 * Convenções por tenant:
 * ─ Bookplay (default): coluna "NR" (r.nr_cliente) + "INST." (r.instituicao) ao final.
 * ─ PaguePlay: coluna "INSCRIÇÃO" (r.instituicao) + "ESTADO" (r.estado_uf) na frente;
 *              "CPF" (r.nr_cliente) após NOME; SEM colunas "NR" e "INST.".
 */

/** Chaves estáveis usadas pela UI para identificar cada coluna — NÃO renomear
 *  sem atualizar os testes e o JSX que as referencia. */
export type ColunaPreviewKey =
  | '#'
  | 'BLOCO'
  | '✓'
  | 'NR'
  | 'INSCRIÇÃO'
  | 'ESTADO'
  | 'CLASS.'
  | 'NOME'
  | 'CPF'
  | 'VENCIMENTO'
  | 'VALOR'
  | 'PARC.'
  | 'STATUS'
  | 'WHATS'
  | 'INST.'
  | 'AVISOS / ERROS';

export interface ColunasPreviewOpts {
  /** Tenant é PaguePlay? Controla a presença das colunas INSCRIÇÃO/ESTADO/CPF
   *  (em vez de NR/INST.). */
  ehPaguePay: boolean;
  /** Modo do parser: 'blocos' adiciona a coluna BLOCO; 'tabela' não. */
  modoParsed: 'tabela' | 'blocos';
}

/**
 * Retorna a lista ordenada de colunas exibidas na tabela de preview.
 * Bookplay (ehPaguePay=false), tabela:
 *   # ✓ NR CLASS. NOME VENCIMENTO VALOR PARC. STATUS WHATS INST. AVISOS / ERROS
 * PaguePlay (ehPaguePay=true), tabela:
 *   # ✓ INSCRIÇÃO ESTADO CLASS. NOME CPF VENCIMENTO VALOR PARC. STATUS WHATS AVISOS / ERROS
 */
export function colunasPreviewImport(opts: ColunasPreviewOpts): ColunaPreviewKey[] {
  const { ehPaguePay, modoParsed } = opts;
  const cols: ColunaPreviewKey[] = ['#'];
  if (modoParsed === 'blocos') cols.push('BLOCO');
  cols.push('✓');
  if (ehPaguePay) cols.push('INSCRIÇÃO', 'ESTADO');
  else            cols.push('NR');
  cols.push('CLASS.', 'NOME');
  if (ehPaguePay) cols.push('CPF');
  cols.push('VENCIMENTO', 'VALOR', 'PARC.', 'STATUS', 'WHATS');
  if (!ehPaguePay) cols.push('INST.');
  cols.push('AVISOS / ERROS');
  return cols;
}
