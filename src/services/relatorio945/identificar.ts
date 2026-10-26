/**
 * identificar.ts — qual relatório do ERP é este arquivo, pelo cabeçalho.
 *
 * São dois relatórios com o mesmo botão de "Importar" em telas vizinhas:
 *
 *   58   pagamento mensal (Cobradora, Equipe, Cliente, TpDoc, DtPgto, Recebido…)
 *        → recorte Mês do Analítico. Vale para as duas regras.
 *   945  recebimento diário da regra Cofen (Id.Baixa, UF Coren, Split, Coren,
 *        Cofen, Pague Play, Dt.Baixa, Horário, Operador…)
 *        → recorte Dia do Analítico e Painel Diretoria › Relatório de pagamento.
 *
 * Até 26/10/2026 cada importador só conferia as colunas que usava, e o 58 passava
 * pelo importador do diário: tem «Operador» e «Recebido». Sem coluna de data, as
 * 5.014 linhas foram parar no dia da importação (R$ 2,07 mi em 06, 08 e 22/10).
 * Agora cada importador pergunta primeiro QUAL relatório é, e recusa o outro com
 * o caminho certo na mensagem.
 *
 * Sem xlsx aqui: os dois parsers importam este módulo.
 */

export type TipoRelatorio = '945' | '58' | 'desconhecido';

const normalizar = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function identificarRelatorio(cabecalho: readonly unknown[]): TipoRelatorio {
  const h = new Set(cabecalho.map(normalizar));
  const tem = (...nomes: string[]) => nomes.some(n => h.has(n));
  // O 945 é o único com Id.Baixa + UF Coren; o split confirma (há exportações
  // com o percentual no nome da coluna: «Coren 56,28»).
  if (tem('idbaixa') && tem('ufcoren') && [...h].some(n => n.startsWith('coren') || n.startsWith('cofen'))) return '945';
  // O 58 não tem Id.Baixa e tem as colunas da cobradora.
  if (!tem('idbaixa') && tem('cobradora', 'operador') && tem('tpdoc', 'dtpgto', 'datapgto')) return '58';
  return 'desconhecido';
}

export const MSG_58_NO_LUGAR_DO_945 =
  'Este arquivo é o relatório 58 (pagamento mensal), não o 945. ' +
  'O 58 se importa no Analítico, recorte Mês, botão «Importar 58». ' +
  'Aqui entra o relatório 945 de recebimento diário (com Id.Baixa, UF Coren e Split).';

export const MSG_945_NO_LUGAR_DO_58 =
  'Este arquivo é o relatório 945 (recebimento diário da regra Cofen), não o 58. ' +
  'O 945 se importa no Analítico, recorte Dia, botão «Importar 945», ou no Painel Diretoria › Relatório de pagamento. ' +
  'Aqui entra o relatório 58 de pagamento mensal.';
