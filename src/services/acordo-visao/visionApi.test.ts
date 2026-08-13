import { solicitarLeituraIa } from './visionApi';

describe('solicitarLeituraIa', () => {
  it('envia o JWT da sessão no header Authorization', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-do-operador',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        origem: 'bookplay',
        imagens: ['data:image/png;base64,AA=='],
      });
      return new Response(JSON.stringify({
        configured: true,
        dados: { nome_cliente: 'Cliente teste' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await expect(solicitarLeituraIa(
      ['data:image/png;base64,AA=='],
      'jwt-do-operador',
      fetchMock as typeof fetch,
    )).resolves.toEqual({ nome_cliente: 'Cliente teste' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('não chama a API sem sessão', async () => {
    const fetchMock = vi.fn();
    await expect(solicitarLeituraIa([], '', fetchMock as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([404, 501, 503])('usa o fallback local quando a API responde %i', async (status) => {
    const fetchMock = vi.fn(async () => new Response(null, { status }));
    await expect(solicitarLeituraIa([], 'jwt', fetchMock as typeof fetch)).resolves.toBeNull();
  });

  it('usa o fallback local quando a cota termina', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 429,
      headers: { 'Retry-After': '37' },
    }));
    await expect(solicitarLeituraIa([], 'jwt', fetchMock as typeof fetch)).resolves.toBeNull();
  });
});
