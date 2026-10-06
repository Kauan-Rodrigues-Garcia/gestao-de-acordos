/**
 * agenda.ts — quando acontece cada coisa no modo Batman (pedido de 05/10/2026).
 *
 * Com o tema inteiro no ar (fase `dentro`), de tempos em tempos:
 *
 *   - charada  — um envelope do Charada encosta no canto. A primeira em 1 a 2
 *                minutos, depois a cada 7 a 12;
 *   - batmovel — o Batmóvel passa no rodapé roncando. O primeiro em 2 a 4
 *                minutos, depois a cada 6 a 12.
 *
 * Um de cada vez: o que vencer com outro na tela espera ele terminar.
 *
 * A agenda mora fora do React e é presa ao instante em que o tema entrou: trocar
 * de tela (Dashboard ⇄ Acordos) não reinicia a contagem.
 */

export type EventoGotham = 'charada' | 'batmovel';

export interface Agenda {
  /** O `desde` da fase `dentro` a que esta agenda pertence. */
  dono: number;
  charada: number;
  batmovel: number;
}

const MIN = 60_000;
const entre = (acaso: () => number, min: number, max: number) => min + acaso() * (max - min);

export function novaAgenda(dono: number, agora: number, acaso: () => number = Math.random): Agenda {
  return {
    dono,
    charada: agora + entre(acaso, 1 * MIN, 2 * MIN),
    batmovel: agora + entre(acaso, 2 * MIN, 4 * MIN),
  };
}

/** O evento que já venceu (o mais atrasado primeiro); `null` se nenhum. Puro: dá para testar. */
export function daVez(a: Agenda, agora: number): EventoGotham | null {
  const vencidos = (['charada', 'batmovel'] as const).filter(ev => a[ev] <= agora);
  if (!vencidos.length) return null;
  return vencidos.reduce((x, y) => (a[y] < a[x] ? y : x));
}

/** Marca o evento como feito e agenda a próxima vez. Puro: dá para testar. */
export function reagendar(a: Agenda, ev: EventoGotham, agora: number, acaso: () => number = Math.random): Agenda {
  if (ev === 'charada') return { ...a, charada: agora + entre(acaso, 7 * MIN, 12 * MIN) };
  return { ...a, batmovel: agora + entre(acaso, 6 * MIN, 12 * MIN) };
}

/** Não deu agora (aba escondida, janela aberta): tenta de novo daqui a pouco. */
export function adiar(a: Agenda, ev: EventoGotham, agora: number): Agenda {
  return { ...a, [ev]: agora + 30_000 };
}
