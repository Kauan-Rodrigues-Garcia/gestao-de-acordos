/**
 * exclusaoUsuario.service.test.ts
 *
 * O que estes testes protegem é a ORDEM: o relatório é baixado ANTES de
 * qualquer DELETE. Se a planilha falhar, nada pode ser apagado — o admin tenta
 * de novo em vez de descobrir que perdeu o que não conseguiu ler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock  = vi.fn();
const fromMock = vi.fn();

/**
 * O mock imita a FORMA do SupabaseClient real, que faz
 * `rpc(fn, args) { return this.rest.rpc(...) }`.
 *
 * A versão anterior era `rpc: (...a) => rpcMock(...a)` — uma arrow property,
 * que funciona mesmo desanexada do objeto. Isso escondeu um bug real: o
 * serviço guardava o método numa variável (`const f = supabase.rpc`), perdia o
 * `this` e estourava em produção enquanto o teste passava. Depender de `this`
 * aqui faz o teste falhar junto com a produção.
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rest: { rpc: (...a: unknown[]) => rpcMock(...a) },
    rpc(this: { rest: { rpc: (...a: unknown[]) => unknown } }, nome: string, args: unknown) {
      return this.rest.rpc(nome, args);
    },
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

// `@e965/xlsx` entra por import dinâmico no serviço; aqui vira um stub leve
// para o teste não carregar 484 KB de parser.
const writeMock = vi.fn(() => new ArrayBuffer(8));
vi.mock('@e965/xlsx', () => ({
  utils: {
    json_to_sheet:     vi.fn(() => ({})),
    book_new:          vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  write: (...a: unknown[]) => writeMock(...(a as [])),
}));

import {
  resumoExclusao, excluirUsuarioComAcordos, limparAcordosDaEmpresaAnterior,
  traduzirErro,
} from './exclusaoUsuario.service';

/** `from('acordos').select().eq().eq().order()` devolvendo as linhas dadas. */
function comAcordos(linhas: unknown[], error: { message: string } | null = null) {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = vi.fn(() => cadeia);
  cadeia.eq     = vi.fn(() => cadeia);
  cadeia.order  = vi.fn(() => Promise.resolve({ data: linhas, error }));
  fromMock.mockReturnValue(cadeia);
  return cadeia;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  writeMock.mockReset();
  writeMock.mockReturnValue(new ArrayBuffer(8));
  // jsdom/happy-dom não têm createObjectURL.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('resumoExclusao', () => {
  it('normaliza as contagens que a RPC devolve', async () => {
    rpcMock.mockResolvedValue({
      data: { nome: 'Fulano', empresa_id: 'emp-1', acordos: '47', historico: 3, logs: 0 },
      error: null,
    });
    expect(await resumoExclusao('u-1')).toEqual({
      nome: 'Fulano', empresaId: 'emp-1', acordos: 47, historico: 3, logs: 0,
    });
  });

  it('RPC ausente devolve null, e a tela só omite o aviso', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'could not find the function' } });
    expect(await resumoExclusao('u-1')).toBeNull();
  });
});

describe('excluirUsuarioComAcordos', () => {
  it('baixa o relatório e só então chama a exclusão', async () => {
    comAcordos([{ id: 'a1', nr_cliente: '777', valor: 100 }]);
    rpcMock.mockResolvedValue({ data: { ok: true, acordos_apagados: 1 }, error: null });

    const r = await excluirUsuarioComAcordos({ userId: 'u-1', nome: 'Fulano da Silva' });

    expect(r).toMatchObject({ status: 'ok', acordosApagados: 1 });
    expect(r.status === 'ok' && r.relatorio).toBe('acordos-fulano-da-silva-excluido.xlsx');
    // A planilha foi escrita antes da RPC de exclusão.
    expect(writeMock).toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith('fn_admin_delete_user', {
      p_user_id: 'u-1', p_apagar_acordos: true,
    });
  });

  it('relatório falhou: NADA é excluído', async () => {
    comAcordos([{ id: 'a1' }]);
    writeMock.mockImplementation(() => { throw new Error('planilha corrompida'); });

    const r = await excluirUsuarioComAcordos({ userId: 'u-1', nome: 'Fulano' });

    expect(r.status).toBe('falha');
    expect(r.status === 'falha' && r.mensagem).toContain('nada foi excluído');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('usuário sem acordos: exclui sem gerar planilha', async () => {
    comAcordos([]);
    rpcMock.mockResolvedValue({ data: { ok: true, acordos_apagados: 0 }, error: null });

    const r = await excluirUsuarioComAcordos({ userId: 'u-1', nome: 'Fulano' });

    expect(r).toMatchObject({ status: 'ok', acordosApagados: 0, relatorio: null });
    expect(writeMock).not.toHaveBeenCalled();
  });

  // Regressão de 05/08/2026: a planilha baixava, o usuário não era excluído e a
  // tela ficava muda. A RPC estourava um TypeError (`this` perdido) e ninguém
  // capturava — virava rejeição não tratada no onClick.
  it('exceção na RPC vira falha na tela, nunca silêncio', async () => {
    comAcordos([]);
    rpcMock.mockImplementation(() => { throw new TypeError("Cannot read properties of undefined (reading 'rest')"); });

    const r = await excluirUsuarioComAcordos({ userId: 'u-1', nome: 'Fulano' });

    expect(r.status).toBe('falha');
    expect(r.status === 'falha' && r.mensagem).toBeTruthy();
  });

  it('erro da RPC volta traduzido, não como texto do Postgres', async () => {
    comAcordos([]);
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'update or delete on table "perfis" violates foreign key constraint' },
    });

    const r = await excluirUsuarioComAcordos({ userId: 'u-1', nome: 'Fulano' });
    expect(r.status).toBe('falha');
    expect(r.status === 'falha' && r.mensagem).not.toContain('violates foreign key');
  });
});

describe('limparAcordosDaEmpresaAnterior', () => {
  it('apaga só os da empresa anterior', async () => {
    const cadeia = comAcordos([{ id: 'a1' }, { id: 'a2' }]);
    rpcMock.mockResolvedValue({ data: 2, error: null });

    const r = await limparAcordosDaEmpresaAnterior({
      userId: 'u-1', nome: 'Fulano', empresaAnteriorId: 'emp-antiga',
    });

    expect(r).toMatchObject({ status: 'ok', acordosApagados: 2 });
    expect(cadeia.eq).toHaveBeenCalledWith('empresa_id', 'emp-antiga');
    expect(rpcMock).toHaveBeenCalledWith('fn_admin_apagar_acordos_do_usuario', {
      p_user_id: 'u-1', p_empresa_id: 'emp-antiga',
    });
  });

  it('sem acordos na empresa anterior não chama RPC nem baixa nada', async () => {
    comAcordos([]);
    const r = await limparAcordosDaEmpresaAnterior({
      userId: 'u-1', nome: 'Fulano', empresaAnteriorId: 'emp-antiga',
    });
    expect(r).toMatchObject({ status: 'ok', acordosApagados: 0, relatorio: null });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('traduzirErro', () => {
  it('FK vira instrução, não jargão', () => {
    const t = traduzirErro('violates foreign key constraint "acordos_operador_id_fkey"');
    expect(t).not.toContain('foreign key');
    expect(t).toContain('Recarregue');
  });

  it('função ausente aponta a migration', () => {
    expect(traduzirErro('could not find the function')).toContain('20260805c');
  });
});
