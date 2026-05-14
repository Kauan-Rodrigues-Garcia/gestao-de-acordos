let _tab: Window | null = null;

/**
 * Abre o Chatplay e envia o número via postMessage ou hash.
 *
 * Estratégia em camadas:
 *  1. Se já temos referência válida da aba (_tab) → postMessage direto, sem navegar.
 *  2. Caso contrário → window.open com nome 'chatplay_tab'.
 *     O userscript define window.name='chatplay_tab' ao carregar, então o browser
 *     encontra a aba mesmo que o usuário a tenha aberto manualmente.
 *     O número vai no hash (#chatplay_open=…) para a aba processar via hashchange
 *     sem recarregar a página, mais postMessage como reforço após 2s.
 */
export function abrirChatplay(phone: string): void {
  // Camada 1 — referência direta (mesma sessão)
  if (_tab && !_tab.closed) {
    _tab.focus();
    _tab.postMessage({ action: 'chatplay_open', phone }, 'https://chatplay.com.br');
    return;
  }

  // Camada 2 — busca por nome de janela + hash como canal
  const hash = `#chatplay_open=${encodeURIComponent(phone)}`;
  const tab = window.open(
    `https://chatplay.com.br/panel/chatplay${hash}`,
    'chatplay_tab',
  );
  _tab = tab;
  if (tab) {
    tab.focus();
    // postMessage como reforço após a página carregar / hashchange ser processado
    setTimeout(() => {
      tab.postMessage({ action: 'chatplay_open', phone }, 'https://chatplay.com.br');
    }, 2000);
  }
}
