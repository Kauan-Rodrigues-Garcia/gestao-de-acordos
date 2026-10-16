/**
 * Quanto esperar antes da próxima tentativa — exponencial, com sorteio.
 *
 * ## Por que o sorteio (16/10/2026)
 *
 * O login tentava de novo em 500 ms, 1 s, 2 s, 4 s… exatos. Com o banco lento,
 * todo mundo que entrou no mesmo minuto falhava junto e TENTAVA DE NOVO JUNTO,
 * no mesmo milissegundo — cada onda de tentativas chegando como um pico só.
 * É o mesmo desenho do incidente da Caça às Bruxas (15/10/2026): a volta
 * sincronizada é que derrubou o banco, não o volume.
 *
 * «Meio fixo, meio sorteado»: metade do atraso é garantida (ninguém volta cedo
 * demais) e a outra metade espalha as tentativas pela janela inteira.
 */
export function atrasoDaTentativa(
  tentativa: number,
  opcoes: { baseMs: number; tetoMs: number },
  sortear: () => number = Math.random,
): number {
  const exponencial = Math.min(opcoes.baseMs * 2 ** Math.max(tentativa - 1, 0), opcoes.tetoMs);
  return Math.round(exponencial / 2 + sortear() * (exponencial / 2));
}
