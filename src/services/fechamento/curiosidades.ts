/**
 * curiosidades.ts — as leituras que ninguém pede e todo mundo comenta.
 *
 * "O dia 14 sozinho fez 7% do mês." "Cinco dias úteis seguidos acima da meta
 * diária." São o que dá vida a uma apresentação de números — e todas saem dos
 * dados JÁ coletados. Nenhuma consulta nova.
 *
 * ## Regra que não se dobra
 *
 * Curiosidade sem base é OMITIDA, nunca estimada. Sem meta não existe "dias
 * acima da meta diária"; sem mês anterior não existe "quem mais subiu". Um
 * relatório apresentado à diretoria não pode carregar um número que parece
 * medido e foi inferido.
 *
 * Puro de propósito: entra `DadosFechamento` montado, sai lista. Testável sem
 * banco e sem DOM.
 */

import { brl, num, pct, compacto } from './formato';
import type {
  Curiosidade, PontoDia, FatiaForma, LinhaOperadorFechamento, ComparativoMes,
} from './tipos';

export interface EntradaCuriosidades {
  porDia: readonly PontoDia[];
  porForma: readonly FatiaForma[];
  totalBruto: number;
  /** Meta por dia útil. `null` sem meta — corta a curiosidade de sequência. */
  metaDiaria: number | null;
  operadores: readonly LinhaOperadorFechamento[];
  comparativo: ComparativoMes | null;
  /** Formas do mês anterior, para a curiosidade de crescimento. */
  porFormaAnterior?: readonly FatiaForma[];
}

/** O dia que sozinho pesou mais no mês. */
function diaDePico(e: EntradaCuriosidades): Curiosidade | null {
  const melhor = [...e.porDia].sort((a, b) => b.bruto - a.bruto)[0];
  if (!melhor || melhor.bruto <= 0 || e.totalBruto <= 0) return null;

  const fatia = Math.round((melhor.bruto / e.totalBruto) * 1000) / 10;
  // Abaixo de 5% não é pico, é um dia comum — e chamar de curiosidade gastaria
  // um cartão para não dizer nada.
  if (fatia < 5) return null;

  return {
    titulo: 'Dia de pico',
    destaque: `Dia ${melhor.dia}`,
    texto: `${brl(melhor.bruto)} em ${num(melhor.qtd)} pagamento(s) — `
      + `${pct(fatia)} de tudo que entrou no mês.`,
  };
}

/** A maior sequência de dias com movimento acima da meta diária. */
function sequenciaAcimaDaMeta(e: EntradaCuriosidades): Curiosidade | null {
  if (!e.metaDiaria || e.metaDiaria <= 0) return null;

  let melhor = 0, atual = 0, fimDaMelhor = 0;
  for (const d of e.porDia) {
    // Dia zerado NÃO quebra a sequência: fim de semana e feriado não são
    // fracasso de ritmo. Só um dia com movimento abaixo da meta quebra.
    if (d.bruto <= 0) continue;
    if (d.bruto >= e.metaDiaria) {
      atual += 1;
      if (atual > melhor) { melhor = atual; fimDaMelhor = d.dia; }
    } else {
      atual = 0;
    }
  }

  if (melhor < 3) return null;

  return {
    titulo: 'Melhor sequência',
    destaque: `${melhor} dias seguidos`,
    texto: `Sequência de ${melhor} dias com movimento acima da meta diária de `
      + `${brl(e.metaDiaria)}, encerrada no dia ${fimDaMelhor}.`,
  };
}

/** Quem mais subiu de posição contra o mês anterior. */
function maiorSubida(e: EntradaCuriosidades): Curiosidade | null {
  const anterior = e.comparativo?.posicaoAnteriorPorOperador;
  if (!anterior || !Object.keys(anterior).length || e.operadores.length < 3) return null;

  let melhor: { nome: string; de: number; para: number } | null = null;
  e.operadores.forEach((o, i) => {
    const posAnterior = anterior[o.id];
    if (!posAnterior) return;
    const posAtual = i + 1;
    const ganho = posAnterior - posAtual;
    if (ganho <= 0) return;
    if (!melhor || ganho > melhor.de - melhor.para) {
      melhor = { nome: o.nome, de: posAnterior, para: posAtual };
    }
  });

  if (!melhor) return null;
  const m = melhor as { nome: string; de: number; para: number };

  return {
    titulo: 'Maior subida',
    destaque: m.nome,
    texto: `Saiu de ${m.de}º para ${m.para}º lugar em relação a `
      + `${e.comparativo?.mesAnteriorRotulo ?? 'ao mês anterior'}.`,
  };
}

/** A forma de pagamento que mais cresceu contra o mês anterior. */
function formaQueMaisCresceu(e: EntradaCuriosidades): Curiosidade | null {
  if (!e.porFormaAnterior?.length || !e.porForma.length) return null;

  const anterior = new Map(e.porFormaAnterior.map(f => [f.rotulo, f.bruto]));
  let melhor: { rotulo: string; ganho: number; pctGanho: number } | null = null;

  for (const f of e.porForma) {
    const antes = anterior.get(f.rotulo);
    // Forma que não existia antes fica de fora: crescer "do zero" é sempre
    // infinito e nunca é a informação interessante.
    if (!antes || antes <= 0) continue;
    const ganho = f.bruto - antes;
    if (ganho <= 0) continue;
    const pctGanho = Math.round((ganho / antes) * 1000) / 10;
    if (!melhor || ganho > melhor.ganho) melhor = { rotulo: f.rotulo, ganho, pctGanho };
  }

  if (!melhor) return null;
  const m = melhor as { rotulo: string; ganho: number; pctGanho: number };

  return {
    titulo: 'Forma que mais cresceu',
    destaque: m.rotulo,
    texto: `${brl(m.ganho)} a mais que em ${e.comparativo?.mesAnteriorRotulo ?? 'no mês anterior'} `
      + `(${pct(m.pctGanho)} de crescimento).`,
  };
}

/** Quantos bateram a meta, e o que isso representa no time. */
function quantosBateramMeta(e: EntradaCuriosidades): Curiosidade | null {
  const comMeta = e.operadores.filter(o => o.meta !== null && o.meta > 0);
  if (comMeta.length < 2) return null;

  const bateram = comMeta.filter(o => o.bruto >= (o.meta as number));
  const fatia = Math.round((bateram.length / comMeta.length) * 1000) / 10;

  return {
    titulo: 'Metas individuais',
    destaque: `${bateram.length} de ${comMeta.length}`,
    texto: bateram.length
      ? `${pct(fatia)} do time com meta bateu o alvo do mês. `
        + `Destaque para ${bateram[0].nome}, com ${compacto(bateram[0].bruto)}.`
      : 'Ninguém alcançou a meta individual neste mês.',
  };
}

/** A concentração: quanto os três primeiros representam do total. */
function concentracaoDoTopo(e: EntradaCuriosidades): Curiosidade | null {
  if (e.operadores.length < 5 || e.totalBruto <= 0) return null;

  const topo3 = e.operadores.slice(0, 3).reduce((s, o) => s + o.bruto, 0);
  const fatia = Math.round((topo3 / e.totalBruto) * 1000) / 10;

  return {
    titulo: 'Concentração',
    destaque: pct(fatia),
    texto: `Os três primeiros colocados responderam por ${pct(fatia)} de tudo `
      + `que o escopo recebeu no mês (${brl(topo3)} de ${brl(e.totalBruto)}).`,
  };
}

/**
 * As curiosidades que têm base, na ordem em que fazem sentido ler.
 *
 * Cada função devolve `null` quando falta dado, e o filtro faz o resto — é
 * assim que "omitida, nunca estimada" fica sendo a regra e não a exceção.
 */
export function montarCuriosidades(e: EntradaCuriosidades): Curiosidade[] {
  return [
    diaDePico(e),
    sequenciaAcimaDaMeta(e),
    quantosBateramMeta(e),
    maiorSubida(e),
    formaQueMaisCresceu(e),
    concentracaoDoTopo(e),
  ].filter((c): c is Curiosidade => c !== null);
}
