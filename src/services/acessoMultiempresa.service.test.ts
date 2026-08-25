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

/*
 * A função recebe `temPermissao` desde 24/08/2026.
 *
 * O cargo elegível era uma lista escrita dentro dela — `gerencia || diretoria`
 * — e a mesma lista vivia dentro de `fn_user_acesso_multiempresa`, no banco.
 * Duas cópias da mesma regra é como front e banco passam a discordar; hoje as
 * duas perguntam `acesso_multiempresa_permitido`.
 *
 * A estrutura dos casos não muda: a flag por PESSOA continua obrigatória, e
 * continua não bastando sozinha.
 */
describe('perfilVeDuasEmpresas', () => {
  /** O painel concede a chave? `padrao` do catálogo: gerência e diretoria. */
  const painel = (concede: boolean) => () => concede;

  it('super_admin vê pelo cargo, sem precisar de liberação nem de chave', () => {
    expect(perfilVeDuasEmpresas({ perfil: 'super_admin' }, painel(false))).toBe(true);
    expect(perfilVeDuasEmpresas(
      { perfil: 'super_admin', acesso_multiempresa: false }, painel(false),
    )).toBe(true);
  });

  it('cargo com a chave e a flag ligadas vê', () => {
    expect(perfilVeDuasEmpresas(
      { perfil: 'gerencia', acesso_multiempresa: true }, painel(true),
    )).toBe(true);
    expect(perfilVeDuasEmpresas(
      { perfil: 'diretoria', acesso_multiempresa: true }, painel(true),
    )).toBe(true);
  });

  it('a chave sem a flag não basta — a liberação é por pessoa', () => {
    expect(perfilVeDuasEmpresas({ perfil: 'gerencia' }, painel(true))).toBe(false);
    expect(perfilVeDuasEmpresas(
      { perfil: 'diretoria', acesso_multiempresa: false }, painel(true),
    )).toBe(false);
  });

  /**
   * A flag sobrevive ao rebaixamento — e à chave sendo desligada no painel.
   * Nos dois casos o acesso cai na hora, sem ninguém precisar revogar a flag.
   */
  it('a flag sem a chave também não basta', () => {
    for (const perfil of ['operador', 'lider', 'elite', 'ouvidoria']) {
      expect(perfilVeDuasEmpresas(
        { perfil, acesso_multiempresa: true }, painel(false),
      )).toBe(false);
    }
  });

  it('sem perfil não vê', () => {
    expect(perfilVeDuasEmpresas(null, painel(true))).toBe(false);
    expect(perfilVeDuasEmpresas(undefined, painel(true))).toBe(false);
    expect(perfilVeDuasEmpresas({}, painel(true))).toBe(false);
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
      sem_permissao:      'Só o super admin pode alterar o acesso entre empresas.',
      super_admin_ja_tem: 'Super admin já enxerga todas as empresas pelo cargo.',
      // Chaves novas de 25/08, quando a concessão passou a ser por empresa.
      empresa_propria:    'Esta já é a empresa da pessoa — o acesso vem do cadastro, não de concessão.',
      empresa_nao_encontrada: 'Empresa não encontrada.',
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
