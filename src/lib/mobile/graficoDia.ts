/**
 * O gráfico de recebimento da equipe no celular — a conta.
 *
 * Mesma regra do `GraficoRecebimento` do Painel do Líder (spec da liderança
 * §2.3): valor BRUTO de cada dia corrido do mês, dia sem recebimento é buraco
 * (`null`, não zero — fim de semana não é queda de venda), média = total ÷ dias
 * COM recebimento, e a linha só entra se passar pelo mesmo `linhaNoEscopo` do
 * card Total recebido (no celular, o escopo é a equipe).
 *
 * O desenho (SVG) fica na tela; aqui só números.
 */
import {
  linhaNoEscopo, type EscopoAnalitico,
} from '@/services/analitico/escopoAnalitico';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';

export interface DiaDoGrafico {
  /** 1..31 */
  dia: number;
  /** `null` = dia sem recebimento. */
  valor: number | null;
  /** Dia depois de hoje (ainda não aconteceu). */
  futuro: boolean;
  /** É hoje — parcial até fechar. */
  hoje: boolean;
}

export interface GraficoDoMes {
  dias: DiaDoGrafico[];
  total: number;
  media: number;
  diasComRecebimento: number;
  /** Maior dia do mês; `null` quando não houve recebimento. */
  melhor: { dia: number; valor: number } | null;
}

export function montarGraficoDoMes(entrada: {
  linhas: ReadonlyArray<LinhaRecebidaDia>;
  /** 'yyyy-MM' */
  mes: string;
  escopo: EscopoAnalitico;
  hojeISO: string;
}): GraficoDoMes {
  const { linhas, mes, escopo, hojeISO } = entrada;
  const [ano, mesN] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesN, 0).getDate();
  const porDia = new Array<number>(diasNoMes).fill(0);

  for (const l of linhas) {
    if (!linhaNoEscopo({
      operador_id: l.operador_id,
      setor_id: l.setor_id,
      contribuicao: l.contribuicao,
      contribuicao_de_setor_id: l.contribuicao_de_setor_id,
    }, escopo)) continue;
    const dia = Number(l.data_pagamento.slice(8, 10));
    if (l.data_pagamento.slice(0, 7) !== mes) continue;
    if (dia >= 1 && dia <= diasNoMes) porDia[dia - 1] += Number(l.valor_recebido) || 0;
  }

  const hojeNoMes = hojeISO.slice(0, 7) === mes ? Number(hojeISO.slice(8, 10)) : null;
  const mesPassado = hojeISO.slice(0, 7) > mes;

  const dias: DiaDoGrafico[] = porDia.map((v, i) => ({
    dia: i + 1,
    valor: v > 0 ? v : null,
    futuro: mesPassado ? false : hojeNoMes === null ? true : i + 1 > hojeNoMes,
    hoje: hojeNoMes === i + 1,
  }));

  const comValor = dias.filter(d => d.valor !== null) as (DiaDoGrafico & { valor: number })[];
  const total = comValor.reduce((s, d) => s + d.valor, 0);
  const melhor = comValor.reduce<{ dia: number; valor: number } | null>(
    (m, d) => (!m || d.valor > m.valor ? { dia: d.dia, valor: d.valor } : m), null,
  );

  return {
    dias,
    total,
    media: comValor.length ? total / comValor.length : 0,
    diasComRecebimento: comValor.length,
    melhor,
  };
}
