import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthClient } from '@supabase/auth-js';
import { criarFetchAuth } from './fetchAuth';

const URL_AUTH = 'https://projeto.supabase.co/auth/v1';

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

/** Resposta de token como o GoTrue manda: `expires_at` no relógio do servidor. */
function sessaoDoServidor(agoraServidorSeg: number, token = 'acesso-1') {
  return {
    access_token: token,
    refresh_token: `renova-${token}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agoraServidorSeg + 3600,
    user: { id: 'u1', aud: 'authenticated', email: 'ana@x.com', app_metadata: {}, user_metadata: {}, created_at: '' },
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('criarFetchAuth', () => {
  it('tira o expires_at do servidor das respostas de token', async () => {
    const base = vi.fn(async () => json(sessaoDoServidor(1_000)));
    const r = await criarFetchAuth(base)(`${URL_AUTH}/token?grant_type=password`, { method: 'POST' });
    const corpo = await r.json();
    expect(corpo.expires_at).toBeUndefined();
    expect(corpo.expires_in).toBe(3600);
    expect(corpo.access_token).toBe('acesso-1');
  });

  it('429 na renovação vira 503 (falha passageira para o auth-js)', async () => {
    const base = vi.fn(async () => json({ code: 'over_request_rate_limit' }, 429));
    const r = await criarFetchAuth(base)(`${URL_AUTH}/token?grant_type=refresh_token`, { method: 'POST' });
    expect(r.status).toBe(503);
  });

  it('429 no login por senha continua 429 (a tela mostra o erro)', async () => {
    const base = vi.fn(async () => json({ code: 'over_request_rate_limit' }, 429));
    const r = await criarFetchAuth(base)(`${URL_AUTH}/token?grant_type=password`, { method: 'POST' });
    expect(r.status).toBe(429);
  });

  it('400 na renovação (token inválido de verdade) passa como veio', async () => {
    const base = vi.fn(async () => json({ code: 'refresh_token_not_found' }, 400));
    const r = await criarFetchAuth(base)(`${URL_AUTH}/token?grant_type=refresh_token`, { method: 'POST' });
    expect(r.status).toBe(400);
  });

  it('não toca no que não é emissão de token', async () => {
    const original = json({ expires_at: 1, expires_in: 2 });
    const base = vi.fn(async () => original);
    const r = await criarFetchAuth(base)('https://projeto.supabase.co/rest/v1/perfis', {});
    expect(r).toBe(original);
  });
});

describe('GoTrueClient com o fetch da borda', () => {
  function cliente(base: typeof fetch, memoria = new Map<string, string>()) {
    return new AuthClient({
      url: URL_AUTH,
      fetch: criarFetchAuth(base),
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => memoria.get(k) ?? null,
        setItem: (k, v) => { memoria.set(k, v); },
        removeItem: (k) => { memoria.delete(k); },
      },
      lock: async (_n, _t, fn) => fn(),
    });
  }

  it('relógio adiantado 2 h: o token recém-emitido não é renovado em loop', async () => {
    const agoraReal = Math.floor(Date.now() / 1000);
    vi.useFakeTimers({ now: Date.now() + 2 * 3600 * 1000, toFake: ['Date'] });
    const renovacoes = vi.fn();
    const base = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('grant_type=refresh_token')) renovacoes();
      return json(sessaoDoServidor(agoraReal));
    }) as unknown as typeof fetch;

    const auth = cliente(base);
    const { error } = await auth.signInWithPassword({ email: 'ana@x.com', password: 'x' });
    expect(error).toBeNull();
    for (let i = 0; i < 5; i++) {
      const { data } = await auth.getSession();
      expect(data.session?.access_token).toBe('acesso-1');
    }
    expect(renovacoes).not.toHaveBeenCalled();
  });

  it('429 na renovação não apaga a sessão', async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const base = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('grant_type=refresh_token')) return json({ code: 'over_request_rate_limit' }, 429);
      return json(sessaoDoServidor(Math.floor(Date.now() / 1000)));
    }) as unknown as typeof fetch;

    const memoria = new Map<string, string>();
    const auth = cliente(base, memoria);
    const saidas = vi.fn();
    auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') saidas(); });
    await auth.signInWithPassword({ email: 'ana@x.com', password: 'x' });

    // Passa da validade: o próximo getSession precisa renovar, e o GoTrue recusa.
    vi.setSystemTime(Date.now() + 3600 * 1000);
    const leitura = auth.getSession();
    await vi.runAllTimersAsync();
    const { data } = await leitura;

    expect(data.session).toBeNull();      // esta leitura fica sem token...
    expect(saidas).not.toHaveBeenCalled(); // ...mas ninguém é desconectado
    expect([...memoria.values()].some(v => v.includes('renova-acesso-1'))).toBe(true);
  });
});
