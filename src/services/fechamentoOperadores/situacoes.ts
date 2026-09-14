/**
 * situacoes.ts — as situações do operador NO FECHAMENTO.
 *
 * ## Não é `perfis.situacao`
 *
 * Os nomes se parecem (FÉRIAS, DESLIGADO) e é aí que mora a armadilha. A
 * situação do perfil bloqueia login, tira do ranking e do quartil. Esta aqui é
 * uma anotação da gerência sobre UM mês, sem efeito em tela nenhuma além da aba
 * Fechamento. Nada converte uma na outra — nem por nome igual.
 *
 * ## De onde vem a lista
 *
 * É a validação de dados da coluna «SITUAÇÃO OPERADOR» da planilha de
 * fechamento, na mesma ordem. O código é o que o banco guarda
 * (`fechamento_operadores.situacao`, CHECK da migration 20260914170000); o
 * rótulo é o texto da planilha.
 */

export const SITUACOES_FECHAMENTO = [
  { codigo: 'assiduo',          rotulo: 'ASSÍDUO' },
  { codigo: 'desligado',        rotulo: 'DESLIGADO' },
  { codigo: 'licenca',          rotulo: 'LICENÇA' },
  { codigo: 'atestado',         rotulo: 'ATESTADO' },
  { codigo: 'ferias',           rotulo: 'FÉRIAS' },
  { codigo: 'exp_45_dias',      rotulo: 'EXP. 45 DIAS' },
  { codigo: 'exp_90_dias',      rotulo: 'EXP. 90 DIAS' },
  { codigo: 'banco_de_horas',   rotulo: 'BANCO DE HORAS' },
  { codigo: 'remanejado',       rotulo: 'REMANEJADO' },
  { codigo: 'capacitaplay',     rotulo: 'CAPACITAPLAY' },
  { codigo: 'gravidez_atuando', rotulo: 'GRÁVIDEZ ATUANDO' },
  { codigo: 'falta',            rotulo: 'FALTA' },
  { codigo: 'outros',           rotulo: 'OUTROS' },
] as const;

export type SituacaoFechamento = typeof SITUACOES_FECHAMENTO[number]['codigo'];

const POR_CODIGO = new Map<string, string>(
  SITUACOES_FECHAMENTO.map(s => [s.codigo, s.rotulo]),
);

export function ehSituacaoFechamento(valor: unknown): valor is SituacaoFechamento {
  return typeof valor === 'string' && POR_CODIGO.has(valor);
}

export function rotuloSituacao(codigo: SituacaoFechamento): string {
  return POR_CODIGO.get(codigo) ?? codigo;
}

/**
 * As situações que o card FATURAMENTO TOTAL da planilha deixa de fora.
 *
 * A célula é `Outros!D25`:
 *
 *   =SUM(D23,G23,,K23,L23,M23,N23,O23,P23,I23,J23+E23)
 *
 * e a linha 23 é o fechamento somado por situação (`SUMIFS`). Das treze colunas
 * (D a P), a fórmula não cita F23 — LICENÇA — nem H23 — FÉRIAS. A MÉDIA POR
 * FUNCIONÁRIO divide esse mesmo D25 pela contagem das treze (`D26`), então as
 * duas pessoas continuam no divisor.
 *
 * Decisão de 14/09/2026: o card segue a planilha, e não a soma da tabela.
 */
export const FORA_DO_FATURAMENTO_TOTAL: ReadonlySet<SituacaoFechamento> = new Set([
  'licenca', 'ferias',
]);
