/**
 * abrirTransferencias.ts — pedir para o chat abrir no canal «Transferências».
 *
 * Mesmo mecanismo de `Autorizacoes/abrirNoChat.ts`: um evento E uma marca
 * guardada no módulo, para o pedido feito antes de a bolha montar não se
 * perder. Quem pede: o clique na notificação (rota `/transferencias`) e o
 * aviso da aba Usuários. Quem atende: a `BolhaChat`.
 */

export const EVENTO_ABRIR_TRANSFERENCIAS = 'chat:abrir-transferencias';

/** Id do canal — também vale em `?chat=transferencias` no celular. */
export const CONVERSA_TRANSFERENCIAS = 'transferencias';

let pedido = false;

export function abrirTransferenciasNoChat(): void {
  pedido = true;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_TRANSFERENCIAS));
  } catch {
    // Sem `window` (teste, SSR): a marca basta.
  }
}

/** Há um pedido esperando? Consome a marca. */
export function consumirPedidoDeAbrirTransferencias(): boolean {
  const havia = pedido;
  pedido = false;
  return havia;
}
