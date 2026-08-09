/**
 * src/lib/importar_excel_extra.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Suporte à aba EXTRA na importação de planilhas.
 *
 * Fluxo: a planilha pode ter uma segunda aba chamada **EXTRA** (nome
 * obrigatório). Quando o operador/setor tem a função Direto/Extra ativa, as
 * linhas dessa aba entram como acordos `tipo_vinculo: 'extra'`:
 *   - se existe um acordo DIRETO de OUTRO operador para o mesmo NR/inscrição →
 *     o extra é vinculado a ele (Caso A);
 *   - senão → extra órfão (sem vínculo), liberado até que alguém tabule o
 *     direto correspondente (o fluxo padrão de autorização por líder segue igual).
 *
 * Quando o operador NÃO tem a função ativa, a página simplesmente ignora a aba.
 *
 * Este módulo é PURO (sem JSX / sem Supabase) para permitir testes unitários.
 */
import type { RegistroImportado } from './importar_excel_parser';
import type { ClassificacaoNR } from '@/services/classificar_nrs_import.service';

/**
 * Deslocamento aplicado ao campo `linha` das linhas vindas da aba EXTRA, para
 * garantir chaves únicas mesmo quando as duas abas têm as mesmas posições de
 * linha. A linha real da planilha é preservada em `linhaPlanilha` (exibição).
 */
export const OFFSET_ABA_EXTRA = 1_000_000;

const norm = (s: string) => s.trim().toUpperCase();

/**
 * Localiza as abas na planilha:
 *  - EXTRA: aba cujo nome é "EXTRA" (case-insensitive) ou, na falta de um nome
 *    exato, a primeira aba cujo nome contenha "EXTRA" — opcional.
 *  - DIRETO (principal): aba "DIRETO" se existir; senão a primeira aba que não
 *    seja a EXTRA; senão a primeira aba. Mantém compatibilidade com planilhas
 *    de aba única (o comportamento antigo).
 */
export function selecionarAbas(sheetNames: string[]): { diretoIdx: number; extraIdx: number } {
  // EXTRA: primeiro tenta o nome exato "EXTRA"; se não houver, aceita qualquer
  // aba cujo nome CONTENHA "EXTRA" (ex.: "EXTRA BOOKPLAY", "Aba Extra"), para
  // não ignorar a aba em silêncio por uma pequena variação de nome.
  let extraIdx = sheetNames.findIndex(n => norm(n) === 'EXTRA');
  if (extraIdx === -1) extraIdx = sheetNames.findIndex(n => norm(n).includes('EXTRA'));

  let diretoIdx = sheetNames.findIndex(n => norm(n) === 'DIRETO');
  if (diretoIdx === -1) diretoIdx = sheetNames.findIndex((_, i) => i !== extraIdx);
  if (diretoIdx === -1) diretoIdx = 0;

  return { diretoIdx, extraIdx };
}

/**
 * Marca cada registro com a aba de origem. Para a aba EXTRA, desloca `linha`
 * para um namespace próprio (evita colisão de chaves) e guarda a linha real em
 * `linhaPlanilha`. Para a aba DIRETO, mantém `linha` intacta.
 */
export function marcarAba(
  registros: RegistroImportado[],
  aba: 'direto' | 'extra',
): RegistroImportado[] {
  const offset = aba === 'extra' ? OFFSET_ABA_EXTRA : 0;
  return registros.map(r => ({
    ...r,
    abaOrigem:     aba,
    linhaPlanilha: r.linha,
    linha:         r.linha + offset,
  }));
}

/**
 * Força a categoria 'extra' para as linhas vindas da aba EXTRA.
 *  - Se houver dono DIRETO de OUTRO operador → vincula a ele (Caso A).
 *  - Caso contrário (sem dono, ou dono é o próprio operador) → extra órfão,
 *    sem vínculo.
 * As demais linhas (aba DIRETO) permanecem com a classificação original.
 *
 * ## O que esta função NÃO pode fazer
 *
 * Ela não decide autorização — só a forma do vínculo. A versão anterior
 * carimbava `precisaAutorizacao: false` em TODAS as linhas da aba, passando
 * por cima do classificador. O portão da aba é "quem importa tem a lógica
 * ativa", e o dono do NR não era consultado: com os dois lados tendo a lógica
 * (CASO C), o classificador exigia líder e a aba EXTRA liberava assim mesmo.
 *
 * Agora a exigência do classificador é preservada. Só cai para `false` o que
 * de fato é Caso A (eu tenho a lógica, o dono não) ou extra órfão — os dois
 * casos em que a regra de negócio dispensa o líder.
 */
export function forcarClassificacaoExtra(
  classif: ClassificacaoNR[],
  linhasExtra: Set<number>,
  operadorAtualId: string,
): ClassificacaoNR[] {
  return classif.map(c => {
    if (!linhasExtra.has(c.linhaOriginal)) return c;
    const donoOutro = c.donoAtual && c.donoAtual.operadorId !== operadorAtualId
      ? c.donoAtual
      : undefined;
    // Sem dono de outro operador não há de quem tomar nada: extra órfão passa.
    // Com dono, o líder só é dispensado quando o dono NÃO tem a lógica ativa.
    const precisaAutorizacao = donoOutro ? c.donoTemLogica === true : false;
    return {
      ...c,
      categoria:         'extra',
      donoAtual:         donoOutro,
      operadorTemLogica: true,
      precisaAutorizacao,
    };
  });
}
