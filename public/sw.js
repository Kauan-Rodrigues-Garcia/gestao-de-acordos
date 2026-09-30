/*
 * Service worker do app instalável (PWA) — SÓ aviso de pagamento.
 *
 * Não há `fetch` handler nem cache, de propósito: o site continua indo à rede
 * como sempre, o aviso «Nova versão disponível» (useVersionCheck) segue valendo
 * e o celular nunca fica preso num deploy velho. Ver
 * docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §1.
 *
 * O servidor (Edge Function `enviar-push`) manda um JSON:
 *   { titulo, corpo, tag?, url? }
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { corpo: event.data ? event.data.text() : '' };
  }

  const titulo = dados.titulo || 'Gestão de Acordos';
  const opcoes = {
    body: dados.corpo || '',
    icon: '/icons/app-192.png',
    badge: '/icons/badge-96.png',
    tag: dados.tag || undefined,
    // Com `tag`, um reenvio substitui o aviso anterior — e ainda assim vibra.
    renotify: Boolean(dados.tag),
    vibrate: [120, 60, 120],
    data: { url: dados.url || '/m?novos=1' },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(titulo, opcoes);
    // Tela aberta: recarrega os números sem esperar o toque.
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) j.postMessage({ tipo: 'push' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || '/m?novos=1', self.location.origin).href;

  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if (new URL(j.url).origin !== self.location.origin) continue;
      await j.focus();
      if ('navigate' in j) {
        try { await j.navigate(destino); } catch { /* janela não controlada: fica o foco */ }
      }
      j.postMessage({ tipo: 'push' });
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
