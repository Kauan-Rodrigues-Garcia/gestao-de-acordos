/**
 * sorteio.ts — as duas roletas do mural: o prêmio das Lendas (entre as três)
 * e a garrafa (entre quem tem insígnia).
 *
 * ## No localhost é de mentira
 *
 * Aqui o sorteio roda no navegador, para ver a roleta girar. NO DIA NÃO PODE
 * SER ASSIM: cada tela sortearia um ganhador diferente. O resultado tem de
 * vir de um lugar só (o super_admin comandando, como a Corrida da Sorte), e a
 * roleta de cada tela só revela. Por isso o ganhador entra na roleta pronto
 * (`montarFita`): trocar o sorteio local pelo do servidor não mexe na roleta.
 *
 * Puro: o acaso entra como função.
 */

/** Sorteio com peso: devolve o índice. `acaso` em [0, 1). */
export function sortearComPeso<T>(itens: readonly T[], peso: (t: T) => number, acaso: () => number = Math.random): number {
  const total = itens.reduce((s, t) => s + Math.max(0, peso(t)), 0);
  if (itens.length === 0 || total <= 0) return -1;
  let alvo = acaso() * total;
  for (let i = 0; i < itens.length; i++) {
    alvo -= Math.max(0, peso(itens[i]));
    if (alvo < 0) return i;
  }
  return itens.length - 1;
}

/**
 * A fita da roleta: os nomes passando, embaralhados, várias voltas, e o
 * ganhador numa posição certa perto do fim (`parada`). A roleta só anima até
 * ela.
 */
export function montarFita<T>(itens: readonly T[], ganhador: number, voltas: number, acaso: () => number = Math.random): { fita: T[]; parada: number } {
  if (itens.length === 0 || ganhador < 0) return { fita: [], parada: 0 };
  // Com muita gente, a fita mostra uma amostra (as voltas passam rápido).
  const amostra = itens.length > 40 ? 40 : itens.length;
  const fita: T[] = [];
  for (let v = 0; v < voltas; v++) {
    const idx = Array.from({ length: itens.length }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(acaso() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    for (const i of idx.slice(0, amostra)) fita.push(itens[i]);
  }
  const parada = fita.length;
  fita.push(itens[ganhador]);
  // Depois da parada ainda aparecem uns, para a janela não terminar vazia.
  for (let k = 0; k < 3; k++) fita.push(itens[(ganhador + k + 1) % itens.length]);
  return { fita, parada };
}

/**
 * Onde a roleta está (0 a 1 do caminho) em `t` (0 a 1 do tempo): arranca
 * rápido e freia devagar no fim, como roleta de verdade.
 */
export function freio(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 4);
}
