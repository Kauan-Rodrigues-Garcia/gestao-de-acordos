// src/pages/Dashboard/Analitico/ranking/corrida.ts
/**
 * As contas da «corrida do mês» — o ranking do Analítico desenhado como pista.
 *
 * Puro de propósito: quem está à frente, quanto falta, quanto de folga e onde
 * cada um fica na pista são perguntas com resposta certa, e a resposta precisa
 * de teste sem montar React.
 *
 * Um «corredor» é quem disputa: uma pessoa ou, no critério de equipes, um
 * grupo. `base` é o número que decidiu a posição — reais no critério de
 * recebimento, pontos percentuais no de percentual. `null` = sem régua (sem
 * meta definida), e quem está sem régua não tem distância para ninguém.
 */

export interface Corredor {
  id: string;
  nome: string;
  /** Linha de baixo do nome: equipe, usuário, "3 pessoas"... */
  sub: string | null;
  foto?: string | null;
  base: number | null;
}

/** Onde o corredor fica na pista, de 0 (largada) a 1 (o líder). */
export function fracaoNaPista(base: number | null, maior: number): number {
  if (base == null || maior <= 0) return 0;
  return Math.min(1, Math.max(0, base / maior));
}

/** O maior número com régua — o 1º pode estar sem meta quando ninguém tem. */
export function maiorBase(corredores: readonly Corredor[]): number {
  return corredores.reduce((m, c) => (c.base != null && c.base > m ? c.base : m), 0);
}

/** Quanto falta para alcançar quem está à frente. `null` = sem régua de um dos lados. */
export function distancia(frente: Corredor | null | undefined, eu: Corredor): number | null {
  if (!frente || frente.base == null || eu.base == null) return null;
  return Math.max(0, frente.base - eu.base);
}

export interface ResumoDaCorrida {
  posicao: number;
  de: number;
  /** Quem está logo à frente, e quanto falta. `null` = você lidera. */
  alvo: { nome: string; posicao: number; falta: number | null } | null;
  /** Quem vem logo atrás, e a folga. `null` = ninguém atrás. */
  folga: { nome: string; posicao: number; valor: number | null } | null;
}

/** A corrida vista por um corredor só. `null` quando ele não está na lista. */
export function resumoDaCorrida(corredores: readonly Corredor[], id: string): ResumoDaCorrida | null {
  const i = corredores.findIndex(c => c.id === id);
  if (i < 0) return null;
  const eu = corredores[i];
  const frente = i > 0 ? corredores[i - 1] : null;
  const atras = i < corredores.length - 1 ? corredores[i + 1] : null;
  return {
    posicao: i + 1,
    de: corredores.length,
    alvo: frente ? { nome: frente.nome, posicao: i, falta: distancia(frente, eu) } : null,
    folga: atras ? { nome: atras.nome, posicao: i + 2, valor: distancia(eu, atras) } : null,
  };
}

/** Primeiro e segundo nome — "Ana Clara Ferreira Souza" → "Ana Clara". */
export function nomeCurto(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).join(' ');
}
