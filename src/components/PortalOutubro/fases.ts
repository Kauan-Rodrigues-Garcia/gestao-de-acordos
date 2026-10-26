/**
 * fases.ts — o calendário do Portal de Outubro: o que o Gestão mostra em cada
 * momento da semana de 26 a 30/10/2026.
 *
 * ## O pedido (Kauan, 26/10/2026)
 *
 * «De dia em dia quebrando, e no dia abrisse um portal ou mural mostrando o
 * que foi feito no mês: o Rei do Pop, a bruxa, o cavalo; um ranking de quem
 * teve a maior pontuação de medalhas; e um sorteio de uma garrafa.» A
 * comemoração é na sexta, 30/10, porque o dia 31 (Halloween) cai no sábado.
 *
 *   seg 26  uma fissura fina no canto de cima
 *   ter 27  a rachadura atravessa o topo
 *   qua 28  rachaduras pelas bordas, e luz vazando das frestas
 *   qui 29  a tela treme de vez em quando; «Amanhã, às 16h.»
 *   sex 30  as rachaduras tomam a borda e chegam perto do meio, com a contagem;
 *           às 16h o vidro quebra, o portal abre e o mural passa
 *   sáb 31  o mural fica para rever o dia todo; depois, nada
 *
 * ## Só o relógio
 *
 * Nada aqui lê o banco: a fase sai da hora (de São Paulo, UTC−3 o ano todo —
 * o Brasil não tem horário de verão desde 2019). Às 16h ninguém pergunta nada
 * ao servidor: a lição da gargalhada da bruxa (15/10/2026) é que todo mundo
 * fazendo a mesma coisa no mesmo segundo derruba o banco.
 *
 * Puro de propósito: o relógio de teste (`relogio.ts`) passa a hora que quiser.
 */

/** O portal no app de verdade. Por enquanto só no `npm run dev` (pedido de 26/10: «já faça para o localhost»). */
export const PORTAL_LIGADO = import.meta.env.DEV;

const HORA = 3_600_000;
const MINUTO = 60_000;

/** Um instante no horário de São Paulo (UTC−3). `mes` de 1 a 12. */
export function emSaoPaulo(ano: number, mes: number, dia: number, h = 0, m = 0, s = 0): number {
  return Date.UTC(ano, mes - 1, dia, h + 3, m, s);
}

/** A hora de São Paulo de um instante: dia do mês, dia da semana (0 = domingo), hora, minuto, segundo. */
export function partesEmSaoPaulo(ms: number) {
  const d = new Date(ms - 3 * HORA);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    semana: d.getUTCDay(),
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
  };
}

export const INICIO = emSaoPaulo(2026, 10, 26);
/** O vidro quebra e o portal abre. */
export const ABERTURA = emSaoPaulo(2026, 10, 30, 16);
/** O último minuto: a contagem vai para o meio da tela e a tela treme sem parar. */
export const ULTIMO_MINUTO = ABERTURA - MINUTO;
/** Até quando o mural fica para rever (o sábado inteiro). */
export const FIM = emSaoPaulo(2026, 11, 1);

/** Meia-noite de cada dia da semana do evento: 1 = segunda 26, …, 5 = sexta 30. */
export const DIAS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: emSaoPaulo(2026, 10, 26),
  2: emSaoPaulo(2026, 10, 27),
  3: emSaoPaulo(2026, 10, 28),
  4: emSaoPaulo(2026, 10, 29),
  5: emSaoPaulo(2026, 10, 30),
};

export type Fase = 'fora' | 'rachando' | 'ultimoMinuto' | 'aberto';

export interface EstadoDoPortal {
  fase: Fase;
  /** O dia da semana do evento (1 = segunda … 5 = sexta); 0 fora da semana, 6 no sábado. */
  dia: number;
  /** Luz vazando das frestas: de quarta em diante, mais forte a cada dia, cheia às 16h de sexta. */
  luz: number;
  /** A tela treme de vez em quando (quinta e sexta). */
  tremor: boolean;
  /** «Amanhã, às 16h.» (quinta). */
  bilhete: boolean;
  /** A contagem regressiva (sexta, até abrir). */
  contagem: boolean;
  /** Quanto falta para abrir (ms; 0 depois). */
  faltaMs: number;
}

function diaDoEvento(agora: number): number {
  if (agora < DIAS[1]) return 0;
  return Math.min(6, 1 + Math.floor((agora - DIAS[1]) / (24 * HORA)));
}

export function estadoDoPortal(agora: number): EstadoDoPortal {
  const dia = diaDoEvento(agora);
  const faltaMs = Math.max(0, ABERTURA - agora);
  const fase: Fase =
    agora < INICIO || agora >= FIM ? 'fora'
      : agora >= ABERTURA ? 'aberto'
        : agora >= ULTIMO_MINUTO ? 'ultimoMinuto'
          : 'rachando';
  let luz = 0;
  if (fase === 'rachando' || fase === 'ultimoMinuto') {
    if (dia === 3) luz = 0.35;
    else if (dia === 4) luz = 0.55;
    else if (dia === 5) luz = 0.65 + 0.35 * Math.min(1, (agora - DIAS[5]) / (ABERTURA - DIAS[5]));
  }
  const rachando = fase === 'rachando' || fase === 'ultimoMinuto';
  return {
    fase,
    dia,
    luz,
    tremor: rachando && dia >= 4,
    bilhete: rachando && dia === 4,
    contagem: rachando && dia === 5,
    faltaMs,
  };
}

/** «03:12:45» (ou «12:45» na última hora). */
export function relogioDaContagem(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** «sex 30/10 15:59:30», para o painel do relógio. */
export function dataCurta(ms: number): string {
  const p = partesEmSaoPaulo(ms);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${SEMANA[p.semana]} ${dois(p.dia)}/${dois(p.mes)} ${dois(p.h)}:${dois(p.m)}:${dois(p.s)}`;
}

export const NOME_DA_FASE: Readonly<Record<Fase, string>> = {
  fora: 'fora da semana',
  rachando: 'rachando',
  ultimoMinuto: 'último minuto',
  aberto: 'portal aberto',
};
