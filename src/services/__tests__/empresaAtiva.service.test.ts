/**
 * empresaAtiva.service.test.ts
 *
 * A troca de empresa do super_admin. O que estes testes protegem não é a
 * SEGURANÇA — essa é da RLS, e ela continua de pé sozinha: `fn_can_access_empresa`
 * só deixa super_admin cruzar empresa, e nenhuma tela muda isso.
 *
 * O que se protege aqui é a tela não MENTIR. `empresas_select` é `(ativo = true)`:
 * qualquer usuário autenticado lê a linha de qualquer empresa. Se a escolha
 * valesse sem conferir cargo, um líder com a chave no localStorage veria o nome,
 * o logo e as cores da outra empresa com todas as telas vazias.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetUser = vi.fn();
const mockFrom    = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (t: string) => mockFrom(t),
  },
}));

import {
  getEmpresaEscolhida, definirEmpresaEscolhida, esquecerEmpresaEscolhida,
  resolverEmpresaEscolhida,
} from '../empresaAtiva.service';

const EMPRESA_B = { id: 'emp-b', nome: 'BOOKPLAY', slug: 'bookplay', ativo: true };

/** Encadeamento do PostgREST usado pelo serviço. */
function tabela(resposta: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    maybeSingle: () => Promise.resolve(resposta),
  };
  return chain;
}

function comSessao(perfil: string | null, empresa: typeof EMPRESA_B | null = EMPRESA_B) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockFrom.mockImplementation((t: string) => {
    if (t === 'perfis')   return tabela({ data: perfil ? { perfil } : null, error: null });
    if (t === 'empresas') return tabela({ data: empresa, error: null });
    throw new Error(`tabela inesperada: ${t}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('guardar e ler a escolha', () => {
  it('sem escolha devolve null', () => {
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('guarda e lê', () => {
    definirEmpresaEscolhida('emp-b');
    expect(getEmpresaEscolhida()).toBe('emp-b');
  });

  it('null limpa', () => {
    definirEmpresaEscolhida('emp-b');
    definirEmpresaEscolhida(null);
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('esquecer limpa', () => {
    definirEmpresaEscolhida('emp-b');
    esquecerEmpresaEscolhida();
    expect(getEmpresaEscolhida()).toBeNull();
  });
});

describe('resolver a escolha', () => {
  it('sem escolha não consulta nada', async () => {
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('super_admin recebe a empresa escolhida', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('super_admin');
    expect(await resolverEmpresaEscolhida()).toEqual(EMPRESA_B);
  });

  /** O ponto do arquivo: cargo é o gate, não conseguir ler a linha da empresa. */
  it('quem NÃO é super_admin não troca — e a escolha é apagada', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('lider');
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('diretoria também não troca', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('diretoria');
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('perfil inexistente não troca', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao(null);
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('empresa apagada ou desativada limpa a escolha', async () => {
    definirEmpresaEscolhida('emp-sumida');
    comSessao('super_admin', null);
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });
});

describe('falha não é resposta', () => {
  /**
   * Apagar a escolha porque uma consulta falhou derrubaria o super_admin
   * legítimo de volta para a empresa do domínio a cada oscilação de rede — e ele
   * não saberia por quê.
   */
  it('erro ao ler o perfil mantém a escolha para a próxima tentativa', async () => {
    definirEmpresaEscolhida('emp-b');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation(() => tabela({ data: null, error: { message: 'rede' } }));

    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBe('emp-b');
  });

  it('erro ao ler a empresa mantém a escolha', async () => {
    definirEmpresaEscolhida('emp-b');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation((t: string) => (t === 'perfis'
      ? tabela({ data: { perfil: 'super_admin' }, error: null })
      : tabela({ data: null, error: { message: 'rede' } })));

    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBe('emp-b');
  });

  it('sem sessão mantém a escolha — ainda não se sabe de quem é', async () => {
    definirEmpresaEscolhida('emp-b');
    mockGetUser.mockResolvedValue({ data: { user: null } });

    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBe('emp-b');
  });
});
