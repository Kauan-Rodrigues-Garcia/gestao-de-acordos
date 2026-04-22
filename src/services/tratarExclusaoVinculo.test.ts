/**
 * tratarExclusaoVinculo.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Testa o helper responsável por manter a consistência do par Direto+Extra
 * quando um dos lados é excluído. Exercita os 2 fluxos principais:
 *
 *   1. Exclusão do DIRETO → promove o EXTRA e notifica.
 *   2. Exclusão do EXTRA  → limpa vinculo_operador_* do DIRETO e notifica.
 *
 * Também cobre os curtos-circuitos: sem empresa_id, sem chave, par não
 * encontrado (o helper deve ser no-op e não chamar notificação nem update).
 *
 * Aqui usamos mocks do Supabase — NUNCA tocamos o banco real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Acordo } from '@/lib/supabase';

// ── Mocks dos módulos dependentes ───────────────────────────────────────────

const notificarMock   = vi.fn();
const transferirNrMock = vi.fn();

vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: (...args: unknown[]) => notificarMock(...args),
}));
vi.mock('@/services/nr_registros.service', () => ({
  transferirNr: (...args: unknown[]) => transferirNrMock(...args),
}));

// ── Mock chainable do Supabase ──────────────────────────────────────────────
//
// Strategy: cada método de filtro/update devolve o próprio builder (`this`)
// para permitir encadear N vezes. Apenas `maybeSingle()`, `update()` e
// `select()` (após update) retornam a Promise final.
//
// Controlamos o comportamento via variáveis do escopo do teste:
//   nextSelectResult   → o que .maybeSingle() da cadeia de SELECT retorna
//   nextPerfilResult   → o que o SELECT em 'perfis' retorna
//   nextUpdateError    → erro opcional a retornar em .update().eq()
//
// Além disso, o spy `fromSpy` registra todas as chamadas a `.from(...)` para
// validar quais tabelas foram tocadas e em que ordem.

type PerfilRow = { nome?: string };
type ParRow = {
  id: string;
  operador_id: string;
  vinculo_operador_id: string | null;
  vinculo_operador_nome: string | null;
  tipo_vinculo: 'direto' | 'extra' | null;
  empresa_id: string;
};

let nextSelectResult: { data: ParRow | null; error: { message: string } | null };
let nextPerfilResult: { data: PerfilRow | null; error: null };
let nextUpdateError:  { message: string } | null;

const updateCalls: Array<{ table: string; payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
const fromSpy = vi.fn();

function createChainable(table: string) {
  const filters: Array<[string, unknown]> = [];
  let mode: 'select-par' | 'select-perfil' | 'update' | null = null;
  let updatePayload: Record<string, unknown> = {};

  const chain = {
    select: vi.fn(() => {
      mode = table === 'perfis' ? 'select-perfil' : 'select-par';
      return chain;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      mode = 'update';
      updatePayload = payload;
      return chain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      if (mode === 'update') {
        // Em update, o .eq() encerra a cadeia → retorna Promise.
        updateCalls.push({ table, payload: updatePayload, filters: [...filters] });
        return Promise.resolve({ error: nextUpdateError });
      }
      return chain;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    }),
    maybeSingle: vi.fn(async () => {
      if (mode === 'select-perfil') return nextPerfilResult;
      return nextSelectResult;
    }),
  };

  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      fromSpy(table);
      return createChainable(table);
    },
  },
}));

// Importa o SUT DEPOIS dos mocks para que os vi.mock acima sejam aplicados.
import { tratarExclusaoVinculo } from './tratarExclusaoVinculo';

function mkAcordo(p: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a1', nome_cliente: 'X', nr_cliente: '777', data_cadastro: '',
    vencimento: '', valor: 100, tipo: 'boleto', parcelas: 1, whatsapp: null,
    status: 'agendado', operador_id: 'op-direto', setor_id: null,
    empresa_id: 'emp1', observacoes: null, instituicao: null,
    tipo_vinculo: 'direto', vinculo_operador_id: null, vinculo_operador_nome: null,
    criado_em: '', atualizado_em: '', ...p,
  } as Acordo;
}

beforeEach(() => {
  notificarMock.mockReset();
  transferirNrMock.mockReset();
  fromSpy.mockReset();
  updateCalls.length = 0;
  nextSelectResult = { data: null, error: null };
  nextPerfilResult = { data: { nome: 'Maria' }, error: null };
  nextUpdateError  = null;
});

// ── Casos de saída rápida (no-op) ───────────────────────────────────────────

describe('tratarExclusaoVinculo — curto-circuitos', () => {
  it('no-op quando empresa_id ausente', async () => {
    await tratarExclusaoVinculo({
      acordo: mkAcordo({ empresa_id: undefined }),
      isPaguePlay: false,
    });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(notificarMock).not.toHaveBeenCalled();
    expect(transferirNrMock).not.toHaveBeenCalled();
  });

  it('no-op quando chave (nr_cliente / instituicao) está vazia', async () => {
    await tratarExclusaoVinculo({
      acordo: mkAcordo({ nr_cliente: '', instituicao: null }),
      isPaguePlay: false,
    });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('no-op quando par não é encontrado (maybeSingle retorna null)', async () => {
    nextSelectResult = { data: null, error: null };
    await tratarExclusaoVinculo({
      acordo: mkAcordo({ tipo_vinculo: 'direto', nr_cliente: '777' }),
      isPaguePlay: false,
    });
    expect(fromSpy).toHaveBeenCalledWith('acordos'); // só o SELECT
    expect(notificarMock).not.toHaveBeenCalled();
    expect(transferirNrMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });
});

// ── Fluxo 1: exclusão do DIRETO → promove EXTRA ─────────────────────────────

describe('tratarExclusaoVinculo — exclusão do DIRETO promove o EXTRA', () => {
  it('promove o Extra, transfere nr_registros e notifica o dono do ex-extra', async () => {
    nextSelectResult = {
      data: {
        id: 'E', operador_id: 'op-extra', vinculo_operador_id: 'op-direto',
        vinculo_operador_nome: 'João', tipo_vinculo: 'extra', empresa_id: 'emp1',
      },
      error: null,
    };
    nextPerfilResult = { data: { nome: 'Maria' }, error: null };

    await tratarExclusaoVinculo({
      acordo: mkAcordo({
        id: 'D', tipo_vinculo: 'direto', operador_id: 'op-direto',
        nr_cliente: '777', empresa_id: 'emp1',
      }),
      isPaguePlay: false,
      operadorExecutorNome: 'João',
    });

    // UPDATE: o Extra foi promovido a Direto com vínculos nulos.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('acordos');
    expect(updateCalls[0].payload).toEqual({
      tipo_vinculo: 'direto',
      vinculo_operador_id: null,
      vinculo_operador_nome: null,
    });
    expect(updateCalls[0].filters).toEqual([['id', 'E']]);

    // transferirNr chamado com o novo dono do NR.
    expect(transferirNrMock).toHaveBeenCalledTimes(1);
    expect(transferirNrMock).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 'emp1',
      nrValue: '777',
      campo: 'nr_cliente',
      novoOperadorId: 'op-extra',
      novoOperadorNome: 'Maria',
      novoAcordoId: 'E',
    }));

    // Notificação enviada ao dono do ex-extra.
    expect(notificarMock).toHaveBeenCalledTimes(1);
    expect(notificarMock).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'op-extra',
      empresa_id: 'emp1',
      titulo: expect.stringContaining('EXTRA virou DIRETO'),
      mensagem: expect.stringContaining('NR 777'),
    }));
  });

  it('usa a palavra "inscrição" na mensagem quando isPaguePlay=true', async () => {
    nextSelectResult = {
      data: { id: 'E', operador_id: 'op-extra', vinculo_operador_id: null,
        vinculo_operador_nome: null, tipo_vinculo: 'extra', empresa_id: 'emp1' },
      error: null,
    };

    await tratarExclusaoVinculo({
      acordo: mkAcordo({
        id: 'D', tipo_vinculo: 'direto', instituicao: 'CR-123', nr_cliente: 'NR-IGNORADO',
      }),
      isPaguePlay: true,
    });

    expect(transferirNrMock).toHaveBeenCalledWith(expect.objectContaining({
      campo: 'instituicao',
      nrValue: 'CR-123',
    }));
    expect(notificarMock).toHaveBeenCalledWith(expect.objectContaining({
      mensagem: expect.stringContaining('inscrição CR-123'),
    }));
  });

  it('não notifica nem transfere se o UPDATE falhar', async () => {
    nextSelectResult = {
      data: { id: 'E', operador_id: 'op-extra', vinculo_operador_id: null,
        vinculo_operador_nome: null, tipo_vinculo: 'extra', empresa_id: 'emp1' },
      error: null,
    };
    nextUpdateError = { message: 'RLS denied' };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await tratarExclusaoVinculo({
      acordo: mkAcordo({ tipo_vinculo: 'direto' }),
      isPaguePlay: false,
    });

    expect(notificarMock).not.toHaveBeenCalled();
    expect(transferirNrMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── Fluxo 2: exclusão do EXTRA → limpa o DIRETO ─────────────────────────────

describe('tratarExclusaoVinculo — exclusão do EXTRA limpa o DIRETO', () => {
  it('zera vinculo_operador_* do Direto e notifica o dono dele, SEM mexer em nr_registros', async () => {
    nextSelectResult = {
      data: {
        id: 'D', operador_id: 'op-direto', vinculo_operador_id: 'op-extra',
        vinculo_operador_nome: 'Maria', tipo_vinculo: 'direto', empresa_id: 'emp1',
      },
      error: null,
    };

    await tratarExclusaoVinculo({
      acordo: mkAcordo({
        id: 'E', tipo_vinculo: 'extra', operador_id: 'op-extra',
        nr_cliente: '777', empresa_id: 'emp1',
      }),
      isPaguePlay: false,
      operadorExecutorNome: 'Maria',
    });

    // UPDATE limpou os campos de vínculo do Direto (sem mudar tipo_vinculo).
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({
      vinculo_operador_id: null,
      vinculo_operador_nome: null,
    });
    expect(updateCalls[0].filters).toEqual([['id', 'D']]);

    // Notificação ao dono do direto.
    expect(notificarMock).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'op-direto',
      titulo: expect.stringContaining('Vínculo EXTRA removido'),
    }));

    // CRÍTICO: NÃO mexe em nr_registros quando o Extra some.
    // O Direto já era titular; mantém como está.
    expect(transferirNrMock).not.toHaveBeenCalled();
  });
});
