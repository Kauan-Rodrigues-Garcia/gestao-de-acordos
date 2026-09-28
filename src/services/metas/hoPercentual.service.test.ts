import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: (...a: unknown[]) => rpc(...a) }));

import { lerPercentualDigitado, percentualParaCampo, definirHoPercentual } from './hoPercentual.service';

beforeEach(() => rpc.mockReset());

describe('o campo da aba Metas', () => {
  it('«22,60» vira 0,2260', () => {
    expect(lerPercentualDigitado('22,60')).toBe(0.226);
    expect(lerPercentualDigitado('22.6')).toBe(0.226);
    expect(lerPercentualDigitado(' 24,96 % ')).toBe(0.2496);
  });
  it('fora de 0–100, ou vazio, é inválido', () => {
    for (const t of ['', '0', '100', '-5', 'abc', '150']) {
      expect(lerPercentualDigitado(t), t).toBeNull();
    }
  });
  it('0,2260 aparece como «22,60»', () => {
    expect(percentualParaCampo(0.226)).toBe('22,60');
  });
});

describe('gravar', () => {
  it('chama a função do banco com a fração', async () => {
    rpc.mockResolvedValue({ data: 0.226, error: null });
    expect(await definirHoPercentual('e1', 0.226)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('fn_empresa_definir_ho_percentual', { p_empresa_id: 'e1', p_percentual: 0.226 });
  });
  it('recusa do banco vira frase, sem o prefixo', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'NAO_AUTORIZADO: seu cargo não pode editar metas' } });
    expect(await definirHoPercentual('e1', 0.226)).toEqual({ ok: false, erro: 'seu cargo não pode editar metas' });
  });
  it('função ausente diz qual migration falta', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function fn_empresa_definir_ho_percentual in the schema cache' } });
    const r = await definirHoPercentual('e1', 0.226);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('20260929030000') });
  });
});
