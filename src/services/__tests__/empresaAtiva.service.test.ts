/**
 * empresaAtiva.service.test.ts
 *
 * A troca de empresa. O que estes testes protegem não é a SEGURANÇA — essa é da
 * RLS, e ela continua de pé sozinha: `fn_can_access_empresa` decide quem cruza
 * empresa, e nenhuma tela muda isso.
 *
 * O que se protege aqui é a tela não MENTIR. `empresas_select` é `(ativo = true)`:
 * qualquer usuário autenticado lê a linha de qualquer empresa. Se a escolha
 * valesse sem conferir quem é, um líder com a chave no localStorage veria o nome,
 * o logo e as cores da outra empresa com todas as telas vazias.
 *
 * Desde a migration `20260818300000` são DOIS os que cruzam: super_admin, por
 * cargo, e gerência/diretoria liberadas nominalmente. A dupla condição importa —
 * a flag sozinha não vale, e é isso que o bloco "rebaixado" cobre.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetUser = vi.fn();
const mockFrom    = vi.fn();
const mockRpc     = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (t: string) => mockFrom(t),
    rpc:  (n: string) => mockRpc(n),
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

/**
 * Cargos que o painel deixa receber a flag — o padrão de
 * `acesso_multiempresa_permitido` no catálogo.
 *
 * Está aqui, e não no serviço, porque desde 24/08/2026 quem responde é o BANCO:
 * `resolverEmpresaEscolhida` chama `fn_user_acesso_multiempresa` em vez de
 * reaplicar a regra no cliente. Estes testes passam a simular a RESPOSTA
 * daquela função, e é por isso que a lista mora no mock.
 */
const CARGOS_QUE_PODEM = ['gerencia', 'diretoria', 'administrador', 'super_admin'];

function comSessao(
  perfil: string | null,
  empresa: typeof EMPRESA_B | null = EMPRESA_B,
  acessoMultiempresa = false,
) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

  // O que `fn_user_acesso_multiempresa` responderia: chave-mestra do
  // super_admin (sem exigir flag), ou flag E cargo permitido pelo painel.
  const podeTrocar = perfil === 'super_admin'
    || (!!perfil && acessoMultiempresa && CARGOS_QUE_PODEM.includes(perfil));
  mockRpc.mockResolvedValue({ data: podeTrocar, error: null });

  mockFrom.mockImplementation((t: string) => {
    if (t === 'empresas') return tabela({ data: empresa, error: null });
    throw new Error(`tabela inesperada: ${t}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockRpc.mockReset();
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

  /** O ponto do arquivo: quem é a pessoa é o gate, não conseguir ler a empresa. */
  it('quem não atende as duas empresas não troca — e a escolha é apagada', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('lider');
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('diretoria SEM liberação não troca', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('diretoria');
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('diretoria liberada troca', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('diretoria', EMPRESA_B, true);
    expect(await resolverEmpresaEscolhida()).toEqual(EMPRESA_B);
    expect(getEmpresaEscolhida()).toBe('emp-b');
  });

  it('gerência liberada troca', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('gerencia', EMPRESA_B, true);
    expect(await resolverEmpresaEscolhida()).toEqual(EMPRESA_B);
  });

  /**
   * O caso que a dupla condição existe para cobrir: a flag sobrevive ao
   * rebaixamento, e sozinha ela não pode valer. Se valesse, um ex-gerente
   * continuaria com a outra empresa pintada na tela e nenhum dado dentro —
   * porque `fn_user_acesso_multiempresa` confere o cargo do lado do banco.
   */
  it('rebaixado com a flag ligada NÃO troca — e a escolha é apagada', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('lider', EMPRESA_B, true);
    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBeNull();
  });

  it('operador com a flag ligada também não troca', async () => {
    definirEmpresaEscolhida('emp-b');
    comSessao('operador', EMPRESA_B, true);
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
  it('erro ao perguntar o acesso mantém a escolha para a próxima tentativa', async () => {
    definirEmpresaEscolhida('emp-b');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // A pergunta é uma RPC desde 24/08/2026 — antes era uma leitura de `perfis`.
    // O que este teste protege não mudou: falha de rede não é «você não pode».
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rede' } });
    mockFrom.mockImplementation(() => tabela({ data: null, error: null }));

    expect(await resolverEmpresaEscolhida()).toBeNull();
    expect(getEmpresaEscolhida()).toBe('emp-b');
  });

  it('erro ao ler a empresa mantém a escolha', async () => {
    definirEmpresaEscolhida('emp-b');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockFrom.mockImplementation(() => tabela({ data: null, error: { message: 'rede' } }));

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
