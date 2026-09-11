import { describe, expect, it, vi } from 'vitest';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { carregarConciliacaoSetor, centavosParaReais } from './conciliacaoSetor';

vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: vi.fn() }));
describe('acumulado do setor por conciliação', () => {
  it('usa o bruto e o H.O. independentes, sem percentual', async () => {
    vi.mocked(rpcSemTipo).mockResolvedValueOnce({ data: {
      setor_id: 'setor', total_centavos: '39045', ho_centavos: '9033', quantidade: 2,
    }, error: null });
    expect(await carregarConciliacaoSetor('pp', '2026-09')).toEqual({
      setorId: 'setor', bruto: 390.45, ho: 90.33, quantidade: 2,
    });
    expect(rpcSemTipo).toHaveBeenLastCalledWith('fn_pp_conciliacao_setor', { p_empresa_id: 'pp', p_mes: '2026-09' });
  });
  it('não transforma falha de consulta em valor zero', async () => {
    vi.mocked(rpcSemTipo).mockResolvedValueOnce({ data: null, error: { message: 'Sem acesso' } });
    await expect(carregarConciliacaoSetor('pp', '2026-09')).rejects.toThrow('Sem acesso');
  });
  it('preserva centavos e rejeita números sem precisão segura', () => {
    expect(centavosParaReais('1')).toBe(0.01);
    expect(centavosParaReais('-101')).toBe(-1.01);
    expect(centavosParaReais('0')).toBe(0);
    expect(() => centavosParaReais('1.5')).toThrow();
    expect(() => centavosParaReais('9007199254740993')).toThrow();
  });
});
