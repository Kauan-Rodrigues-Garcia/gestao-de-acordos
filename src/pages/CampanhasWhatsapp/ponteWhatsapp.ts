/**
 * «WhatsApp sempre na mesma aba» — a conversa com o script do Tampermonkey
 * (`public/scripts/whatsapp_mesma_aba.user.js`).
 *
 * O WhatsApp Web isola a própria aba (`Cross-Origin-Opener-Policy`): o
 * navegador não deixa o gestão achar a aba aberta, nem pelo nome da janela —
 * cada `window.open` abria uma aba nova. O script, instalado nos dois sites,
 * leva o pedido de uma aba à outra.
 *
 *   página → `gestao-whatsapp:abrir`    detail = JSON {id, numero, texto}
 *   script → `gestao-whatsapp:resposta` detail = JSON {id, ok}
 *
 * `ok: false` (ou nenhuma resposta) = não há aba do WhatsApp aberta: a página
 * abre uma, e é ela que recebe as próximas.
 */

export const URL_SCRIPT = '/scripts/whatsapp_mesma_aba.user.js';
const EVENTO_ABRIR = 'gestao-whatsapp:abrir';
const EVENTO_RESPOSTA = 'gestao-whatsapp:resposta';

/** O script marca o `<html>` com a versão dele (`data-whatsapp-mesma-aba`). */
export function ponteInstalada(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.dataset.whatsappMesmaAba;
}

/**
 * Manda a conversa para a aba do WhatsApp já aberta. Resolve `true` se a aba
 * recebeu; `false` se não há script, nem aba, ou se passou do prazo.
 *
 * O prazo fica bem abaixo dos 5 s em que o navegador ainda deixa abrir a aba
 * nova (a «ativação» do clique).
 */
export function entregarNaAbaAberta(numero: string, texto: string, prazoMs = 2000): Promise<boolean> {
  if (!ponteInstalada()) return Promise.resolve(false);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const terminar = (ok: boolean) => {
      clearTimeout(relogio);
      window.removeEventListener(EVENTO_RESPOSTA, ouvir);
      resolve(ok);
    };
    const ouvir = (ev: Event) => {
      try {
        const r = JSON.parse(String((ev as CustomEvent).detail)) as { id?: string; ok?: boolean };
        if (r.id === id) terminar(r.ok === true);
      } catch { /* resposta de outra coisa: ignora */ }
    };
    const relogio = setTimeout(() => terminar(false), prazoMs);
    window.addEventListener(EVENTO_RESPOSTA, ouvir);
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR, { detail: JSON.stringify({ id, numero, texto }) }));
  });
}

/** Navegador, para a loja certa do Tampermonkey e o passo de liberar scripts. */
export type Navegador = 'edge' | 'chrome' | 'outro';

export function qualNavegador(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): Navegador {
  if (/\bEdg\//.test(ua)) return 'edge';
  if (/\bChrome\//.test(ua) && !/\bOPR\//.test(ua)) return 'chrome';
  return 'outro';
}

export const LOJA_TAMPERMONKEY: Record<Navegador, string> = {
  edge: 'https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd',
  chrome: 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo',
  outro: 'https://www.tampermonkey.net/',
};
