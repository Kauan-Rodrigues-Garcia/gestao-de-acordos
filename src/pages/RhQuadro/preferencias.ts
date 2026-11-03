/**
 * Conforto de quem olha: o modo de ver (cartões/tabela, organograma/lista)
 * fica guardado no navegador. Sem armazenamento (aba anônima, bloqueio), a tela
 * só volta ao padrão.
 */
const PREFIXO = 'rh-quadro:';

export function lerPreferencia(chave: string, padrao: string): string {
  try {
    return window.localStorage.getItem(PREFIXO + chave) ?? padrao;
  } catch {
    return padrao;
  }
}

export function salvarPreferencia(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(PREFIXO + chave, valor);
  } catch {
    /* sem armazenamento: a escolha vale até fechar a aba */
  }
}
