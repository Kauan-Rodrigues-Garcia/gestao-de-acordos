// src/pages/Analitico/Extrato/extrato.ts
/**
 * As contas do extrato de recebimentos — sem React, para testar sem montar tela.
 *
 * O extrato é a lista de recebimentos do analítico desenhada como um extrato
 * de banco: um bloco por dia de pagamento, o total do dia no cabeçalho, a
 * linha mais recente em cima. É o formato que o operador já conhece do próprio
 * banco, e responde de cara a pergunta que a tabela corrida não respondia:
 * "em que dia esse dinheiro entrou?".
 *
 * ## Direto × Extra
 *
 * A coluna "Tipo comissão" do relatório diz, linha a linha, se o recebimento é
 * do próprio operador (`Integral`, aqui «Direto») ou de NR vinculado a outro
 * (`Extra`). Setor como o Receptivo vive disso: metade do que entra é de cliente
 * de outra pessoa, e a tabela antiga não deixava ver qual era qual.
 *
 * A regra de leitura é a mesma do painel (`classificarComissao`): linha sem a
 * coluna preenchida fica «sem informação», nunca vira Direto por omissão.
 */
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { classificarComissao } from '@/services/analitico/analiticoComum';

export type VinculoDaLinha = 'direto' | 'extra' | null;

export type FiltroStatus = 'todos' | 'a_tabular' | 'tabulados';
export type FiltroVinculo = 'todos' | 'direto' | 'extra';

export function vinculoDaLinha(l: Pick<AnaliticoRecebimento, 'tipo_comissao'>): VinculoDaLinha {
  return classificarComissao(l.tipo_comissao);
}

/** Tabulado é o único estado resolvido; divergente ainda pede ação. */
export function precisaTabular(l: Pick<AnaliticoRecebimento, 'status_tabulacao'>): boolean {
  return l.status_tabulacao !== 'tabulado';
}

export interface ResumoVinculo {
  direto: number;
  extra: number;
  qtdDireto: number;
  qtdExtra: number;
  /** Linhas cujo relatório não trouxe o tipo de comissão. */
  qtdSemInfo: number;
}

export function resumirVinculos(linhas: readonly AnaliticoRecebimento[]): ResumoVinculo {
  const r: ResumoVinculo = { direto: 0, extra: 0, qtdDireto: 0, qtdExtra: 0, qtdSemInfo: 0 };
  for (const l of linhas) {
    const v = vinculoDaLinha(l);
    if (v === 'extra') { r.extra += l.valor_recebido; r.qtdExtra += 1; }
    else if (v === 'direto') { r.direto += l.valor_recebido; r.qtdDireto += 1; }
    else r.qtdSemInfo += 1;
  }
  return r;
}

/**
 * Vale mostrar a divisão Direto × Extra?
 *
 * Só quando existe ao menos um Extra. Num setor que só cobra a própria carteira,
 * pintar «Direto» em toda linha é ruído — e a ausência do selo já diz isso.
 */
export function temExtra(linhas: readonly AnaliticoRecebimento[]): boolean {
  return linhas.some(l => vinculoDaLinha(l) === 'extra');
}

export function filtrarExtrato(
  linhas: readonly AnaliticoRecebimento[],
  status: FiltroStatus,
  vinculo: FiltroVinculo,
): AnaliticoRecebimento[] {
  return linhas.filter(l => {
    if (status === 'a_tabular' && !precisaTabular(l)) return false;
    if (status === 'tabulados' && precisaTabular(l)) return false;
    if (vinculo !== 'todos' && vinculoDaLinha(l) !== vinculo) return false;
    return true;
  });
}

export interface DiaDoExtrato {
  /** 'yyyy-MM-dd' */
  dia: string;
  total: number;
  totalHO: number;
  linhas: AnaliticoRecebimento[];
}

/**
 * Um bloco por dia de pagamento, do mais recente para o mais antigo.
 *
 * Dentro do dia, o maior valor primeiro: é o que o olho procura num extrato
 * de cobrança, e a ordem de importação não quer dizer nada para quem lê.
 */
export function agruparPorDia(linhas: readonly AnaliticoRecebimento[]): DiaDoExtrato[] {
  const porDia = new Map<string, DiaDoExtrato>();
  for (const l of linhas) {
    const dia = l.data_pagamento;
    let d = porDia.get(dia);
    if (!d) { d = { dia, total: 0, totalHO: 0, linhas: [] }; porDia.set(dia, d); }
    d.total += l.valor_recebido;
    d.totalHO += l.total_ho ?? 0;
    d.linhas.push(l);
  }
  const dias = [...porDia.values()].sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  for (const d of dias) d.linhas.sort((a, b) => b.valor_recebido - a.valor_recebido);
  return dias;
}

/**
 * A fita do mês: quanto entrou em cada dia, do dia 1 ao último.
 *
 * Dia sem recebimento vira 0 — a fita precisa dos buracos para mostrar o ritmo.
 */
export function totaisPorDiaDoMes(
  linhas: readonly Pick<AnaliticoRecebimento, 'data_pagamento' | 'valor_recebido'>[],
  mes: string,
): { dia: string; total: number }[] {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  const soma = new Map<string, number>();
  for (const l of linhas) soma.set(l.data_pagamento, (soma.get(l.data_pagamento) ?? 0) + l.valor_recebido);
  return Array.from({ length: ultimo }, (_, i) => {
    const dia = `${mes}-${String(i + 1).padStart(2, '0')}`;
    return { dia, total: soma.get(dia) ?? 0 };
  });
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "qua · 15 out" — o cabeçalho do bloco do dia. */
export function rotuloDoDia(dia: string, hoje: string): { principal: string; semana: string } {
  const d = new Date(dia + 'T12:00:00');
  const semana = DIAS_SEMANA[d.getDay()];
  const ontem = new Date(hoje + 'T12:00:00');
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = ontem.toISOString().slice(0, 10);
  const principal = dia === hoje
    ? 'Hoje'
    : dia === ontemISO
      ? 'Ontem'
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return { principal, semana };
}

/**
 * Os NRs para o botão «Copiar NRs» (19/10/2026): um por linha, na ordem da
 * tela, sem repetir (o mesmo NR pode vir em mais de uma linha) e sem vazio.
 * Quem chama passa o que está na tela — com os filtros aplicados, ou tudo.
 */
export function nrsParaCopiar(linhas: readonly Pick<AnaliticoRecebimento, 'codigo'>[]): string[] {
  const vistos = new Set<string>();
  const nrs: string[] = [];
  for (const l of linhas) {
    const nr = String(l.codigo ?? '').trim();
    if (!nr || vistos.has(nr)) continue;
    vistos.add(nr);
    nrs.push(nr);
  }
  return nrs;
}
