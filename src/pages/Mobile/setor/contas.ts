/**
 * As contas da tela do setor, sem React (06/10/2026).
 */
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import { linhaNoEscopo, type EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import type { EquipeNaTela } from '../equipe/montarEquipe';

/** O recebido de hoje de um conjunto. `escopo` nulo = todas as linhas contam. */
export function hojeDoConjunto(
  linhas: readonly LinhaRecebidaDia[] | undefined, hojeISO: string, escopo: EscopoAnalitico | null,
): { total: number; qtd: number } {
  let total = 0; let qtd = 0;
  for (const l of linhas ?? []) {
    if (l.data_pagamento !== hojeISO) continue;
    if (escopo && !linhaNoEscopo({ operador_id: l.operador_id, setor_id: l.setor_id, contribuicao: l.contribuicao,
      contribuicao_de_setor_id: l.contribuicao_de_setor_id }, escopo)) continue;
    total += Number(l.valor_recebido) || 0; qtd++;
  }
  return { total, qtd };
}

export interface FaixaDoSetor { quartil: number; qtd: number; pct: number }

/**
 * As pessoas do setor por quartil: quantas em cada faixa e o % delas. Quem está
 * em duas equipes do setor conta uma vez; quem não tem meta (sem quartil) fica
 * fora da base, como na aba Quartis do Painel.
 */
export function quartisDoSetor(equipes: readonly EquipeNaTela[]): { total: number; faixas: FaixaDoSetor[] } {
  const vistas = new Map<string, LinhaQuartil>();
  for (const e of equipes) for (const l of e.linhas) if (l.quartil && !vistas.has(l.op.id)) vistas.set(l.op.id, l);
  const total = vistas.size;
  const faixas = [1, 2, 3, 4].map(q => {
    const qtd = [...vistas.values()].filter(l => l.quartil?.quartil === q).length;
    return { quartil: q, qtd, pct: total ? (qtd / total) * 100 : 0 };
  });
  return { total, faixas };
}
