import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useClienteConhecido } from './useClienteConhecido';

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

async function esperarBusca() {
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
}

describe('useClienteConhecido', () => {
  it('com NR, manda a chave no campo do NR e devolve nome e instituição', async () => {
    rpc.mockResolvedValue({ data: [{ cliente_nome: 'MARIA', cliente_instituicao: 'BOOKPLAY' }], error: null });
    const { result } = renderHook(() => useClienteConhecido('123456', 'emp', 'nr_cliente'));

    expect(result.current.loading).toBe(true);
    await esperarBusca();

    expect(rpc).toHaveBeenCalledWith('fn_cliente_pelo_codigo', {
      p_empresa_id: 'emp', p_nr_cliente: '123456', p_instituicao: '',
    });
    expect(result.current).toEqual({ cliente: { nome: 'MARIA', instituicao: 'BOOKPLAY' }, loading: false });
  });

  it('na Cofen, a chave vai no campo do Código', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useClienteConhecido('987654', 'emp', 'instituicao'));
    await esperarBusca();
    expect(rpc).toHaveBeenCalledWith('fn_cliente_pelo_codigo', {
      p_empresa_id: 'emp', p_nr_cliente: '', p_instituicao: '987654',
    });
  });

  it('não busca com menos de 4 caracteres nem sem empresa', async () => {
    renderHook(() => useClienteConhecido('123', 'emp', 'nr_cliente'));
    renderHook(() => useClienteConhecido('123456', undefined, 'nr_cliente'));
    await esperarBusca();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('espera parar de digitar: só a última chave vai ao banco', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { rerender } = renderHook(({ c }) => useClienteConhecido(c, 'emp', 'nr_cliente'), {
      initialProps: { c: '1234' },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    rerender({ c: '12345' });
    await esperarBusca();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_nr_cliente: '12345' });
  });

  it('nada conhecido, erro ou função ausente: null, e o formulário segue', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const vazio = renderHook(() => useClienteConhecido('111111', 'emp', 'nr_cliente'));
    await esperarBusca();
    expect(vazio.result.current.cliente).toBeNull();

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } });
    const erro = renderHook(() => useClienteConhecido('222222', 'emp', 'nr_cliente'));
    await esperarBusca();
    expect(erro.result.current).toEqual({ cliente: null, loading: false });
  });
});
