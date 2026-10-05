import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JANELA_PEDACO_MS, __resetVersaoParaTestes, perguntarVersao, podeRecarregarPara,
  podeRecarregarPorPedaco, trocarDeVersaoSePuder, versaoNovaDetectada,
} from './versaoNova';

afterEach(() => {
  __resetVersaoParaTestes();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('travas contra recarga em laço', () => {
  it('cada versão recarrega sozinha no máximo uma vez por aba', () => {
    expect(podeRecarregarPara('200', null)).toBe(true);
    expect(podeRecarregarPara('200', '100')).toBe(true);
    expect(podeRecarregarPara('200', '200')).toBe(false);
  });

  it('arquivo perdido de novo logo depois da recarga não recarrega outra vez', () => {
    const agora = 1_000_000;
    expect(podeRecarregarPorPedaco(agora, null)).toBe(true);
    expect(podeRecarregarPorPedaco(agora, String(agora - 5_000))).toBe(false);
    expect(podeRecarregarPorPedaco(agora, String(agora - JANELA_PEDACO_MS - 1))).toBe(true);
  });
});

describe('perguntarVersao', () => {
  it('versão diferente da que está rodando fica guardada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ v: 'nova' }) })));
    expect(await perguntarVersao()).toBe('nova');
    expect(versaoNovaDetectada()).toBe('nova');
  });

  it('rede caída não inventa versão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await perguntarVersao()).toBeNull();
    expect(versaoNovaDetectada()).toBeNull();
  });

  it('sem versão nova, trocar de tela não recarrega', () => {
    expect(trocarDeVersaoSePuder()).toBe(false);
  });
});
