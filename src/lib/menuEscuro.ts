/**
 * menuEscuro.ts — o menu lateral escuro sobre tema claro (o botão mora no
 * `ThemeToggle.tsx`; a abertura do Natal também liga e desliga).
 *
 * Interruptor independente do tema: liga e o <aside> fica escuro mesmo com o
 * resto da tela claro. Quem faz o trabalho e o CSS — a classe redefine so os
 * tokens `--sidebar-*`, e o seletor dela ignora os temas que ja sao escuros,
 * para nao sobrescrever o sidebar proprio do Cinza Escuro e do Azul Profundo.
 * No Rosa e no Verde o menu escurece no tom do tema. Ver o bloco
 * `.menu-lateral-escuro` em `index.css`.
 *
 * A classe mora fora da lista de temas do next-themes: ele so remove do <html>
 * as classes de tema, entao esta sobrevive a qualquer troca.
 */
const CLASSE_MENU_ESCURO = 'menu-lateral-escuro';
export const CHAVE_MENU_ESCURO = 'menuLateralEscuro';

/** O menu lateral está escuro agora? (A abertura do Natal confere: o vídeo é o sistema com o menu claro.) */
export const menuEscuroLigado = () => document.documentElement.classList.contains(CLASSE_MENU_ESCURO);

export function aplicarMenuEscuro(ligado: boolean) {
  document.documentElement.classList.toggle(CLASSE_MENU_ESCURO, ligado);
  try { localStorage.setItem(CHAVE_MENU_ESCURO, ligado ? 'true' : 'false'); }
  catch { /* modo privado */ }
}
