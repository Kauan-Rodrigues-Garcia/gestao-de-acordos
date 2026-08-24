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
      })
      // 3o fetch: a pergunta ao painel (fn_user_tem), com o token do lider.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => true }) as unknown as typeof fetch;

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
      })
      // 3o fetch: a pergunta ao painel (fn_user_tem), com o token do lider.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => false }) as unknown as typeof fetch;

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
      })
      // 3o fetch: a pergunta ao painel (fn_user_tem), com o token do lider.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => true }) as unknown as typeof fetch;

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
      })
      // 3o fetch: a pergunta ao painel (fn_user_tem), com o token do lider.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => true }) as unknown as typeof fetch;

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

// ── Quem autoriza é decisão do painel, não do código ────────────────────────
//
// Existiam QUATRO listas para a mesma pergunta e elas divergiam: gerência e
// elite eram recusadas no AcordoForm e aceitas no AcordoNovoInline, a diretoria
// não conseguia autorizar em lugar nenhum (o servidor aceita) e a ouvidoria
// passava no cliente para ser recusada pelo servidor depois. Daí "alguns
// líderes conseguem, outros não".
//
// A primeira correção juntou as quatro em `PERFIS_AUTORIZADORES` (lib/index),
// espelhando `fn_transferir_acordo_nr`. Resolveu a divergência e deixou o
// problema de fundo: liberar mais uma pessoa continuava exigindo um deploy.
//
// Em 24/08/2026 a lista virou a chave `acordos_autorizar_tabulacao`. Cliente e
// servidor perguntam a MESMA chave, e o cargo deixou de decidir — inclusive
// para menos: um líder com a chave desligada é recusado aqui.



/**
 * Os TRÊS fetches do fluxo, na ordem: autenticar, ler o perfil, perguntar ao
 * painel.
 *
 * O terceiro entrou em 24/08/2026. Antes o serviço conferia o cargo contra
 * `PERFIS_AUTORIZADORES`, uma lista em `lib/index.ts`; agora chama
 * `fn_user_tem('acordos_autorizar_tabulacao')` COM O TOKEN DO LÍDER — então o
 * `auth.uid()` lá dentro é o dele, e a exceção por pessoa vale.
 */
function mockAuthComPerfil(perfil: string, podeAutorizar = true) {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }),
    })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => [{ perfil, nome: `Fulano ${perfil}` }],
    })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => podeAutorizar,
    }) as unknown as typeof fetch;
}

describe('autenticarLider — quem autoriza sai do painel', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // Os seis que o padrão da chave concede (liderança + acesso total), e que
  // `fn_transferir_acordo_nr` também aceita — as duas pontas leem a mesma chave.
  for (const cargo of ['lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin']) {
    it(`aceita "${cargo}" quando o painel concede`, async () => {
      mockAuthComPerfil(cargo);
      const res = await autenticarLider({ email: 'x@test.com', senha: 'senha' });
      expect(res.ok).toBe(true);
    });
  }

  /*
   * A trava que dá sentido à conversão: o CARGO não decide mais nada. Um líder
   * com a chave desligada é recusado, e um operador com ela ligada passa.
   *
   * Era impossível antes — a lista de cargos estava no código, e liberar uma
   * pessoa exigia promovê-la.
   */
  it('recusa um líder quando o painel nega, apesar do cargo', async () => {
    mockAuthComPerfil('lider', false);
    const res = await autenticarLider({ email: 'lid@test.com', senha: 'senha' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erro).toMatch(/permissão/i);
  });

  it('aceita um operador quando o painel concede', async () => {
    mockAuthComPerfil('operador', true);
    const res = await autenticarLider({ email: 'op@test.com', senha: 'senha' });
    expect(res.ok).toBe(true);
  });

  /** Falha de rede na pergunta reprova: autorizar por engano libera NR. */
  it('erro ao perguntar ao painel recusa, em vez de liberar', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ user: { id: 'abc' }, access_token: 'tk' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => [{ perfil: 'lider', nome: 'João' }],
      })
      .mockResolvedValueOnce({
        ok: false, status: 500, json: async () => null,
      }) as unknown as typeof fetch;

    const res = await autenticarLider({ email: 'x@test.com', senha: 'senha' });
    expect(res.ok).toBe(false);
  });

  it('aceita diretoria — o servidor aceita, e o cliente recusava', async () => {
    mockAuthComPerfil('diretoria');
    const res = await autenticarLider({ email: 'dir@test.com', senha: 'senha' });
    expect(res.ok).toBe(true);
  });

  it('recusa ouvidoria quando o painel nega — o padrão da chave a deixa de fora', async () => {
    mockAuthComPerfil('ouvidoria', false);
    const res = await autenticarLider({ email: 'ouv@test.com', senha: 'senha' });
    expect(res.ok).toBe(false);
  });

  it('recusa operador quando o painel nega', async () => {
    mockAuthComPerfil('operador', false);
    const res = await autenticarLider({ email: 'op@test.com', senha: 'senha' });
    expect(res.ok).toBe(false);
  });

  it('a recusa nomeia o cargo, para o líder saber por que foi barrado', async () => {
    mockAuthComPerfil('operador', false);
    const res = await autenticarLider({ email: 'op@test.com', senha: 'senha' });
    if ('erro' in res) expect(res.erro).toMatch(/Operador/i);
    else throw new Error('deveria ter recusado');
  });
});
