import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { entregarNaAbaAberta, ponteInstalada, qualNavegador } from './ponteWhatsapp';

/** Faz o papel do script no gestão: responde `ok` a cada pedido. */
function scriptFalso(ok: boolean | null) {
  const pedidos: { id: string; numero: string; texto: string }[] = [];
  const ouvir = (ev: Event) => {
    const p = JSON.parse(String((ev as CustomEvent).detail));
    pedidos.push(p);
    if (ok === null) return; // script travado: não responde
    window.dispatchEvent(new CustomEvent('gestao-whatsapp:resposta', { detail: JSON.stringify({ id: 'outro', ok: true }) }));
    window.dispatchEvent(new CustomEvent('gestao-whatsapp:resposta', { detail: JSON.stringify({ id: p.id, ok }) }));
  };
  window.addEventListener('gestao-whatsapp:abrir', ouvir);
  return { pedidos, desligar: () => window.removeEventListener('gestao-whatsapp:abrir', ouvir) };
}

describe('ponte «mesma aba» com o script do Tampermonkey', () => {
  let script: ReturnType<typeof scriptFalso> | null = null;
  beforeEach(() => { delete document.documentElement.dataset.whatsappMesmaAba; });
  afterEach(() => { script?.desligar(); script = null; vi.useRealTimers(); });

  it('sem o script: não instalada e nem tenta', async () => {
    script = scriptFalso(true);
    expect(ponteInstalada()).toBe(false);
    await expect(entregarNaAbaAberta('5518999999999', 'Oi')).resolves.toBe(false);
    expect(script.pedidos).toHaveLength(0);
  });

  it('com a aba do WhatsApp aberta: entrega o número e o texto', async () => {
    document.documentElement.dataset.whatsappMesmaAba = '1.0';
    script = scriptFalso(true);
    await expect(entregarNaAbaAberta('5518999999999', 'Olá & tchau')).resolves.toBe(true);
    expect(script.pedidos).toEqual([expect.objectContaining({ numero: '5518999999999', texto: 'Olá & tchau' })]);
  });

  it('sem aba do WhatsApp aberta: o script responde não, e a página abre uma', async () => {
    document.documentElement.dataset.whatsappMesmaAba = '1.0';
    script = scriptFalso(false);
    await expect(entregarNaAbaAberta('5518999999999', 'Oi')).resolves.toBe(false);
  });

  it('script sem resposta: desiste no prazo', async () => {
    vi.useFakeTimers();
    document.documentElement.dataset.whatsappMesmaAba = '1.0';
    script = scriptFalso(null);
    const r = entregarNaAbaAberta('5518999999999', 'Oi', 2000);
    vi.advanceTimersByTime(2000);
    await expect(r).resolves.toBe(false);
  });
});

describe('qualNavegador', () => {
  it('Edge, Chrome e o resto', () => {
    expect(qualNavegador('Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36 Edg/129.0')).toBe('edge');
    expect(qualNavegador('Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36')).toBe('chrome');
    expect(qualNavegador('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('outro');
  });
});

describe('o script publicado', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/whatsapp_mesma_aba.user.js'), 'utf8');
  it('roda no WhatsApp Web e no gestão, com as permissões que usa', () => {
    expect(js).toContain('// @match        https://web.whatsapp.com/*');
    expect(js).toContain('// @match        https://*.gestaodeacordos.com.br/*');
    for (const g of ['GM_getValue', 'GM_setValue', 'GM_addValueChangeListener', 'GM_notification']) {
      expect(js).toContain(`// @grant        ${g}`);
    }
  });
  it('fala o mesmo protocolo da página', () => {
    expect(js).toContain("'gestao-whatsapp:abrir'");
    expect(js).toContain("'gestao-whatsapp:resposta'");
    expect(js).toContain('dataset.whatsappMesmaAba');
  });
  it('é JavaScript válido', () => {
    expect(() => new Function(js)).not.toThrow();
  });
});
