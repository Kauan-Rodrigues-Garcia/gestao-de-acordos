// src/pages/Analitico/linhaOperador.ts
/**
 * O contrato que a lista de operadores lê — e que as DUAS fontes preenchem.
 *
 * O Analítico e o Recebimento diário respondiam à mesma pergunta ("quanto cada
 * operador recebeu?") com duas telas escritas separado. Elas divergiram: a do
 * diário ganhou subtotal por forma, a do analítico ganhou ajuste manual, e
 * nenhuma das duas ganhou o que a outra tinha.
 *
 * Aqui as duas viram o mesmo formato, e a tela deixa de saber de onde o número
 * veio. O que a fonte não sabe dizer vem explícito: `ho: null` no diário, que
 * não tem a coluna, é diferente de `ho: 0`, que seria "não houve HO".
 */
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import type {
  ResumoOperadorAnalitico, OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import type { ResumoOperadorDiario } from '@/pages/Analitico/Diario/helpers';
import { rotuloDaForma } from '@/lib/formasPagamento';

export interface FatiaFormaOperador {
  /** Rótulo do ERP — é a chave de `corDaForma` e `iconeDaForma`. */
  rotulo: string;
  valor: number;
}

export interface LinhaOperadorPainel {
  operador_id: string;
  usuario:     string;
  nome:        string | null;
  equipeId:    string | null;
  equipeNome:  string;
  valor:       number;
  /** `null` quando a fonte não tem a coluna (o diário). Não é o mesmo que 0. */
  ho:          number | null;
  pagamentos:  number;
  /** Acordos vindos na última importação do dia. Sempre 0 fora do recorte Dia. */
  novos:       number;
  porForma:    FatiaFormaOperador[];
  /** Quanto do valor veio de lançamento à mão. Pode ser negativo. */
  ajusteManual?: number;
}

/** Como a equipe de um operador é resolvida. Injetado para o módulo ficar puro. */
export type EquipeDeOperador = (id: string) => OperadorEquipeInfo | undefined;

/**
 * A fatia do operador dentro do grupo, para a barra da linha.
 *
 * Presa entre 0 e 1: ajuste manual pode deixar um operador negativo, e uma
 * barra negativa desenharia para fora da linha.
 */
export function fatiaDoGrupo(valor: number, totalDoGrupo: number): number {
  if (!totalDoGrupo || totalDoGrupo <= 0) return 0;
  return Math.min(1, Math.max(0, valor / totalDoGrupo));
}

function ordenarFatias(m: Map<string, number>): FatiaFormaOperador[] {
  return [...m.entries()]
    .filter(([, valor]) => valor !== 0)
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function equipeOu(info: OperadorEquipeInfo | undefined) {
  return {
    equipeId:   info?.equipe_id ?? null,
    equipeNome: info?.equipe_nome ?? 'Sem equipe',
  };
}

/**
 * Recorte de mês e de período: o resumo vem da RPC
 * `fn_analitico_resumo_por_operador`, e a quebra por forma das linhas de
 * `fn_analitico_dashboard_mes` — a mesma fonte da aba Formas de pagamento.
 *
 * As linhas chegam JÁ filtradas pelo escopo e pela janela por quem chama; este
 * módulo não decide quem enxerga o quê.
 */
export function deResumoAnalitico(
  resumos: readonly ResumoOperadorAnalitico[],
  linhas: readonly AnaliticoDashboardLinha[],
  equipeDe: EquipeDeOperador,
): LinhaOperadorPainel[] {
  const formasPorOperador = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!l.operador_id) continue;
    const rotulo = rotuloDaForma(l.forma_pagamento, l.forma_detalhe);
    let m = formasPorOperador.get(l.operador_id);
    if (!m) { m = new Map(); formasPorOperador.set(l.operador_id, m); }
    m.set(rotulo, (m.get(rotulo) ?? 0) + (Number(l.total) || 0));
  }

  // O callback é anotado, não só a função: sem `strictNullChecks`, a anotação
  // de retorno daqui não alcança o literal lá dentro. Ver Global Constraints.
  return resumos.map((r): LinhaOperadorPainel => ({
    operador_id: r.operador_id,
    usuario:     r.operador_usuario,
    nome:        r.operador_nome,
    ...equipeOu(equipeDe(r.operador_id)),
    valor:       r.total_recebido,
    ho:          r.total_ho,
    pagamentos:  r.total_pagamentos,
    novos:       0,
    porForma:    ordenarFatias(formasPorOperador.get(r.operador_id) ?? new Map()),
    ajusteManual: r.ajuste_manual,
  }));
}

/**
 * Recorte de dia: `agregarPorOperador` (Diario/helpers) já entregou tudo — os
 * três subtotais de forma e a contagem de novos. Aqui é só renomear.
 */
export function deResumoDiario(
  resumos: readonly ResumoOperadorDiario[],
  equipeDe: EquipeDeOperador,
): LinhaOperadorPainel[] {
  return resumos.map((r): LinhaOperadorPainel => {
    const m = new Map<string, number>([
      ['Pix',    r.pix],
      ['Boleto', r.boleto],
      ['Cartão', r.cartao],
    ]);
    return {
      operador_id: r.operadorId,
      usuario:     r.usuario,
      nome:        r.nome,
      ...equipeOu(equipeDe(r.operadorId)),
      valor:       r.total,
      ho:          null,
      pagamentos:  r.nPagamentos,
      novos:       r.novos,
      porForma:    ordenarFatias(m),
    };
  });
}
