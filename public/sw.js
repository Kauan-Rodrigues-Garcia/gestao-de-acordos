/*
 * Service worker do app instalável (PWA) — SÓ os avisos (pagamento, equipe, metas
 * e, desde 05/10/2026, mensagem nova do chat).
 *
 * Não há `fetch` handler nem cache, de propósito: o site continua indo à rede
 * como sempre, o aviso «Nova versão disponível» (useVersionCheck) segue valendo
 * e o celular nunca fica preso num deploy velho. Ver
 * docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §1.
 *
 * O servidor (Edge Function `enviar-push`) manda um JSON:
 *   { titulo, corpo, tag?, url?, icone?, foto? }
 *
 * `icone` escolhe o ícone próprio do tipo de aviso (30/09/2026):
 * /icons/avisos/<icone>.png. O Android mostra; o iPhone usa sempre o do app.
 *
 * `foto` (aviso de chat): a foto de quem mandou, no lugar do ícone. Só endereço
 * https — o Android mostra; o iPhone usa o ícone do app. A `tag` do chat é a
 * da conversa: a mensagem nova substitui o aviso anterior, como no WhatsApp.
 *
 * O app usa HashRouter: a tela mínima é `/#/m`, não `/m`.
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
  // Só nomes conhecidos: o ícone nunca vira um caminho arbitrário.
  const ICONES = ['pagamento', 'saida', 'meta', 'operador', 'equipe', 'resumo'];
  const icone = ICONES.includes(dados.icone) ? `/icons/avisos/${dados.icone}.png` : '/icons/app-192.png';
  const foto = typeof dados.foto === 'string' && /^https:\/\//.test(dados.foto) ? dados.foto : null;
  const opcoes = {
    body: dados.corpo || '',
    icon: foto || icone,
    badge: '/icons/badge-96.png',
    tag: dados.tag || undefined,
    // Com `tag`, um reenvio substitui o aviso anterior — e ainda assim vibra.
    renotify: Boolean(dados.tag),
    vibrate: [120, 60, 120],
    data: { url: dados.url || '/#/m?novos=1' },
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
  // Só abre o próprio app: um `url` de fora (aviso adulterado) cai na tela mínima.
  const pedido = new URL(event.notification.data?.url || '/#/m?novos=1', self.location.origin);
  const destino = pedido.origin === self.location.origin ? pedido.href : new URL('/#/m?novos=1', self.location.origin).href;

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
