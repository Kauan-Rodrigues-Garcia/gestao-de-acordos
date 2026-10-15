/**
 * Contrato de /api/gifs — a ponte com o GIPHY.
 *
 * O que se perde se isto quebrar: a chave do GIPHY servindo a quem não está
 * logado, ou um endereço de fora do GIPHY chegando ao card da empresa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { mapearGif } from '../../api/gifs';

interface Capturada { status: number; body: unknown }

function resposta(): { cap: Capturada; res: { status(c: number): unknown; json(d: unknown): void; setHeader(): void } } {
  const cap: Capturada = { status: 200, body: null };
  const res = {
    status(c: number) { cap.status = c; return res; },
    json(d: unknown) { cap.body = d; },
    setHeader() { /* irrelevante aqui */ },
  };
  return { cap, res };
}

const ITEM = {
  id: 'abc', title: 'Festa',
  images: {
    downsized_medium: { url: 'https://media2.giphy.com/media/abc/giphy.gif' },
    fixed_width: { url: 'https://media2.giphy.com/media/abc/200w.gif', webp: 'https://media2.giphy.com/media/abc/200w.webp', width: '200', height: '150' },
  },
};

describe('/api/gifs', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://projeto.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publica');
    vi.stubEnv('GIPHY_API_KEY', 'chave-giphy');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sem chave do GIPHY: 503 configured:false, sem chamar ninguém', async () => {
    vi.stubEnv('GIPHY_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { cap, res } = resposta();
    await handler({ method: 'POST', body: { tipo: 'em-alta' } }, res as never);
    expect(cap.status).toBe(503);
    expect(cap.body).toMatchObject({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem login: 401 e o GIPHY nem é chamado', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { cap, res } = resposta();
    await handler({ method: 'POST', headers: {}, body: { tipo: 'buscar', termo: 'festa' } }, res as never);
    expect(cap.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('só aceita POST', async () => {
    const { cap, res } = resposta();
    await handler({ method: 'GET' }, res as never);
    expect(cap.status).toBe(405);
  });

  it('logado: busca no GIPHY com classificação livre e devolve a lista enxuta', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
      return new Response(JSON.stringify({ data: [ITEM], pagination: { total_count: 50, count: 1, offset: 0 } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { cap, res } = resposta();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer jwt' },
      body: { tipo: 'buscar', termo: 'parabéns' },
    }, res as never);

    expect(cap.status).toBe(200);
    expect(cap.body).toEqual({
      configured: true,
      gifs: [{
        id: 'abc', titulo: 'Festa',
        url: 'https://media2.giphy.com/media/abc/giphy.gif',
        previa: 'https://media2.giphy.com/media/abc/200w.webp',
        largura: 200, altura: 150,
      }],
      proximo: 1,
    });
    const urlGiphy = String(fetchMock.mock.calls[1][0]);
    expect(urlGiphy).toContain('api.giphy.com/v1/gifs/search');
    expect(urlGiphy).toContain('rating=g');
    expect(urlGiphy).toContain('q=parab%C3%A9ns');
  });

  it('limite do GIPHY vira 429 com orientação', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/auth/')
      ? new Response(JSON.stringify({ id: 'u1' }), { status: 200 })
      : new Response('{}', { status: 429 }))));
    const { cap, res } = resposta();
    await handler({ method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { tipo: 'em-alta' } }, res as never);
    expect(cap.status).toBe(429);
  });
});

describe('mapearGif', () => {
  it('descarta item com endereço fora do GIPHY', () => {
    expect(mapearGif({ id: 'x', images: { downsized_medium: { url: 'https://outro.site/a.gif' } } })).toBeNull();
  });

  it('sem id não entra', () => {
    expect(mapearGif({ ...ITEM, id: undefined })).toBeNull();
  });
});
