/**
 * rhComissao.ts — a comissão por meta dentro do RH Gestão.
 *
 * Os setores do tipo Comissão lançam na folha a comissão do mês de APURAÇÃO. O
 * cálculo é o mesmo da tela de Metas e do painel do operador
 * (`calcularComissao`); aqui ficam só as duas decisões do RH:
 *
 *   • o que a linha mostra embaixo do valor (`sugestaoDaComissao`);
 *   • o que «Preencher com a comissão» escreve (`planoDePreenchimento`).
 *
 * O botão sugere e escreve; quem conclui a equipe continua sendo a liderança.
 *
 * Sem React, sem fetch.
 */
import { formatBRL } from '@/lib/money';
import type { ResultadoComissao } from '@/services/comissao/comissao';
import { editavel, type StatusLancamento } from './rhEstados';

export interface SugestaoComissao {
  /** O que o botão escreve. `null` = nada a escrever. */
  valor: number | null;
  /** A linha curta embaixo do valor. */
  rotulo: string;
}

export function sugestaoDaComissao(r: ResultadoComissao): SugestaoComissao {
  if (r.motivo === 'sem_meta') return { valor: null, rotulo: 'Sem meta no mês de apuração' };
  if (r.motivo === 'sem_config') return { valor: null, rotulo: 'Comissão não configurada no mês' };
  // Sem faixa, nada — e não zero. Zero na folha é um pagamento de zero, e quem
  // não atingiu é decisão do líder, que tem «fora da folha».
  if (!r.atual) return { valor: null, rotulo: 'Nenhuma faixa atingida' };

  const partes = [`Comissão ${formatBRL(r.total)}`, `${r.atual.ordem}ª Meta`];
  if (r.beneficioAtivo) partes.push('benefício do setor');
  return { valor: r.total, rotulo: partes.join(' · ') };
}

/** O mínimo de um lançamento que o plano lê. */
export interface LinhaRh {
  id: string;
  operador_id: string;
  status: string;
  dispensado: boolean | null;
  /** `numeric`: chega como número ou como texto. */
  valor: number | string | null;
  tipo_remuneracao_snapshot: string | null;
}

export interface PlanoPreenchimento {
  preencher: { id: string; valor: number }[];
  /** Quantas das linhas a preencher já tinham um valor diferente. */
  substituem: number;
}

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * As linhas que «Preencher com a comissão» escreve.
 *
 * Só linha de comissão, ainda nas mãos de quem preenche (a mesma régua do lápis
 * da tabela), fora da folha não, com comissão maior que zero e diferente do que
 * já está lá. Valor diferente entra — quem chama avisa antes de substituir.
 */
export function planoDePreenchimento(
  linhas: readonly LinhaRh[],
  sugestoes: Readonly<Record<string, SugestaoComissao>>,
): PlanoPreenchimento {
  const preencher: PlanoPreenchimento['preencher'] = [];
  let substituem = 0;

  for (const l of linhas) {
    if (l.tipo_remuneracao_snapshot !== 'comissao') continue;
    if (l.dispensado || !editavel(l.status as StatusLancamento)) continue;

    const sugerido = sugestoes[l.operador_id]?.valor ?? null;
    if (sugerido === null || sugerido <= 0) continue;

    const temValor = l.valor !== null && l.valor !== '';
    if (temValor && centavos(Number(l.valor)) === centavos(sugerido)) continue;

    preencher.push({ id: l.id, valor: sugerido });
    if (temValor) substituem++;
  }

  return { preencher, substituem };
}
