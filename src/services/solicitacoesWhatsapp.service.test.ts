/**
 * solicitacoesWhatsapp.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixa os pontos do service onde errar tem consequência visível:
 *
 *   • o erro do trigger de limite vira mensagem legível (senão o operador leva
 *     um texto de exceção do postgres na cara);
 *   • `marcarMensagensLidas` NUNCA marca a própria mensagem — é o que mantém o
 *     recibo de leitura honesto, e espelha a policy de UPDATE;
 *   • `dbAtiva` separa "migration pendente" de "erro real";
 *   • definir responsável duas vezes não é erro para quem clicou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase (padrão thenable do projeto) ───────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

let nextResult: MockResult = { data: null, error: null };
let nextRpcResult: MockResult = { data: null, error: null };

interface BuilderCall {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | null;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
  order?: { col: string };
}

const calls: BuilderCall[] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];
let currentCall: BuilderCall | null = null;

function createBuilder(table: string) {
  currentCall = { table, operation: null, filters: [] };
  calls.push(currentCall);

  const builder = {
    select: vi.fn(() => { currentCall!.operation = 'select'; return builder; }),
    insert: vi.fn((p: unknown) => { currentCall!.operation = 'insert'; currentCall!.payload = p; return builder; }),
    update: vi.fn((p: unknown) => { currentCall!.operation = 'update'; currentCall!.payload = p; return builder; }),
    delete: vi.fn(() => { currentCall!.operation = 'delete'; return builder; }),
    eq:     vi.fn((c: string, v: unknown) => { currentCall!.filters.push(['eq', c, v]); return builder; }),
    neq:    vi.fn((c: string, v: unknown) => { currentCall!.filters.push(['neq', c, v]); return builder; }),
    is:     vi.fn((c: string, v: unknown) => { currentCall!.filters.push(['is', c, v]); return builder; }),
    order:  vi.fn((c: string) => { currentCall!.order = { col: c }; return builder; }),
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((t: string) => createBuilder(t)),
    rpc:  vi.fn((fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(nextRpcResult);
    }),
  },
}));

import {
  buscarSolicitacoes, criarSolicitacao, atualizarStatus,
  marcarMensagensLidas, definirResponsavel, buscarClientePorCodigo,
  ehErroLimitePendentes, MAX_PENDENTES, STATUS_EM_ABERTO,
} from './solicitacoesWhatsapp.service';

const EMPRESA = 'emp-1';

beforeEach(() => {
  calls.length    = 0;
  rpcCalls.length = 0;
  currentCall     = null;
  nextResult      = { data: null, error: null };
  nextRpcResult   = { data: null, error: null };
});

// ── Constantes de domínio ───────────────────────────────────────────────────

describe('constantes', () => {
  it('em aberto = tudo que não é "feito"', () => {
    expect(STATUS_EM_ABERTO).toEqual(['pendente', 'em_andamento', 'falta_info']);
    expect(STATUS_EM_ABERTO).not.toContain('feito');
  });

  it('o teto de pendentes é 10, igual ao trigger', () => {
    expect(MAX_PENDENTES).toBe(10);
  });
});

// ── Listagem ────────────────────────────────────────────────────────────────

describe('buscarSolicitacoes', () => {
  it('filtra por empresa e ordena por data desc', async () => {
    nextResult = { data: [], error: null };

    await buscarSolicitacoes({ empresaId: EMPRESA });

    expect(calls[0].table).toBe('solicitacoes_whatsapp');
    expect(calls[0].filters).toEqual([['eq', 'empresa_id', EMPRESA]]);
    expect(calls[0].order).toEqual({ col: 'criado_em' });
  });

  it('aplica setor e equipe quando informados', async () => {
    nextResult = { data: [], error: null };

    await buscarSolicitacoes({ empresaId: EMPRESA, setorId: 's1', equipeId: 'e1' });

    expect(calls[0].filters).toEqual([
      ['eq', 'empresa_id', EMPRESA],
      ['eq', 'setor_id', 's1'],
      ['eq', 'equipe_id', 'e1'],
    ]);
  });

  it('não filtra por papel — quem decide é a RLS', async () => {
    nextResult = { data: [], error: null };
    await buscarSolicitacoes({ empresaId: EMPRESA });
    // Nenhum filtro por solicitante_id: duplicar a regra no cliente criaria uma
    // segunda verdade para divergir da policy.
    expect(calls[0].filters.some(f => f[1] === 'solicitante_id')).toBe(false);
  });

  it('migration pendente → dbAtiva false e sem erro na tela', async () => {
    nextResult = { data: null, error: { message: 'relation "solicitacoes_whatsapp" does not exist' } };

    const r = await buscarSolicitacoes({ empresaId: EMPRESA });

    expect(r.dbAtiva).toBe(false);
    expect(r.erro).toBeNull();
    expect(r.data).toEqual([]);
  });

  it('erro real → dbAtiva true e mensagem preservada', async () => {
    nextResult = { data: null, error: { message: 'permission denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await buscarSolicitacoes({ empresaId: EMPRESA });

    expect(r.dbAtiva).toBe(true);
    expect(r.erro).toBe('permission denied');
    warn.mockRestore();
  });
});

// ── Criação e limite ────────────────────────────────────────────────────────

describe('criarSolicitacao', () => {
  const base = {
    empresaId: EMPRESA, solicitanteId: 'u1', setorId: 's1', equipeId: 'e1',
    codigoCliente: ' 123 ', nomeCliente: ' Fulano ', estadoUf: 'SP',
    whatsapp: ' 11999998888 ', categoria: 'proposta' as const, mensagem: ' oi ',
  };

  it('grava os campos com trim', async () => {
    nextResult = { data: null, error: null };

    const r = await criarSolicitacao(base);

    expect(r.ok).toBe(true);
    expect(calls[0].payload).toMatchObject({
      empresa_id: EMPRESA,
      solicitante_id: 'u1',
      codigo_cliente: '123',
      nome_cliente: 'Fulano',
      whatsapp: '11999998888',
      mensagem: 'oi',
    });
  });

  it('campo de texto vazio vira null, não string vazia', async () => {
    nextResult = { data: null, error: null };
    await criarSolicitacao({ ...base, nomeCliente: '   ', estadoUf: '' });
    expect(calls[0].payload).toMatchObject({ nome_cliente: null, estado_uf: null });
  });

  it('traduz o erro do trigger de limite para linguagem de gente', async () => {
    nextResult = {
      data: null,
      error: { message: 'LIMITE_PENDENTES: voce ja tem 10 solicitacoes pendentes (maximo 10).' },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await criarSolicitacao(base);

    expect(r.ok).toBe(false);
    // Sem a tradução, o operador veria o texto cru da exceção do postgres.
    expect(r.erro).toContain(`${MAX_PENDENTES} solicitações pendentes`);
    expect(r.erro).not.toContain('LIMITE_PENDENTES');
    warn.mockRestore();
  });

  it('ehErroLimitePendentes reconhece o prefixo do trigger', () => {
    expect(ehErroLimitePendentes('LIMITE_PENDENTES: ...')).toBe(true);
    expect(ehErroLimitePendentes('outra coisa')).toBe(false);
  });
});

// ── Status ──────────────────────────────────────────────────────────────────

describe('atualizarStatus', () => {
  it('manda só o status quando não há troca de responsável', async () => {
    nextResult = { data: null, error: null };

    await atualizarStatus({ id: 'sol-1', status: 'feito' });

    expect(calls[0].operation).toBe('update');
    expect(calls[0].payload).toEqual({ status: 'feito' });
    expect(calls[0].filters).toEqual([['eq', 'id', 'sol-1']]);
  });

  it('inclui responsavel_id quando informado', async () => {
    nextResult = { data: null, error: null };

    await atualizarStatus({ id: 'sol-1', status: 'em_andamento', responsavelId: 'u9' });

    expect(calls[0].payload).toEqual({ status: 'em_andamento', responsavel_id: 'u9' });
  });

  it('responsavelId null limpa o campo (undefined não mexe)', async () => {
    nextResult = { data: null, error: null };
    await atualizarStatus({ id: 'sol-1', status: 'pendente', responsavelId: null });
    expect(calls[0].payload).toEqual({ status: 'pendente', responsavel_id: null });
  });
});

// ── Recibo de leitura ───────────────────────────────────────────────────────

describe('marcarMensagensLidas', () => {
  it('nunca marca a própria mensagem como lida', async () => {
    nextResult = { data: null, error: null };

    await marcarMensagensLidas({ solicitacaoId: 'sol-1', usuarioId: 'u1' });

    expect(calls[0].operation).toBe('update');
    // O `neq autor_id` é o que impede o autor de inflar o próprio ✓✓ — e é o
    // mesmo predicado da policy de UPDATE.
    expect(calls[0].filters).toEqual([
      ['eq',  'solicitacao_id', 'sol-1'],
      ['neq', 'autor_id',       'u1'],
      ['is',  'lida_em',        null],
    ]);
  });

  it('carimba lida_em com um ISO', async () => {
    nextResult = { data: null, error: null };
    await marcarMensagensLidas({ solicitacaoId: 'sol-1', usuarioId: 'u1' });
    const payload = calls[0].payload as { lida_em: string };
    expect(new Date(payload.lida_em).toString()).not.toBe('Invalid Date');
  });
});

// ── Responsáveis ────────────────────────────────────────────────────────────

describe('definirResponsavel', () => {
  it('grava quem definiu', async () => {
    nextResult = { data: null, error: null };

    await definirResponsavel({ empresaId: EMPRESA, usuarioId: 'u2', definidoPor: 'lider-1' });

    expect(calls[0].table).toBe('atendimento_responsaveis');
    expect(calls[0].payload).toEqual({
      empresa_id: EMPRESA, usuario_id: 'u2', definido_por: 'lider-1',
    });
  });

  it('já ser responsável não é erro para quem clicou', async () => {
    nextResult = {
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    };

    const r = await definirResponsavel({ empresaId: EMPRESA, usuarioId: 'u2', definidoPor: 'l1' });

    expect(r.ok).toBe(true);
    expect(r.erro).toBeNull();
  });

  it('erro de verdade continua sendo erro', async () => {
    nextResult = { data: null, error: { message: 'row-level security' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await definirResponsavel({ empresaId: EMPRESA, usuarioId: 'u2', definidoPor: 'l1' });

    expect(r.ok).toBe(false);
    warn.mockRestore();
  });
});

// ── Auto-preenchimento ──────────────────────────────────────────────────────

describe('buscarClientePorCodigo', () => {
  it('chama a RPC com o código sem espaços', async () => {
    nextRpcResult = { data: [], error: null };

    await buscarClientePorCodigo('  777  ');

    expect(rpcCalls[0]).toEqual({ fn: 'fn_wpp_buscar_cliente', args: { p_codigo: '777' } });
  });

  it('código vazio nem chama o banco', async () => {
    const r = await buscarClientePorCodigo('   ');
    expect(r).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });

  it('normaliza qtd_acordos vindo como string', async () => {
    // COUNT(*) volta como string; sem Number() o aviso de "vários acordos"
    // compararia string com número e nunca dispararia.
    nextRpcResult = {
      data: [{ nome_cliente: 'Fulano', estado_uf: 'SP', whatsapp: '119', qtd_acordos: '3' }],
      error: null,
    };

    const r = await buscarClientePorCodigo('777');

    expect(r?.qtd_acordos).toBe(3);
    expect(r?.nome_cliente).toBe('Fulano');
  });

  it('código sem acordo devolve null', async () => {
    nextRpcResult = { data: [], error: null };
    expect(await buscarClientePorCodigo('999')).toBeNull();
  });

  it('RPC ausente (migration pendente) devolve null sem barulho', async () => {
    nextRpcResult = { data: null, error: { message: 'function fn_wpp_buscar_cliente does not exist' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await buscarClientePorCodigo('777')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
