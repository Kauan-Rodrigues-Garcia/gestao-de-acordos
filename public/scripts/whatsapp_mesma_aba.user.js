// ==UserScript==
// @name         Gestão — WhatsApp sempre na mesma aba
// @namespace    https://www.gestaodeacordos.com.br/
// @version      1.0
// @description  As mensagens das Campanhas de WhatsApp abrem na aba do WhatsApp Web que já está aberta, sem abrir aba nova a cada envio.
// @author       Gestão de Acordos
// @match        https://web.whatsapp.com/*
// @match        https://gestaodeacordos.com.br/*
// @match        https://*.gestaodeacordos.com.br/*
// @include      http://localhost:*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_notification
// @updateURL    https://www.gestaodeacordos.com.br/scripts/whatsapp_mesma_aba.user.js
// @downloadURL  https://www.gestaodeacordos.com.br/scripts/whatsapp_mesma_aba.user.js
// ==/UserScript==

/*
 * Por que precisa de script: o WhatsApp Web isola a própria aba
 * (Cross-Origin-Opener-Policy), e o navegador não deixa nenhum site achar ou
 * mandar algo para ela. O Tampermonkey guarda valores que as duas abas leem:
 *
 *   gestão  ── pedido {id, numero, texto} ──▶  aba do WhatsApp
 *   gestão  ◀── recebido = id ──────────────  aba do WhatsApp
 *
 * Sem resposta em 1,5 s (nenhuma aba do WhatsApp aberta), o gestão abre uma
 * aba nova, como antes — e é ela que recebe as próximas.
 *
 * O protocolo com a página está em src/pages/CampanhasWhatsapp/ponteWhatsapp.ts.
 */
(function () {
  'use strict';

  var VERSAO = '1.0';
  var VALIDADE_MS = 5000;

  // ── Na aba do WhatsApp ────────────────────────────────────────────────────
  if (location.hostname === 'web.whatsapp.com') {
    var abaId = Math.random().toString(36).slice(2) + Date.now().toString(36);

    // A aba que recebe é a última usada: com duas abas do WhatsApp abertas,
    // só uma abre a conversa.
    var assumir = function () { GM_setValue('wa_aba', abaId); };
    assumir();
    window.addEventListener('focus', assumir);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') assumir();
    });

    GM_addValueChangeListener('wa_pedido', function (_nome, _antes, pedido, remoto) {
      if (!remoto || !pedido || GM_getValue('wa_aba') !== abaId) return;
      if (Date.now() - pedido.em > VALIDADE_MS) return;
      GM_setValue('wa_recebido', pedido.id);
      // Traz esta aba para a frente (o Tampermonkey ativa a aba de quem avisa).
      try { GM_notification({ highlight: true }); } catch (e) { /* sem permissão: segue */ }
      location.href = 'https://web.whatsapp.com/send?phone=' + encodeURIComponent(pedido.numero)
        + '&text=' + encodeURIComponent(pedido.texto);
    });
    return;
  }

  // ── No gestão ─────────────────────────────────────────────────────────────
  function marcarInstalado() {
    if (document.documentElement) document.documentElement.dataset.whatsappMesmaAba = VERSAO;
  }
  marcarInstalado();
  document.addEventListener('DOMContentLoaded', marcarInstalado);

  function responder(id, ok) {
    window.dispatchEvent(new CustomEvent('gestao-whatsapp:resposta', {
      detail: JSON.stringify({ id: id, ok: ok }),
    }));
  }

  var esperando = {};
  GM_addValueChangeListener('wa_recebido', function (_nome, _antes, id) {
    if (!esperando[id]) return;
    clearTimeout(esperando[id]);
    delete esperando[id];
    responder(id, true);
  });

  window.addEventListener('gestao-whatsapp:abrir', function (ev) {
    var p;
    try { p = JSON.parse(ev.detail); } catch (e) { return; }
    if (!p || !p.id || !p.numero) return;
    esperando[p.id] = setTimeout(function () {
      delete esperando[p.id];
      responder(p.id, false);
    }, 1500);
    GM_setValue('wa_pedido', { id: p.id, numero: String(p.numero), texto: String(p.texto || ''), em: Date.now() });
  });
})();
