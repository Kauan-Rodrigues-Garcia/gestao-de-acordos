// ==UserScript==
// @name         Chatplay Opener
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Abre conversa no Chatplay via postMessage do Gestão de Acordos
// @author       Gestão de Acordos
// @match        https://chatplay.com.br/*
// @match        https://*.chatplay.com.br/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function normalizarTelefone(raw) {
    const digits = raw.replace(/\D/g, '');
    const local = digits.length === 13 && digits.startsWith('55')
      ? digits.slice(2)
      : digits;
    if (local.length !== 11) return null;
    return local;
  }

  function formatarExibicao(digits) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  }

  async function abrirConversa(telefone) {
    const digits = normalizarTelefone(telefone);
    if (!digits) { console.warn('[Chatplay Opener] Telefone inválido:', telefone); return; }

    const input = document.querySelector('#rc_select_0');
    if (!input) { console.warn('[Chatplay Opener] Campo de busca não encontrado.'); return; }

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, formatarExibicao(digits));
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject('Timeout: nenhum resultado encontrado'), 4000);
      const observer = new MutationObserver(() => {
        const itens = document.querySelectorAll('.ant-select-item-option-content');
        const resultado = Array.from(itens).find(el => el.innerText.includes(digits));
        if (resultado) { clearTimeout(timeout); observer.disconnect(); resolve(resultado); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })
    .then(item => {
      const pai = item.closest('.ant-select-item');
      const alvo = pai || item;
      alvo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      alvo.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      alvo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      console.log('[Chatplay Opener] Conversa aberta:', item.innerText);
    })
    .catch(err => console.warn('[Chatplay Opener]', err));
  }

  // Permite que window.open('...', 'chatplay_tab') encontre esta aba pelo nome,
  // mesmo que o usuário a tenha aberto manualmente antes de clicar no botão.
  window.name = 'chatplay_tab';

  // Canal via hash: processa #chatplay_open=PHONE sem recarregar a página
  function processarHash() {
    const hash = decodeURIComponent(window.location.hash);
    const match = hash.match(/[#&]?chatplay_open=([^&]+)/);
    if (match) {
      abrirConversa(match[1]);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  window.addEventListener('hashchange', processarHash);
  window.addEventListener('load', processarHash);

  // Canal via postMessage (mesma sessão / fallback após 2s)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'chatplay_open') {
      abrirConversa(event.data.phone);
    }
  });

  console.log('[Chatplay Opener] v1.2 ativo — postMessage + hash + window.name=chatplay_tab.');
})();
