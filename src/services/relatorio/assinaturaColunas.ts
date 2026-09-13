/**
 * assinaturaColunas.ts — a armadilha de cabeçalho.
 *
 * ## Por que isto existe
 *
 * Os parsers resolvem coluna por ALIAS (`resolveCols`): procuram "dtpgto",
 * "datapgto", "datapagamento". Isso os torna tolerantes — e é justamente o que
 * os torna perigosos quando o ERP muda o relatório.
 *
 * Uma coluna renomeada não quebra a importação. Ela simplesmente **para de ser
 * lida**, e o número fica menor sem ninguém ver. Uma coluna nova também não
 * quebra: entra e é ignorada, mesmo que fosse ela que devia estar sendo somada.
 *
 * O único momento em que dá para pegar isso é ANTES de confirmar, comparando o
 * cabeçalho do arquivo com o que o ERP vinha mandando. É o que este módulo faz.
 *
 * ## O que conta como mudança
 *
 * Coluna que entrou, coluna que sumiu e coluna que trocou de lugar. A ordem
 * entra de propósito: cabeçalho com os mesmos nomes em outra ordem é outro
 * formato, e um parser que resolvesse por índice (não é o caso hoje, mas já foi)
 * leria tudo trocado sem reclamar.
 *
 * ## O que NÃO é tratado aqui
 *
 * Coluna obrigatória faltando já é recusada pelos parsers (`resolveCols` devolve
 * `null` e a importação nem chega ao preview). Esta comparação é sobre o resto:
 * o que mudou sem impedir a leitura.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

/** Os relatórios que o sistema conhece. Um formato guardado por empresa e tipo. */
export type TipoRelatorio = 'analitico_pagueplay' | 'analitico_bookplay' | 'mestre_59';

export interface MudancaDeColunas {
  /** Colunas que o arquivo trouxe e o formato conhecido não tinha. */
  novas: string[];
  /** Colunas que o formato conhecido tinha e o arquivo não trouxe. */
  sumidas: string[];
  /**
   * Mesmas colunas, ordem diferente. Só é preenchido quando `novas` e `sumidas`
   * estão vazias — senão a ordem muda por consequência, e apontá-la seria ruído.
   */
  ordemMudou: boolean;
  /** O formato conhecido, para a tela poder mostrar o antes e o depois. */
  conhecido: string[];
  /** O cabeçalho do arquivo, normalizado. */
  atual: string[];
  /** Quantas importações já aceitaram o formato conhecido. */
  importacoesDoConhecido: number;
}

/**
 * Normaliza como os parsers normalizam: sem acento, minúsculo, só alfanumérico.
 *
 * Tem de ser a MESMA regra do `norm` de `analiticoComum.ts` e do
 * `normalizarCabecalho` de `mestre59Parser.ts`. Se divergir, esta comparação
 * acusa mudança onde o parser não vê nenhuma — e o aviso vira ruído que as
 * pessoas aprendem a ignorar.
 */
export function normalizarColuna(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Cabeçalho cru → assinatura. Colunas vazias caem fora: não são coluna. */
export function assinaturaDe(cabecalho: readonly unknown[]): string[] {
  return cabecalho.map(normalizarColuna).filter(c => c !== '');
}

/**
 * Compara o cabeçalho do arquivo com o formato conhecido.
 *
 * `null` quando não há com o que comparar (primeira importação daquele tipo) ou
 * quando nada mudou — nos dois casos a tela não mostra nada, e é o certo:
 * avisar "está tudo igual" a cada importação treina a pessoa a fechar o aviso
 * sem ler.
 */
export function compararAssinatura(
  conhecido: readonly string[] | null | undefined,
  atual: readonly string[],
  importacoesDoConhecido = 0,
): MudancaDeColunas | null {
  if (!conhecido || conhecido.length === 0) return null;

  const setConhecido = new Set(conhecido);
  const setAtual = new Set(atual);

  const novas = atual.filter(c => !setConhecido.has(c));
  const sumidas = conhecido.filter(c => !setAtual.has(c));
  const ordemMudou = novas.length === 0 && sumidas.length === 0
    && conhecido.some((c, i) => atual[i] !== c);

  if (novas.length === 0 && sumidas.length === 0 && !ordemMudou) return null;

  return {
    novas,
    sumidas,
    ordemMudou,
    conhecido: [...conhecido],
    atual: [...atual],
    importacoesDoConhecido,
  };
}

/**
 * Uma frase para a tela. Fica aqui, e não no componente, porque é a regra de
 * leitura do aviso — quem mexer na comparação tem de mexer no texto junto.
 */
export function descreverMudanca(m: MudancaDeColunas): string {
  const partes: string[] = [];
  if (m.novas.length === 1) partes.push('1 coluna nova');
  else if (m.novas.length > 1) partes.push(`${m.novas.length} colunas novas`);

  if (m.sumidas.length === 1) partes.push('1 coluna sumiu');
  else if (m.sumidas.length > 1) partes.push(`${m.sumidas.length} colunas sumiram`);

  if (m.ordemMudou) partes.push('a ordem das colunas mudou');
  return partes.join(', ');
}

// ── Banco ────────────────────────────────────────────────────────────────────

/** O formato conhecido. `null` = primeira importação deste tipo nesta empresa. */
export async function buscarAssinatura(
  empresaId: string,
  tipo: TipoRelatorio,
): Promise<{ colunas: string[]; importacoes: number } | null> {
  const { data, error } = await rpcSemTipo<{ colunas: string[]; importacoes: number }[]>(
    'fn_relatorio_assinatura', { p_empresa_id: empresaId, p_tipo: tipo });
  if (error) throw new Error(error.message);
  const linha = data?.[0];
  return linha ? { colunas: linha.colunas, importacoes: linha.importacoes } : null;
}

/**
 * Grava o formato aceito. Chamada DEPOIS de a importação ser confirmada.
 *
 * Nunca no preview: o preview compara, e um arquivo que a pessoa olhou e
 * descartou não pode virar o novo normal.
 */
export async function registrarAssinatura(
  empresaId: string,
  tipo: TipoRelatorio,
  colunas: readonly string[],
): Promise<void> {
  const { error } = await rpcSemTipo('fn_relatorio_assinatura_registrar', {
    p_empresa_id: empresaId, p_tipo: tipo, p_colunas: colunas as string[],
  });
  if (error) throw new Error(error.message);
}
