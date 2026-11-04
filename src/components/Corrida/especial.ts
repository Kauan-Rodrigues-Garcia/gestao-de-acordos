/**
 * especial.ts — a corrida especial (27/10/2026): uma corrida de bichinhos no
 * mapa grande, o Fliperama Turbo (canhões, luvas de boxe, pinball,
 * teletransporte), que fica fora da roleta dos mapas.
 *
 * Não precisa de banco: no banco ela é uma corrida de bichinhos como as outras,
 * e o que a faz especial é o mapa que vai na gravação (`gravacao.mapa`). Quem
 * assiste sabe pelo mapa. Antes de gravar, quem sabe é o navegador do super
 * admin: a marca fica guardada aqui, por corrida, e o interruptor do card
 * mostra e troca. Gravando de outro navegador, é só ligar o interruptor de novo.
 */
export const MAPA_ESPECIAL = 'arcade';
export const NOME_ESPECIAL = 'Fliperama Turbo';

export const ehMapaEspecial = (mapa: string | null | undefined): boolean => mapa === MAPA_ESPECIAL;

const chave = (corridaId: number) => `corrida-especial:${corridaId}`;

export function marcarEspecial(corridaId: number, especial: boolean): void {
  try {
    if (especial) localStorage.setItem(chave(corridaId), '1');
    else localStorage.removeItem(chave(corridaId));
  } catch { /* sem localStorage: vale o interruptor, enquanto a página estiver aberta */ }
}

export function corridaEhEspecial(corridaId: number): boolean {
  try { return localStorage.getItem(chave(corridaId)) === '1'; } catch { return false; }
}
