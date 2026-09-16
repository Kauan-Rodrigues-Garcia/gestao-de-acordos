/**
 * acumuladoMensal.ts — a tabela «Acumulado por mês» do relatório PaguePlay, fora do iframe.
 *
 * A tabela da tela vive em `original.html` (`buildCorenMonthly`) e só enxerga o
 * que o iframe recebeu. A exportação para Excel precisa da MESMA conta sobre o
 * histórico salvo, então ela é repetida aqui, com as mesmas regras:
 *
 *  - o mês e o ano saem da coluna `data` (competência), não de `data_pagamento`;
 *  - uma linha por UF (COREN), uma coluna por mês, soma de `total`;
 *  - some a regional sem nenhum mês diferente de zero (estorno aparece);
 *  - ordem pelo total do ano, maior primeiro.
 *
 * Diferença deliberada: a tela mostra um ano por vez (seletor); o arquivo traz
 * todos os anos, do mais recente para o mais antigo.
 *
 * Valores em centavos inteiros, como na RPC. Quem formata é quem escreve.
 */
import type { ResumoSalvo } from './modelo';

export const MESES_ABREVIADOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

export interface RegionalAcumulada {
  uf: string;
  /** 12 posições, janeiro a dezembro, em centavos. */
  meses: number[];
  total: number;
}

export interface AnoAcumulado {
  ano: number;
  regionais: RegionalAcumulada[];
  totaisMes: number[];
  total: number;
}

export function montarAcumuladoMensal(grupos: ResumoSalvo['grupos']): AnoAcumulado[] {
  const anos = new Map<number, Map<string, RegionalAcumulada>>();
  for (const g of grupos) {
    const ano = Number(g.data.slice(0, 4));
    const mes = Number(g.data.slice(5, 7)) - 1;
    if (!Number.isInteger(ano) || mes < 0 || mes > 11) continue;
    let regionais = anos.get(ano);
    if (!regionais) { regionais = new Map(); anos.set(ano, regionais); }
    let r = regionais.get(g.uf);
    if (!r) { r = { uf: g.uf, meses: new Array(12).fill(0), total: 0 }; regionais.set(g.uf, r); }
    r.meses[mes] += g.total;
    r.total += g.total;
  }

  return [...anos.entries()]
    .sort(([a], [b]) => b - a)
    .map(([ano, mapa]) => {
      const regionais = [...mapa.values()]
        .filter(r => r.meses.some(v => v !== 0))
        .sort((a, b) => b.total - a.total || a.uf.localeCompare(b.uf));
      const totaisMes = MESES_ABREVIADOS.map((_, i) => regionais.reduce((s, r) => s + r.meses[i], 0));
      return { ano, regionais, totaisMes, total: totaisMes.reduce((s, v) => s + v, 0) };
    })
    .filter(a => a.regionais.length > 0);
}
