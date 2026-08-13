import handler from '../../../api/ler-acordo-imagem';

interface RespostaCapturada {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function respostaFake(): {
  state: RespostaCapturada;
  res: {
    status(code: number): unknown;
    json(data: unknown): void;
    setHeader(name: string, value: string): void;
  };
} {
  const state: RespostaCapturada = { statusCode: 200, body: null, headers: {} };
  const res = {
    status(code: number) { state.statusCode = code; return res; },
    json(data: unknown) { state.body = data; },
    setHeader(name: string, value: string) { state.headers[name] = value; },
  };
  return { state, res };
}

describe('contrato de segurança de /api/ler-acordo-imagem', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv('SUPABASE_URL', 'https://projeto.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('VISION_PROVIDER', 'openai');
    vi.stubEnv('VISION_API_KEY', 'vision-key');
    vi.stubEnv('VISION_MODEL', 'modelo-teste');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('recusa antes de qualquer chamada externa quando não há JWT', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({ method: 'POST', headers: {}, body: { imagens: ['data:image/png;base64,AA=='] } }, res);

    expect(state.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('valida sessão e perfil, consome a cota e só então chama o provedor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'user-1', ativo: true, situacao: 'ativo', arquivado: false,
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        permitido: true, restantes: 8, tentar_novamente_em_s: 0,
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"nome_cliente":"Cliente seguro"}' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer jwt-do-operador' },
      body: { origem: 'bookplay', imagens: ['data:image/png;base64,AA=='] },
    }, res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({
      configured: true,
      dados: { nome_cliente: 'Cliente seguro' },
    });
    expect(state.headers['X-RateLimit-Remaining']).toBe('8');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      apikey: 'publishable-key',
      Authorization: 'Bearer jwt-do-operador',
    });
    expect(fetchMock.mock.calls[2][0]).toContain('/rpc/fn_api_rate_limit_consumir');
    expect(fetchMock.mock.calls[3][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('responde 429 e não chama o provedor quando a cota terminou', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'user-1', ativo: true, situacao: 'ativo', arquivado: false,
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        permitido: false, restantes: 0, tentar_novamente_em_s: 41,
      }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer jwt-do-operador' },
      body: { imagens: ['data:image/jpeg;base64,AA=='] },
    }, res);

    expect(state.statusCode).toBe(429);
    expect(state.headers['Retry-After']).toBe('41');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
