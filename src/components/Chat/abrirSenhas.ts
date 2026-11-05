/**
 * abrirSenhas.ts — pedir para o chat abrir no canal «Senhas» (05/11/2026).
 *
 * Mesmo mecanismo de `abrirTransferencias.ts`: um evento E uma marca guardada
 * no módulo, para o pedido feito antes de a bolha montar não se perder. Quem
 * pede: o clique na notificação (rota `/senhas`) e o diálogo de Usuários
 * depois de pedir. Quem atende: a `BolhaChat`.
 */

export const EVENTO_ABRIR_SENHAS = 'chat:abrir-senhas';

/** Id do canal — também vale em `?chat=senhas`. */
export const CONVERSA_SENHAS = 'senhas';

let pedido = false;

export function abrirSenhasNoChat(): void {
  pedido = true;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_SENHAS));
  } catch {
    // Sem `window` (teste, SSR): a marca basta.
  }
}

/** Há um pedido esperando? Consome a marca. */
export function consumirPedidoDeAbrirSenhas(): boolean {
  const havia = pedido;
  pedido = false;
  return havia;
}
