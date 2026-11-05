/**
 * senhaAleatoria.ts — a senha provisória de 6 caracteres (05/11/2026).
 *
 * Minúsculas e números, sem os que se confundem ao ditar (0/o, 1/l/i), com ao
 * menos uma letra e um número. Ex.: «k7m4px».
 *
 * O mesmo alfabeto mora em `api/aprovar-pedido-senha.ts` (lá o servidor gera a
 * senha do pedido aprovado; aqui é o botão «Gerar» de quem redefine direto).
 * O teste `senhaAleatoria.test.ts` confere que os dois não divergem.
 */

export const LETRAS_SENHA = 'abcdefghjkmnpqrstuvwxyz';
export const NUMEROS_SENHA = '23456789';
export const TAMANHO_SENHA = 6;
const ALFABETO = LETRAS_SENHA + NUMEROS_SENHA;

/** Inteiro uniforme em [0, max), pelo gerador criptográfico do navegador. */
function sortearCripto(max: number): number {
  const teto = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < teto) return buf[0] % max;
  }
}

export function gerarSenhaAleatoria(sortear: (max: number) => number = sortearCripto): string {
  for (;;) {
    let s = '';
    for (let i = 0; i < TAMANHO_SENHA; i++) s += ALFABETO[sortear(ALFABETO.length)];
    if (/[a-z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}
