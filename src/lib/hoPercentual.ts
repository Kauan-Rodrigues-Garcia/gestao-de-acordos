/**
 * hoPercentual.ts — quanto do recebido fica na PaguePlay (o H.O.).
 *
 * ## Era uma constante, virou configuração (29/09/2026)
 *
 * Até aqui `PP_HO_PERCENTUAL = 0.2496` morava em `lib/index.ts`, espelhado em
 * `fn_pp_ho_percentual()` no banco. Mudar o número exigia um deploy e uma
 * migration. Agora ele fica em `empresas.config.ho_percentual`, a aba Metas
 * edita, e o banco lê do mesmo lugar.
 *
 * O padrão passou de 24,96% para 22,60% — o que o relatório analítico do ERP
 * pratica hoje (Total HO ÷ Recebido).
 *
 * ## Onde este número NÃO entra mais
 *
 * No H.O. do ANALÍTICO. Lá o H.O. vem pronto da coluna «Total HO» do relatório
 * e fica gravado em `analitico_recebimentos.total_ho`; ninguém recalcula. Este
 * percentual é para o que NÃO tem H.O. de relatório:
 *
 *   • converter meta entre bruto e H.O. (aba Metas, comissão, bônus);
 *   • valores de ACORDOS (agendado, pago pelo painel, indireto, Direto/Extra);
 *   • o relatório diário, que não traz a coluna;
 *   • o ajuste manual do analítico, que não vem de relatório nenhum.
 *
 * ## Por que um store, e não só contexto
 *
 * Metade de quem usa não é React: `metaNaUnidade`, a comissão, os serviços do
 * analítico. Eles leem `getHoPercentual()`. As telas usam `useHoPercentual()`,
 * que é o mesmo valor com re-render quando ele muda. Quem abastece é o
 * `EmpresaProvider`, ao carregar a empresa.
 */
import { useSyncExternalStore } from 'react';

/** O que vale enquanto a empresa não carregou, ou quando ela não tem o campo. */
export const HO_PERCENTUAL_PADRAO = 0.2260;

/** Chave em `empresas.config`. */
export const CHAVE_HO_PERCENTUAL = 'ho_percentual';

let atual = HO_PERCENTUAL_PADRAO;
const ouvintes = new Set<() => void>();

/** Fração (0,2260), não percentual (22,60). */
export function getHoPercentual(): number {
  return atual;
}

/** Aceita só fração entre 0 e 1 (exclusivo); o resto volta ao padrão. */
export function normalizarHoPercentual(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : HO_PERCENTUAL_PADRAO;
}

export function setHoPercentual(v: unknown): void {
  const n = normalizarHoPercentual(v);
  if (n === atual) return;
  atual = n;
  ouvintes.forEach(f => f());
}

/** O valor que está em `empresas.config`, ou o padrão. */
export function hoPercentualDaConfig(config: Record<string, unknown> | null | undefined): number {
  return normalizarHoPercentual(config?.[CHAVE_HO_PERCENTUAL]);
}

function assinar(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** O percentual atual, com re-render quando a aba Metas o troca. */
export function useHoPercentual(): number {
  return useSyncExternalStore(assinar, getHoPercentual, getHoPercentual);
}

/** Bruto → H.O. */
export function paraHO(bruto: number): number {
  return bruto * atual;
}

/** H.O. → bruto, em centavos. */
export function deHO(ho: number): number {
  return Math.round((ho / atual) * 100) / 100;
}

/** «22,60%» — para rótulos. */
export function rotuloHoPercentual(fracao: number = atual): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * O percentual que um relatório está praticando: Total HO ÷ Recebido.
 * `null` sem recebido, ou quando não há H.O. nenhum (BookPlay).
 */
export function percentualImplicito(recebido: number, ho: number): number | null {
  if (!Number.isFinite(recebido) || !Number.isFinite(ho) || recebido === 0 || ho === 0) return null;
  return ho / recebido;
}

/**
 * O repasse (Coren + Cofen) é o que sobra do H.O.
 *
 * A divisão original era 56,28% Coren e 18,76% Cofen sobre um H.O. de 24,96% —
 * Coren recebia exatamente 3× o Cofen. Com o H.O. configurável, o restante
 * continua dividido na mesma proporção 3:1, e os três somam 100%. Se a regra
 * do repasse mudar, é aqui.
 */
export function repassePercentuais(ho: number = atual): { coren: number; cofen: number } {
  const resto = 1 - ho;
  return { coren: resto * 0.75, cofen: resto * 0.25 };
}

/**
 * O fator que converte a META quando o H.O. do outro lado veio de RELATÓRIO.
 *
 * A comparação «recebido em H.O. ÷ meta em H.O.» só é honesta se os dois lados
 * usarem a mesma proporção. O recebido vem da coluna do relatório (hoje ~22,60%,
 * até 29/09/2026 gravado a 24,96%); se a meta fosse convertida pelo percentual
 * CONFIGURADO, qualquer mês em que os dois diferem — agosto inteiro, setembro
 * antes da reimportação — sairia com a % em H.O. descolada da % em bruto, e a
 * comissão subiria de faixa sem ninguém ter recebido um real a mais.
 *
 * Então a meta usa a proporção do PRÓPRIO recebido que ela está medindo
 * (H.O. ÷ bruto do operador, da equipe, do setor). Com isso a % em H.O. é a %
 * em bruto em qualquer mês — como sempre foi até aqui. Sem recebido ainda
 * (começo do mês), vale o percentual configurado.
 */
export function fatorDoRecebido(bruto: number, ho: number): number {
  return percentualImplicito(bruto, ho) ?? atual;
}
