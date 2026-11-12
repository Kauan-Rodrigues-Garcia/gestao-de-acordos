/**
 * A agenda dos quebra-nozes: quando eles sobem — a mesma hora para a cidade
 * inteira, sem o banco contar para ninguém.
 *
 * Como o trem e o urso, sai do relógio do Natal (`relogioNatal`) e de um
 * sorteio com semente: a cidade e o dia dão sempre as mesmas horas, em
 * qualquer computador (Cleber, 12/11/2026: «umas 3 por dia, de segunda a
 * sexta», e a chamada dos destaques «todos os dias às 10h da manhã»).
 *
 *   10:00            a chamada dos destaques de ontem
 *   10:45 – 11:45    uma aparição, num minuto sorteado
 *   13:45 – 15:00    outra
 *   15:45 – 17:15    e a última
 *
 * Birigui e Marília sorteiam minutos diferentes. Fora disso só a chamada feita
 * na hora pelo super_admin (`configuracao.ts`), que vale em qualquer dia.
 *
 * Uma das duas aparições da tarde (sorteada) é o boletim: eles dizem quem mais
 * recebeu na cidade até aquela hora.
 *
 * O super_admin pode trocar a hora de qualquer sessão, uma por uma (`ajustes`,
 * migration 20261112210000): a sessão é a mesma — o mesmo espetáculo —, só
 * sobe no minuto escolhido.
 *
 * O dia é o de Brasília, contado da `EPOCA` do Natal (1º de novembro, meia-noite).
 */
import { EPOCA } from '../musica';
import type { ChamadaNaHora } from './configuracao';
import type { TipoDeEspetaculo } from './diretor';
import type { Cidade } from './elenco';
import { criarSorteio, sementeDe } from './sorteio';

export const DIA_MS = 86_400_000;
const MINUTO_MS = 60_000;

/** A hora da chamada dos destaques, em minutos desde a meia-noite. */
export const CHAMADA_DAS_DEZ_MIN = 10 * 60;
/** As janelas das aparições sorteadas, em minutos desde a meia-noite. */
export const JANELAS_MIN: readonly (readonly [number, number])[] = [
  [10 * 60 + 45, 11 * 60 + 45],
  [13 * 60 + 45, 15 * 60],
  [15 * 60 + 45, 17 * 60 + 15],
];

/**
 * Por quanto tempo depois da hora ainda vale subir (quem abriu a página
 * atrasado entra no meio). Maior que qualquer espetáculo; quem sobe confere
 * a duração de verdade.
 */
export const TOLERANCIA_MS = 150_000;

/** O boletim é uma aparição que anuncia quem mais recebeu até agora. */
export type TipoDeSessao = TipoDeEspetaculo | 'boletim';

export interface Sessao {
  /** Única: serve para não tocar a mesma duas vezes. */
  chave: string;
  tipo: TipoDeSessao;
  /** Quando começa (ms). */
  inicio: number;
  /** O dia e o número da aparição: a semente do espetáculo (`diretor.ts`). */
  dia: number;
  indice: number;
  /** A hora foi trocada à mão: quando ela cairia pelo sorteio (ms). */
  sorteada?: number;
}

/** Os horários trocados à mão: `chaveDoAjuste` → minuto do dia (0 a 1439, de Brasília). */
export type Ajustes = Readonly<Record<string, number>>;
export function chaveDoAjuste(dia: number, cidade: Cidade, indice: number): string {
  return `${dia}:${cidade}:${indice}`;
}

export interface Ligado {
  automaticas: boolean;
  chamada10h: boolean;
  /** Uma das aparições da tarde vira o boletim (padrão: sim). */
  boletim?: boolean;
  ajustes?: Ajustes;
}

/** O dia de Brasília, contado da época do Natal. */
export function diaDoNatal(agoraMs: number): number {
  return Math.floor((agoraMs - EPOCA) / DIA_MS);
}

/** A meia-noite (de Brasília) em que o dia começa, em ms. */
export function inicioDoDia(dia: number): number {
  return EPOCA + dia * DIA_MS;
}

/** Segunda a sexta. */
export function ehDiaUtil(dia: number): boolean {
  // A meia-noite de Brasília são 3h UTC do mesmo dia do calendário.
  const semana = new Date(inicioDoDia(dia)).getUTCDay();
  return semana >= 1 && semana <= 5;
}

/** Qual das aparições do dia (2 ou 3, as da tarde) é o boletim. */
export function indiceDoBoletim(cidade: Cidade, dia: number): number {
  return criarSorteio(sementeDe('boletim', cidade, dia)).chance(0.5) ? 2 : 3;
}

/** As sessões marcadas do dia para a cidade, em ordem. Sábado e domingo, nenhuma. */
export function sessoesDoDia(cidade: Cidade, dia: number, ligado: Ligado): Sessao[] {
  if (!ehDiaUtil(dia)) return [];
  const zero = inicioDoDia(dia);
  const sessoes: Sessao[] = [];
  /** A hora do sorteio, ou a que o super_admin pôs no lugar. A chave muda junto: a hora nova vale mesmo para quem já viu a antiga. */
  const marcar = (chave: string, tipo: TipoDeSessao, indice: number, sorteada: number) => {
    const minuto = ligado.ajustes?.[chaveDoAjuste(dia, cidade, indice)];
    if (typeof minuto === 'number' && Number.isFinite(minuto) && minuto >= 0 && minuto < 1440) {
      sessoes.push({ chave: `${chave}@${Math.floor(minuto)}`, tipo, inicio: zero + Math.floor(minuto) * MINUTO_MS, dia, indice, sorteada });
    } else {
      sessoes.push({ chave, tipo, inicio: sorteada, dia, indice });
    }
  };
  if (ligado.chamada10h) marcar(`dez:${cidade}:${dia}`, 'parabens', 0, zero + CHAMADA_DAS_DEZ_MIN * MINUTO_MS);
  if (ligado.automaticas) {
    const boletim = ligado.boletim === false ? -1 : indiceDoBoletim(cidade, dia);
    JANELAS_MIN.forEach(([de, ate], k) => {
      const s = criarSorteio(sementeDe('agenda', cidade, dia, k));
      const segundo = Math.floor(s.entre(de * 60, ate * 60));
      marcar(`auto:${cidade}:${dia}:${k}`, k + 1 === boletim ? 'boletim' : 'aparicao', k + 1, zero + segundo * 1000);
    });
  }
  return sessoes.sort((a, b) => a.inicio - b.inicio);
}

/** A chamada feita na hora pelo card, se for para esta cidade. */
export function sessaoDaChamada(chamada: ChamadaNaHora | null, cidade: Cidade): Sessao | null {
  if (!chamada || (chamada.cidade !== 'todas' && chamada.cidade !== cidade)) return null;
  return {
    chave: `chamada:${chamada.numero}:${chamada.em}`,
    tipo: chamada.tipo,
    inicio: chamada.em,
    dia: diaDoNatal(chamada.em),
    // Longe dos números do dia (0 a 3): a chamada na hora nunca repete uma aparição marcada.
    indice: 100 + (chamada.numero % 10_000),
  };
}

/**
 * A sessão que está no palco agora ou a próxima a subir, entre as de hoje e a
 * chamada na hora. `feitas`: as que este navegador já tocou (ou perdeu).
 */
export function proximaSessao(
  cidade: Cidade,
  agoraMs: number,
  config: Ligado & { chamada: ChamadaNaHora | null },
  feitas: ReadonlySet<string> = new Set(),
): Sessao | null {
  const dia = diaDoNatal(agoraMs);
  const todas = [...sessoesDoDia(cidade, dia, config), ...sessoesDoDia(cidade, dia + 1, config)];
  const chamada = sessaoDaChamada(config.chamada, cidade);
  if (chamada) todas.push(chamada);
  return todas
    .filter(s => !feitas.has(s.chave) && s.inicio + TOLERANCIA_MS > agoraMs)
    .sort((a, b) => a.inicio - b.inicio)[0] ?? null;
}
