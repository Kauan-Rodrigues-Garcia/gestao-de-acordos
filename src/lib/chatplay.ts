let _tab: Window | null = null;

/**
 * Abre o Chatplay e envia o número via postMessage.
 * Reutiliza a aba se ainda estiver aberta; caso contrário abre uma nova.
 */
export function abrirChatplay(phone: string): void {
  if (_tab && !_tab.closed) {
    _tab.focus();
    _tab.postMessage({ action: 'chatplay_open', phone }, 'https://chatplay.com.br');
    return;
  }
  const tab = window.open('https://chatplay.com.br/panel/chatplay', 'chatplay_tab');
  _tab = tab;
  setTimeout(() => {
    tab?.postMessage({ action: 'chatplay_open', phone }, 'https://chatplay.com.br');
  }, 2000);
}
