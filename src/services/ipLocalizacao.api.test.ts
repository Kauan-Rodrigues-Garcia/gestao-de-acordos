import handler from '../../api/localizar-ips';

function respostaFake() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { state.headers[name] = value; },
    status(code: number) { state.statusCode = code; return res; },
    json(data: unknown) { state.body = data; },
  };
  return { state, res };
}

const CACHE_VALIDO = {
  ip: '8.8.8.8', cidade: 'Mountain View', estado: 'California', estado_codigo: 'CA',
  pais: 'Estados Unidos', pais_codigo: 'US', status: 'sucesso',
  consultado_em: '2026-08-01T00:00:00.000Z',
  ultima_tentativa_em: '2026-08-01T00:00:00.000Z',
  expira_em: '2099-01-01T00:00:00.000Z', ultimo_erro: null,
};

describe('/api/localizar-ips', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://projeto.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reutiliza cache válido sem consultar o provedor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('true', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([CACHE_VALIDO]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { ips: ['8.8.8.8'] },
    }, res);

    expect(state.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('https://ipwho.is/'))).toBe(false);
    expect(state.body).toMatchObject({
      localizacoes: [{ ip: '8.8.8.8', cidade: 'Mountain View', estadoCodigo: 'CA' }],
    });
  });

  it('renova IP vencido e grava validade de 30 dias', async () => {
    const vencido = { ...CACHE_VALIDO, expira_em: '2020-01-01T00:00:00.000Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('true', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([vencido]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, ip: '8.8.8.8', city: 'Marília', region: 'São Paulo',
        region_code: 'SP', country: 'Brasil', country_code: 'BR',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { ips: ['8.8.8.8'] },
    }, res);

    expect(state.statusCode).toBe(200);
    expect(fetchMock.mock.calls[3][0]).toContain('https://ipwho.is/8.8.8.8');
    const salvo = JSON.parse(String(fetchMock.mock.calls[4][1]?.body))[0];
    expect(salvo).toMatchObject({ cidade: 'Marília', estado_codigo: 'SP', status: 'sucesso' });
    expect(new Date(salvo.expira_em).getTime() - new Date(salvo.consultado_em).getTime())
      .toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('não consulta cache nem provedor quando ver_logs está desligada', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('false', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { ips: ['8.8.8.8'] },
    }, res);

    expect(state.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mantém a localização anterior e tenta de novo em uma hora se o provedor falhar', async () => {
    const vencido = { ...CACHE_VALIDO, expira_em: '2020-01-01T00:00:00.000Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('true', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([vencido]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, message: 'Rate limit exceeded',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { ips: ['8.8.8.8'] },
    }, res);

    expect(state.body).toMatchObject({ localizacoes: [{ cidade: 'Mountain View' }] });
    const salvo = JSON.parse(String(fetchMock.mock.calls[4][1]?.body))[0];
    expect(salvo).toMatchObject({ cidade: 'Mountain View', status: 'erro' });
    expect(new Date(salvo.expira_em).getTime() - new Date(salvo.ultima_tentativa_em).getTime())
      .toBe(60 * 60 * 1000);
  });

  it('não envia IP privado ao serviço externo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { ips: ['192.168.0.10'] },
    }, res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ localizacoes: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
