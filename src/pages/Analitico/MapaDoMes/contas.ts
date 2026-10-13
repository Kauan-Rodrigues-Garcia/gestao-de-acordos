/**
 * contas.ts — as contas do Mapa do mês, sem React.
 *
 * O mapa responde «QUANDO o dinheiro entrou e QUEM trouxe», no formato de um
 * calendário de verdade (semanas de segunda a domingo), e não mais numa grade
 * operador × dia paginada de dez em dez.
 *
 * Tudo aqui é puro: recebe as células já escopadas por quem chama e devolve o
 * que a tela desenha. Quem enxerga o quê continua sendo decisão do chamador
 * (`fonteDoMapa.ts` e o escopo do `AnaliticoLider`).
 */

/** Uma célula de recebimento: um operador, um dia, um valor. */
export interface CelulaDoMapa {
  /** 'yyyy-MM-dd' */
  dia: string;
  operador_id: string | null;
  total: number;
}

export interface OperadorDoMapa {
  operadorId: string;
  nome: string;
  fotoUrl: string | null;
  equipe: string | null;
  /** Soma do mês. */
  total: number;
  /** dia ('yyyy-MM-dd') → valor. Só dias com valor ≠ 0. */
  porDia: Map<string, number>;
  /** Posição no mês, a partir de 1. */
  posicao: number;
}

export interface DiaDoCalendario {
  /** 'yyyy-MM-dd' */
  iso: string;
  numero: number;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  /** Depois de hoje, no mês corrente: ainda não aconteceu. */
  futuro: boolean;
  ehHoje: boolean;
}

/** Uma semana do calendário, de segunda a domingo. `null` = fora do mês. */
export type Semana = (DiaDoCalendario | null)[];

/** 'yyyy-MM' + dia → 'yyyy-MM-dd'. */
function isoDoDia(mes: string, d: number): string {
  return `${mes}-${String(d).padStart(2, '0')}`;
}

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/**
 * As semanas do mês, começando na segunda — é como a operação pensa a semana.
 * Os buracos antes do dia 1º e depois do último ficam `null`.
 */
export function semanasDoMes(mes: string, hojeISO: string): Semana[] {
  const [a, m] = mes.split('-').map(Number);
  const total = diasNoMes(mes);
  const dias: DiaDoCalendario[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = isoDoDia(mes, d);
    dias.push({
      iso,
      numero: d,
      diaSemana: new Date(a, m - 1, d).getDay(),
      futuro: iso > hojeISO,
      ehHoje: iso === hojeISO,
    });
  }

  // Segunda = coluna 0 … domingo = coluna 6.
  const coluna = (diaSemana: number) => (diaSemana + 6) % 7;
  const semanas: Semana[] = [];
  let atual: Semana = Array.from({ length: coluna(dias[0].diaSemana) }, (): DiaDoCalendario | null => null);
  for (const dia of dias) {
    atual.push(dia);
    if (atual.length === 7) { semanas.push(atual); atual = []; }
  }
  if (atual.length > 0) {
    while (atual.length < 7) atual.push(null);
    semanas.push(atual);
  }
  return semanas;
}

/**
 * Uma baixa: um dia útil e os dias que caem nele.
 *
 * É a coluna D.U. da planilha da operação — a contagem de dias úteis já
 * corridos no mês. Sábado, domingo e feriado não abrem baixa nova: ficam com
 * o número do dia útil anterior (03 e 04/10/2026 são a baixa 2, como a sexta
 * 02/10; o feriado de 12/10 fica na baixa 7, da sexta 09/10).
 *
 * Os dias ANTES do primeiro dia útil (D.U. 0 na planilha — um mês que começa
 * no sábado) entram na baixa 1: não há baixa 0 para mostrar.
 */
export interface Baixa {
  numero: number;
  /** O dia útil que abre a baixa. */
  diaUtil: string;
  /** Todos os dias da baixa, o útil primeiro. */
  dias: string[];
  /** O dia útil ainda não chegou. */
  futuro: boolean;
  /** Hoje está dentro desta baixa. */
  atual: boolean;
}

/** As baixas do mês. `feriados` em 'yyyy-MM-dd'. */
export function baixasDoMes(mes: string, feriados: Iterable<string>, hojeISO: string): Baixa[] {
  const naoUtil = new Set(feriados);
  const [a, m] = mes.split('-').map(Number);
  const baixas: Baixa[] = [];
  const antesDoPrimeiro: string[] = [];

  for (let d = 1; d <= diasNoMes(mes); d++) {
    const iso = isoDoDia(mes, d);
    const semana = new Date(a, m - 1, d).getDay();
    const util = semana >= 1 && semana <= 5 && !naoUtil.has(iso);
    if (util) {
      baixas.push({
        numero: baixas.length + 1,
        diaUtil: iso,
        dias: baixas.length === 0 ? [iso, ...antesDoPrimeiro] : [iso],
        futuro: iso > hojeISO,
        atual: false,
      });
    } else if (baixas.length === 0) {
      antesDoPrimeiro.push(iso);
    } else {
      baixas[baixas.length - 1].dias.push(iso);
    }
  }
  for (const b of baixas) b.atual = b.dias.includes(hojeISO);
  return baixas;
}

export interface MapaMontado {
  /** Maior mês primeiro. */
  operadores: OperadorDoMapa[];
  /** dia → soma de todos os operadores da matriz. */
  totalPorDia: Map<string, number>;
  /** Soma dos operadores (sem o que não tem dono). */
  totalGeral: number;
  /** Recebimento sem operador: conta na empresa, não pertence a ninguém. */
  totalSemOperador: number;
}

export function montarMapa(p: {
  celulas: readonly CelulaDoMapa[];
  mes: string;
  nomeDoOperador: (id: string) => string;
  fotoDoOperador: (id: string) => string | null;
  equipeDoOperador: (id: string) => string | null;
}): MapaMontado {
  const prefixo = `${p.mes}-`;
  const porOperador = new Map<string, OperadorDoMapa>();
  const totalPorDia = new Map<string, number>();
  let totalSemOperador = 0;

  for (const c of p.celulas) {
    if (!c.dia?.startsWith(prefixo)) continue;
    const v = Number(c.total) || 0;
    if (v === 0) continue;
    if (!c.operador_id) { totalSemOperador += v; continue; }

    let op = porOperador.get(c.operador_id);
    if (!op) {
      op = {
        operadorId: c.operador_id,
        nome:       p.nomeDoOperador(c.operador_id),
        fotoUrl:    p.fotoDoOperador(c.operador_id),
        equipe:     p.equipeDoOperador(c.operador_id),
        total:      0,
        porDia:     new Map(),
        posicao:    0,
      };
      porOperador.set(c.operador_id, op);
    }
    op.total += v;
    op.porDia.set(c.dia, (op.porDia.get(c.dia) ?? 0) + v);
    totalPorDia.set(c.dia, (totalPorDia.get(c.dia) ?? 0) + v);
  }

  // Empate pelo nome, para a ordem não dançar entre renders.
  const operadores = [...porOperador.values()].sort(
    (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  operadores.forEach((o, i) => { o.posicao = i + 1; });

  return {
    operadores,
    totalPorDia,
    totalGeral: operadores.reduce((s, o) => s + o.total, 0),
    totalSemOperador,
  };
}

/**
 * Uma casa do mapa: um dia (visão Por dia) ou uma baixa (visão Por baixa).
 * O resumo e o detalhe não precisam saber qual das duas é.
 */
export interface Casa {
  chave: string;
  dias: readonly string[];
  futuro: boolean;
}

/** Soma de uma casa no recorte em foco. */
export function valorDaCasa(casa: Casa, porDia: ReadonlyMap<string, number>): number {
  return casa.dias.reduce((s, d) => s + (porDia.get(d) ?? 0), 0);
}

export interface ResumoDoRecorte {
  total: number;
  /** Casas com algum recebimento. */
  ativas: number;
  /** Casas que já começaram. */
  corridas: number;
  melhor: { chave: string; valor: number } | null;
  /** Média por casa com recebimento. */
  mediaPorAtiva: number;
}

/** Os números do topo, para o recorte em foco (todos ou um operador). */
export function resumirCasas(
  casas: readonly Casa[], porDia: ReadonlyMap<string, number>,
): ResumoDoRecorte {
  let total = 0;
  let ativas = 0;
  let corridas = 0;
  let melhor: ResumoDoRecorte['melhor'] = null;
  for (const casa of casas) {
    if (!casa.futuro) corridas++;
    const v = valorDaCasa(casa, porDia);
    if (v === 0) continue;
    total += v;
    if (v > 0) ativas++;
    if (!melhor || v > melhor.valor) melhor = { chave: casa.chave, valor: v };
  }
  return { total, ativas, corridas, melhor, mediaPorAtiva: ativas > 0 ? total / ativas : 0 };
}

/** Quem recebeu numa casa, maior primeiro. */
export function quemRecebeuNaCasa(
  operadores: readonly OperadorDoMapa[], dias: readonly string[],
): { operador: OperadorDoMapa; valor: number }[] {
  return operadores
    .map(operador => ({ operador, valor: dias.reduce((s, d) => s + (operador.porDia.get(d) ?? 0), 0) }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}
