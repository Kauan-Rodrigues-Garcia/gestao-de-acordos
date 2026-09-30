/**
 * Registro do service worker do app instalável (`public/sw.js`).
 *
 * Só a tela mínima (`/m`) registra: o site de desktop não ganha nada com ele,
 * e o worker só serve para receber aviso de pagamento. Sem cache — ver o
 * comentário no topo de `public/sw.js`.
 */

export function suportaServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Registra (idempotente) e devolve o registro, ou `null` sem suporte/erro. */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!suportaServiceWorker()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/**
 * Chama `aoChegar` quando o worker avisa que chegou um push (ou que a pessoa
 * tocou num aviso com a tela aberta). Devolve a função que desliga.
 */
export function ouvirAvisosDoServiceWorker(aoChegar: () => void): () => void {
  if (!suportaServiceWorker()) return () => {};
  const ouvinte = (e: MessageEvent) => {
    if ((e.data as { tipo?: string } | null)?.tipo === 'push') aoChegar();
  };
  navigator.serviceWorker.addEventListener('message', ouvinte);
  return () => navigator.serviceWorker.removeEventListener('message', ouvinte);
}
