/**
 * abrirNoChat.ts — pedir para o chat abrir na conversa «Autorizações».
 *
 * Quem pede é o clique numa notificação de autorização (a rota
 * `/autorizacoes`, gravada pelo banco) e o aviso que aparece quando chega um
 * pedido novo. Quem atende é a `BolhaChat`.
 *
 * Um evento E uma marca guardada no módulo: a bolha pode estar montada (ouve o
 * evento na hora) ou ainda montando — a página de onde veio o clique pode ter
 * trocado e o banco ainda não liberou o chat. Ao ficar pronta, ela consome a
 * marca. Sem a marca, o pedido feito antes da bolha ouvir se perdia.
 */

export const EVENTO_ABRIR_AUTORIZACOES = 'chat:abrir-autorizacoes';

/** Id da conversa fixa — também vale em `?chat=autorizacoes` no celular. */
export const CONVERSA_AUTORIZACOES = 'autorizacoes';

let pedido = false;

export function abrirAutorizacoesNoChat(): void {
  pedido = true;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AUTORIZACOES));
  } catch {
    // Sem `window` (teste, SSR): a marca basta.
  }
}

/** Há um pedido esperando? Consome a marca. */
export function consumirPedidoDeAbrir(): boolean {
  const havia = pedido;
  pedido = false;
  return havia;
}
