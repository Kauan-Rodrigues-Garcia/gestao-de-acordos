/**
 * acessoMultiempresa.service.test.ts
 *
 * Duas coisas se protegem aqui.
 *
 * A primeira é `perfilVeDuasEmpresas`, que decide se o botão de trocar de
 * empresa aparece. Ela espelha `fn_user_acesso_multiempresa` no banco, e as duas
 * TÊM que dizer o mesmo: uma tela que oferece a troca e um banco que recusa os
 * dados é pior que não ter o botão. Por isso a bateria cobre cargo por cargo, e
 * principalmente o rebaixado — a flag sobrevive ao rebaixamento e sozinha não
 * pode valer.
 *
 * A segunda é a tradução do `erro` do banco. As RPCs devolvem chave curta
 * (`sem_permissao`, `cargo_nao_elegivel`); quem vê a tela precisa de frase.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (nome: string, args: Record<string, unknown>) => mockRpc(nome, args),
}));

import {
  perfilVeDuasEmpresas, listarAcessoMultiempresa, listarCandidatosMultiempresa,
  definirAcessoMultiempresa,
} from './acessoMultiempresa.service';

beforeEach(() => {
  mockRpc.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ── perfilVeDuasEmpresas ────────────────────────────────────────────────────

describe('perfilVeDuasEmpresas', () => {
  it('super_admin vê pelo cargo, sem precisar de liberação', () => {
    expect(perfilVeDuasEmpresas({ perfil: 'super_admin' })).toBe(true);
    expect(perfilVeDuasEmpresas({ perfil: 'super_admin', acesso_multiempresa: false })).toBe(true);
  });

  it('gerência e diretoria liberadas veem', () => {
    expect(perfilVeDuasEmpresas({ perfil: 'gerencia',  acesso_multiempresa: true })).toBe(true);
    expect(perfilVeDuasEmpresas({ perfil: 'diretoria', acesso_multiempresa: true })).toBe(true);
  });

  it('gerência e diretoria SEM liberação não veem', () => {
    expect(perfilVeDuasEmpresas({ perfil: 'gerencia'  })).toBe(false);
    expect(perfilVeDuasEmpresas({ perfil: 'diretoria', acesso_multiempresa: false })).toBe(false);
  });

  /** A flag sobrevive ao rebaixamento; o cargo atual é que decide. */
  it('cargo não elegível com a flag ligada não vê', () => {
    for (const perfil of ['operador', 'lider', 'elite', 'administrador', 'ouvidoria']) {
      expect(perfilVeDuasEmpresas({ perfil, acesso_multiempresa: true })).toBe(false);
    }
  });

  it('sem perfil não vê', () => {
    expect(perfilVeDuasEmpresas(null)).toBe(false);
    expect(perfilVeDuasEmpresas(undefined)).toBe(false);
    expect(perfilVeDuasEmpresas({})).toBe(false);
  });
});

// ── Leitura ─────────────────────────────────────────────────────────────────

describe('listar', () => {
  it('devolve a lista do banco', async () => {
    mockRpc.mockResolvedValue({ data: [{ usuario_id: 'u1', nome: 'Ana' }], error: null });
    const r = await listarAcessoMultiempresa();
    expect(r).toHaveLength(1);
    expect(mockRpc).toHaveBeenCalledWith('fn_multiempresa_listar', {});
  });

  /** Lista vazia é o que um não-super_admin recebe: a RPC filtra, não erra. */
  it('erro vira lista vazia, não exceção', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect(await listarAcessoMultiempresa()).toEqual([]);
  });

  it('candidatos: null do banco vira lista vazia', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await listarCandidatosMultiempresa()).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('fn_multiempresa_elegiveis', {});
  });
});

// ── Escrita ─────────────────────────────────────────────────────────────────

describe('definir', () => {
  it('manda usuário e decisão para a RPC', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, liberado: true, nome: 'Ana' }, error: null });
    const r = await definirAcessoMultiempresa('u1', true);
    expect(r).toEqual({ ok: true, liberado: true, nome: 'Ana' });
    expect(mockRpc).toHaveBeenCalledWith('fn_multiempresa_definir', {
      p_usuario_id: 'u1', p_liberado: true,
    });
  });

  it('revogar passa false', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, liberado: false, nome: 'Ana' }, error: null });
    const r = await definirAcessoMultiempresa('u1', false);
    expect('ok' in r && r.ok).toBe(true);
    expect(mockRpc.mock.calls[0][1]).toEqual({ p_usuario_id: 'u1', p_liberado: false });
  });

  it('traduz as recusas do banco', async () => {
    const casos: Record<string, string> = {
      sem_permissao:      'Só o super admin pode alterar o acesso às duas empresas.',
      cargo_nao_elegivel: 'Só gerência e diretoria podem receber acesso às duas empresas.',
      super_admin_ja_tem: 'Super admin já enxerga as duas empresas pelo cargo.',
    };
    for (const [chave, frase] of Object.entries(casos)) {
      mockRpc.mockResolvedValue({ data: { ok: false, erro: chave }, error: null });
      const r = await definirAcessoMultiempresa('u1', true);
      expect('erro' in r ? r.erro : '').toBe(frase);
    }
  });

  /** Chave desconhecida não pode vazar crua para a tela. */
  it('recusa sem tradução vira frase genérica', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, erro: 'algo_novo' }, error: null });
    const r = await definirAcessoMultiempresa('u1', true);
    expect('erro' in r ? r.erro : '').toBe('Não foi possível salvar.');
  });

  it('falha de rede não é tratada como recusa de permissão', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    const r = await definirAcessoMultiempresa('u1', true);
    expect('erro' in r ? r.erro : '').toBe('Não foi possível salvar. Tente novamente.');
  });
});
