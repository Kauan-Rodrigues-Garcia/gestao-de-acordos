import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { converterParaExtra, vincularExtraAoDireto } from './diretoExtraRpc';

const dadosComuns = {
  valor: 150,
  vencimento: '2026-08-20',
  nomeCliente: 'Cliente',
  tipo: 'boleto',
  nrCliente: 'NR-42',
  instituicao: 'Banco',
  whatsapp: null,
  parcelas: 1,
};

describe('RPCs Direto/Extra durante o rollout', () => {
  beforeEach(() => rpcMock.mockReset());

  it('usa a assinatura protegida quando ela existe', async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const error = await converterParaExtra({
      ...dadosComuns,
      acordoId: 'acordo-1',
      novoDiretoOperadorId: 'operador-1',
      novoDiretoOperadorNome: 'Operador',
    });

    expect(error).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fn_converter_para_extra', expect.objectContaining({
      p_nr_cliente: 'NR-42',
      p_instituicao: 'Banco',
    }));
  });

  it('recorre à assinatura antiga somente se a nova ainda não existir', async () => {
    rpcMock
      .mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'function not found' } })
      .mockResolvedValueOnce({ error: null });

    const error = await vincularExtraAoDireto({
      ...dadosComuns,
      diretoId: 'direto-1',
      extraOperadorId: 'extra-1',
      extraOperadorNome: 'Extra',
    });

    expect(error).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1]).not.toHaveProperty('p_nr_cliente');
    expect(rpcMock.mock.calls[1][1]).not.toHaveProperty('p_instituicao');
  });

  it('não contorna erros de autorização ou regra de negócio', async () => {
    const proibido = { code: '42501', message: 'NAO_AUTORIZADO' };
    rpcMock.mockResolvedValueOnce({ error: proibido });

    const error = await converterParaExtra({
      ...dadosComuns,
      acordoId: 'acordo-1',
      novoDiretoOperadorId: 'operador-1',
      novoDiretoOperadorNome: 'Operador',
    });

    expect(error).toEqual(proibido);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
