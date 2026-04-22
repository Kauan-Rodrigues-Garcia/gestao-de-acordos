import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autenticarLider } from './autorizacao_lider.service';

describe('autenticarLider', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    // Alternativa pedida no prompt:
    // import.meta.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
    // import.meta.env.VITE_SUPABASE_ANON_KEY = 'anon';
  });

  it('campos vazios: email="" ou senha="" → { ok:false, erro contém "e-mail" }', async () => {
    const res1 = await autenticarLider({ email: '', senha: '123' });
    const res2 = await autenticarLider({ email: 'a@a.com', senha: '' });

    expect(res1.ok).toBe(false);
    expect(res1.erro).toMatch(/e-mail/i);
    expect(res2.ok).toBe(false);
    expect(res2.erro).toMatch(/e-mail/i);
  });

  it('sucesso: mock global fetch duas vezes → { ok:true, autorizador: {uid:"abc", nome:"João", perfil:"lider", token:"tk"} }', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }) 
      })
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => [{ perfil: 'lider', nome: 'João' }] 
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'lider@test.com', senha: 'password' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.autorizador).toEqual({
        uid: 'abc',
        nome: 'João',
        perfil: 'lider',
        token: 'tk'
      });
    }
  });

  it('credenciais inválidas: primeiro fetch retorna 401 → { ok:false, erro:"Credenciais do líder inválidas" }', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ 
        ok: false, 
        status: 401, 
        json: async () => ({ error: 'invalid_credentials' }) 
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'wrong@test.com', senha: 'wrong' });

    expect(res.ok).toBe(false);
    expect(res.erro).toBe('Credenciais do líder inválidas');
  });

  it('perfil não autorizado: auth ok + perfil="operador" → { ok:false, erro contém "permissão" }', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }) 
      })
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => [{ perfil: 'operador', nome: 'Zezinho' }] 
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'op@test.com', senha: 'password' });

    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/permissão/i);
  });

  it('perfil elite autorizado: auth ok + perfil="elite" → ok:true', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }) 
      })
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => [{ perfil: 'elite', nome: 'Elite User' }] 
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'elite@test.com', senha: 'password' });

    expect(res.ok).toBe(true);
  });

  it('perfil gerencia autorizado: auth ok + perfil="gerencia" → ok:true', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }) 
      })
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => [{ perfil: 'gerencia', nome: 'Gerente' }] 
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'ger@test.com', senha: 'password' });

    expect(res.ok).toBe(true);
  });

  it('erro ao buscar perfil: auth ok + segundo fetch retorna 500 → { ok:false }', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ 
        ok: true, 
        status: 200, 
        json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }) 
      })
      .mockResolvedValueOnce({ 
        ok: false, 
        status: 500, 
        json: async () => ({ error: 'server_error' }) 
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'lider@test.com', senha: 'password' });

    expect(res.ok).toBe(false);
  });
});
