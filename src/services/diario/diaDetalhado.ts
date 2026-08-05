/**
 * diaDetalhado.ts — matriz "operador × dia do mês" do recebimento diário.
 * ─────────────────────────────────────────────────────────────────────────────
 * Alimenta a sub-aba "Dia detalhado" (as DUAS empresas). Uma linha por
 * operador, uma coluna por dia, e o que cada um recebeu em cada dia.
 *
 * Lógica pura, sem React e sem Supabase: a fonte é `buscarResumoMensalDiario`,
 * que já agrega no banco (uma linha por operador/dia) — este módulo só cruza,
 * escopa e soma.
 *
 * DUAS REGRAS HERDADAS, de propósito, para a aba não contar diferente do resto:
 *
 * 1. Escopo por setor — a mesma peneira de `escopoDiario` usada pelas outras
 *    sub-abas. Sem isto, a aba nova reabriria o vazamento corrigido em
 *    04/08/2026 (o líder do Play 4 lendo o recebimento do Receptivo).
 *
 * 2. Só o que conta PARA O OPERADOR — `linhasDia` já chega com `operador_id`
 *    nulo no que é "fora do vínculo", órfão ou "(sem vínculo)". Essas linhas
 *    contam no geral da empresa, nunca numa pessoa, então ficam de fora da
 *    matriz. O rodapé informa esse valor à parte, para o total da aba bater
 *    com o total do mês em vez de parecer que sumiu dinheiro.
 */
import type { LinhaRecebidaDia, ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import { linhasVisiveis, type EscopoDiario, type VinculosDiario } from './escopoDiario';

export interface LinhaDiaDetalhado {
  operadorId: string;
  nome:       string;
  /** Um valor por dia, na mesma ordem de `dias`. 0 = nada recebido. */
  valores:    number[];
  /** Soma da linha — o mês do operador. */
  total:      number;
}

export interface DiaDetalhado {
  /** Colunas, em 'yyyy-MM-dd'. */
  dias:         string[];
  linhas:       LinhaDiaDetalhado[];
  /** Soma de cada coluna, na ordem de `dias`. */
  totaisPorDia: number[];
  /** Soma de tudo que está na matriz. */
  totalGeral:   number;
  /** Fora do vínculo / órfão / sem vínculo: conta no geral, não em ninguém. */
  totalForaDaMatriz: number;
}

/** Último dia do mês 'yyyy-MM'. */
export function ultimoDiaDoMes(mes: string): number {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(ano, m, 0).getDate();
}

/**
 * Colunas do mês.
 *
 * No mês CORRENTE para no dia de hoje: dia futuro é sempre zero e só empurraria
 * a rolagem horizontal para a direita sem informação nenhuma. Em mês passado
 * vai até o fim. Dia sem importação aparece zerado de propósito — "ninguém
 * recebeu" e "ninguém importou" são coisas diferentes, e esconder a coluna
 * faria o mês parecer mais curto do que foi.
 */
export function diasDoMes(mes: string, hojeISO: string): string[] {
  const ultimo   = ultimoDiaDoMes(mes);
  const mesDeHoje = hojeISO.slice(0, 7);
  const limite = mes === mesDeHoje
    ? Math.min(ultimo, Number(hojeISO.slice(8, 10)))
    : (mes > mesDeHoje ? 0 : ultimo);   // mês futuro não tem coluna nenhuma

  const dias: string[] = [];
  for (let d = 1; d <= limite; d++) {
    dias.push(`${mes}-${String(d).padStart(2, '0')}`);
  }
  return dias;
}

/** operador_id → nome de exibição, a partir dos resumos do mês. */
function mapaDeNomes(resumos: readonly ResumoOperadorAnalitico[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of resumos) {
    m.set(r.operador_id, (r.operador_nome || r.operador_usuario || '').trim() || 'Sem nome');
  }
  return m;
}

/**
 * Monta a matriz do mês.
 *
 * `escopo`/`vinculos` nulos devolvem a matriz VAZIA, nunca a empresa inteira:
 * enquanto o escopo não resolve, mostrar tudo é o mesmo vazamento, só que
 * curto. Mesma decisão de `DiarioLider`.
 */
export function montarDiaDetalhado(params: {
  linhasDia: readonly LinhaRecebidaDia[];
  resumos:   readonly ResumoOperadorAnalitico[];
  mes:       string;      // 'yyyy-MM'
  hojeISO:   string;      // 'yyyy-MM-dd'
  escopo:    EscopoDiario | null;
  vinculos:  VinculosDiario | null;
}): DiaDetalhado {
  const { linhasDia, resumos, mes, hojeISO, escopo, vinculos } = params;
  const dias = diasDoMes(mes, hojeISO);
  const vazio: DiaDetalhado = {
    dias, linhas: [], totaisPorDia: dias.map(() => 0), totalGeral: 0, totalForaDaMatriz: 0,
  };
  if (!escopo || !vinculos) return vazio;

  const indiceDoDia = new Map(dias.map((d, i) => [d, i]));

  // O que não pertence a um operador é somado à parte, ANTES da peneira de
  // setor: são valores do geral da empresa e não têm dono para escopar.
  let totalForaDaMatriz = 0;
  const comOperador: LinhaRecebidaDia[] = [];
  for (const l of linhasDia) {
    if (!indiceDoDia.has(l.data_pagamento)) continue;   // dia fora das colunas
    if (l.operador_id) comOperador.push(l);
    else totalForaDaMatriz += Number(l.valor_recebido) || 0;
  }

  const visiveis = linhasVisiveis(comOperador, escopo, vinculos);

  const nomes = mapaDeNomes(resumos);
  const porOperador = new Map<string, LinhaDiaDetalhado>();

  for (const l of visiveis) {
    const id = l.operador_id!;
    const linha = porOperador.get(id) ?? {
      operadorId: id,
      nome:       nomes.get(id) ?? 'Sem nome',
      valores:    dias.map(() => 0),
      total:      0,
    };
    const i = indiceDoDia.get(l.data_pagamento)!;
    const v = Number(l.valor_recebido) || 0;
    linha.valores[i] += v;
    linha.total      += v;
    porOperador.set(id, linha);
  }

  // Maior mês primeiro, como o resto do diário e do analítico. Empate pelo
  // nome, para a ordem não dançar entre renders quando dois zeram.
  const linhas = [...porOperador.values()].sort(
    (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  const totaisPorDia = dias.map((_, i) => linhas.reduce((s, l) => s + l.valores[i], 0));
  const totalGeral   = linhas.reduce((s, l) => s + l.total, 0);

  return { dias, linhas, totaisPorDia, totalGeral, totalForaDaMatriz };
}
