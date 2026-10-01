/**
 * anuncio.ts — qual música o card «Tocando agora» já anunciou.
 *
 * Mora no módulo, não no `BotaoSomAmbiente`: cada tela do sistema monta o
 * `Layout` de novo, e o botão junto. Guardado no componente, o card voltava (e
 * piscava) a cada troca de tela. Aqui vive enquanto a página estiver aberta.
 */
let ultimaAnunciada: string | null = null;

/**
 * Responde se `noAr` merece o card agora, e já marca como anunciada. Nada no
 * ar (logout, sessão nova) zera: a primeira música da próxima sessão anuncia.
 */
export function anunciarSeNova(noAr: string | null, tocando: boolean): boolean {
  if (!noAr) { ultimaAnunciada = null; return false; }
  if (!tocando || noAr === ultimaAnunciada) return false;
  ultimaAnunciada = noAr;
  return true;
}

/** Só para teste. */
export function __esquecerAnuncio() { ultimaAnunciada = null; }
