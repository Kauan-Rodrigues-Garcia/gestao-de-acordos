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

// ── A lista de autorizadores tem que bater com a do servidor ─────────────────
//
// Existiam QUATRO listas para a mesma pergunta e elas divergiam: gerência e
// elite eram recusadas no AcordoForm e aceitas no AcordoNovoInline, a diretoria
// não conseguia autorizar em lugar nenhum (o servidor aceita) e a ouvidoria
// passava no cliente para ser recusada pelo servidor depois. Daí "alguns
// líderes conseguem, outros não".
//
// `PERFIS_AUTORIZADORES` (lib/index) espelha `fn_transferir_acordo_nr`
// (migration 20260728a) cargo a cargo. Estes testes são a trava.

function mockAuthComPerfil(perfil: string) {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }),
    })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => [{ perfil, nome: `Fulano ${perfil}` }],
    }) as unknown as typeof fetch;
}

describe('autenticarLider — cargos aceitos espelham o servidor', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // O servidor aceita estes seis em fn_transferir_acordo_nr.
  for (const cargo of ['lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin']) {
    it(`aceita "${cargo}"`, async () => {
      mockAuthComPerfil(cargo);
      const res = await autenticarLider({ email: 'x@test.com', senha: 'senha' });
      expect(res.ok).toBe(true);
    });
  }

  it('aceita diretoria — o servidor aceita, e o cliente recusava', async () => {
    mockAuthComPerfil('diretoria');
    const res = await autenticarLider({ email: 'dir@test.com', senha: 'senha' });
    expect(res.ok).toBe(true);
  });

  it('recusa ouvidoria — o cliente aceitava e o servidor recusava depois', async () => {
    mockAuthComPerfil('ouvidoria');
    const res = await autenticarLider({ email: 'ouv@test.com', senha: 'senha' });
    expect(res.ok).toBe(false);
  });

  it('recusa operador', async () => {
    mockAuthComPerfil('operador');
    const res = await autenticarLider({ email: 'op@test.com', senha: 'senha' });
    expect(res.ok).toBe(false);
  });

  it('a recusa nomeia o cargo, para o líder saber por que foi barrado', async () => {
    mockAuthComPerfil('operador');
    const res = await autenticarLider({ email: 'op@test.com', senha: 'senha' });
    if ('erro' in res) expect(res.erro).toMatch(/Operador/i);
    else throw new Error('deveria ter recusado');
  });
});
