/** Estado mínimo necessário para decidir se uma mensagem deve interromper. */
export interface EstadoJanelaChat {
  janelaAberta: boolean;
  conversaAberta: string | null;
  conversaDaMensagem: string;
}

export function deveNotificarMensagemChat(estado: EstadoJanelaChat): boolean {
  return !estado.janelaAberta || estado.conversaAberta !== estado.conversaDaMensagem;
}

export function tituloComMensagensNaoLidas(total: number, base = 'Gestão de Acordos'): string {
  return total > 0 ? `(${total}) ${base}` : base;
}

// ── Uma notificação visual por mensagem, mesmo com várias abas ──────────────

const CHAVE_VISTAS = 'chat:notificacoes-exibidas';
const LOCK = 'gestao-chat-notificacao';
const VALIDADE_MS = 60 * 60 * 1000;
const LIMITE_IDS = 100;

interface RegistroVisto { id: string; em: number }

function registrarSeNova(id: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const agora = Date.now();
    const lidos = JSON.parse(localStorage.getItem(CHAVE_VISTAS) ?? '[]') as RegistroVisto[];
    const vivos = Array.isArray(lidos)
      ? lidos.filter(r => r && typeof r.id === 'string' && agora - r.em < VALIDADE_MS)
      : [];
    if (vivos.some(r => r.id === id)) return false;
    localStorage.setItem(
      CHAVE_VISTAS,
      JSON.stringify([...vivos, { id, em: agora }].slice(-LIMITE_IDS)),
    );
    return true;
  } catch {
    // Storage bloqueado não pode impedir a notificação desta aba.
    return true;
  }
}

/**
 * Web Locks serializa as abas do Chrome antes de consultar o localStorage.
 * Sem suporte à API, o mesmo registro ainda deduplica reconexões nesta aba.
 */
export async function executarNotificacaoChatUmaVez(
  mensagemId: string,
  executar: () => void,
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(LOCK, () => {
      if (registrarSeNova(mensagemId)) executar();
    });
    return;
  }
  if (registrarSeNova(mensagemId)) executar();
}

/** Somente para testes. */
export const __CHAVE_NOTIFICACOES_CHAT = CHAVE_VISTAS;
