/**
 * O recado dos duendes para o Urso (06/11/2026): quando o Grinch invade o
 * chalé de Acordos, fica anotado AQUI, no navegador; o urso do iglu
 * (Analítico) lê e puxa o assunto na próxima conversa — «os duendes me
 * caguetaram».
 *
 * Fica no `localStorage` porque o urso mora em outra aba do app e a pessoa
 * pode recarregar no meio; é só uma hora, nada de banco. Sem acesso ao
 * armazenamento (janela anônima bloqueada), o urso só não fica sabendo.
 */
const CHAVE = 'natal-grinch-invadiu-em';

/** Quanto tempo a notícia é «fresca» para o urso. */
export const NOTICIA_FRESCA_MS = 3 * 60 * 60_000;

export function registrarInvasao(agora = Date.now()) {
  try { localStorage.setItem(CHAVE, String(agora)); } catch { /* sem armazenamento: o urso não fica sabendo */ }
}

export function invasaoRecente(agora = Date.now()): boolean {
  try {
    const em = Number(localStorage.getItem(CHAVE));
    return Number.isFinite(em) && em > 0 && agora - em < NOTICIA_FRESCA_MS;
  } catch {
    return false;
  }
}
