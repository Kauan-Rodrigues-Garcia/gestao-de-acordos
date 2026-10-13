/**
 * baixasDoMes.ts — a régua de baixas da operação (a coluna D.U. da planilha).
 *
 * Usada pelo Mapa do mês do Analítico e pela Evolução diária do Dashboard:
 * as duas telas precisam contar baixa do mesmo jeito.
 */

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

function isoDoDia(mes: string, d: number): string {
  return `${mes}-${String(d).padStart(2, '0')}`;
}

function diasNoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}
