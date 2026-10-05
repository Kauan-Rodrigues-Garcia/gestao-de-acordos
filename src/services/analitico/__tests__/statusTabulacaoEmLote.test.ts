import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { rpcSpy } = vi.hoisted(() => ({ rpcSpy: vi.fn() }));

vi.mock('@/lib/supabaseSemTipo', async (original) => ({
  ...(await original<typeof import('@/lib/supabaseSemTipo')>()),
  rpcSemTipo: rpcSpy,
}));

import { esquecerStatusTabulacao, verificarStatusTabulacaoEmLote } from '../analitico.service';

describe('verificarStatusTabulacaoEmLote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    esquecerStatusTabulacao();
    rpcSpy.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('as linhas que montam juntas viram UMA chamada ao lote', async () => {
    rpcSpy.mockResolvedValue({
      data: { linhas: {
        a: { status: 'tabulado', acordo_id: 'ac-1' },
        b: { status: 'divergente', acordo_id: 'ac-2', outro_operador_id: 'op-9', outro_operador_nome: 'Bia' },
        c: { status: 'nao_tabulado' },
      } },
      error: null,
    });
    const promessas = ['a', 'b', 'c'].map(id => verificarStatusTabulacaoEmLote(id));
    await vi.advanceTimersByTimeAsync(50);
    const [a, b, c] = await Promise.all(promessas);

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('fn_analitico_status_tabulacao_lote', { p_linha_ids: ['a', 'b', 'c'] });
    expect(a).toEqual({ status: 'tabulado', acordoId: 'ac-1', outroOperadorId: null, outroOperadorNome: null });
    expect(b.outroOperadorNome).toBe('Bia');
    expect(c.status).toBe('nao_tabulado');
  });

  it('dentro de um minuto a mesma linha não pergunta de novo; esquecer força a pergunta', async () => {
    rpcSpy.mockResolvedValue({ data: { linhas: { a: { status: 'nao_tabulado' } } }, error: null });
    const p1 = verificarStatusTabulacaoEmLote('a');
    await vi.advanceTimersByTimeAsync(50);
    await p1;
    await verificarStatusTabulacaoEmLote('a');
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    esquecerStatusTabulacao('a');
    const p3 = verificarStatusTabulacaoEmLote('a');
    await vi.advanceTimersByTimeAsync(50);
    await p3;
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it('sem o lote no banco, cai para a consulta de uma linha', async () => {
    rpcSpy.mockImplementation((nome: string) => Promise.resolve(
      nome === 'fn_analitico_status_tabulacao_lote'
        ? { data: null, error: { message: 'Could not find the function' } }
        : { data: { status: 'tabulado', acordo_id: 'ac-7' }, error: null },
    ));
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = verificarStatusTabulacaoEmLote('x');
    await vi.advanceTimersByTimeAsync(50);
    expect((await p).acordoId).toBe('ac-7');
    expect(rpcSpy).toHaveBeenCalledWith('fn_analitico_status_tabulacao', { p_linha_id: 'x' });
    aviso.mockRestore();
  });
});
