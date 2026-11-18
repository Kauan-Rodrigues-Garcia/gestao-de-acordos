import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, impersonando } = vi.hoisted(() => ({ rpc: vi.fn(), impersonando: vi.fn() }));
vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: rpc }));
vi.mock('@/services/impersonacao.service', () => ({ getImpersonacaoAtiva: impersonando }));

import { enviarEscolhaVi } from './registroEscolha';

describe('contagem das respostas do tema GTA VI', () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    impersonando.mockReset().mockReturnValue(null);
  });

  it('envia cada resposta uma vez só', async () => {
    await enviarEscolhaVi('p1', 'sim');
    await enviarEscolhaVi('p1', 'sim');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_vi_registrar_escolha', { p_escolha: 'sim' });
  });

  it('não repete o envio enquanto o primeiro está no caminho', async () => {
    await Promise.all([enviarEscolhaVi('p1', 'sim'), enviarEscolhaVi('p1', 'sim')]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('mudar de ideia envia a resposta nova', async () => {
    await enviarEscolhaVi('p1', 'sim');
    await enviarEscolhaVi('p1', 'nao');
    expect(rpc).toHaveBeenLastCalledWith('fn_vi_registrar_escolha', { p_escolha: 'nao' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('se falhar, tenta de novo na próxima vez, sem estourar', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } }).mockRejectedValueOnce(new Error('rede'));
    await enviarEscolhaVi('p1', 'sim');
    await expect(enviarEscolhaVi('p1', 'sim')).resolves.toBeUndefined();
    await enviarEscolhaVi('p1', 'sim');
    await enviarEscolhaVi('p1', 'sim');
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('impersonação não grava', async () => {
    impersonando.mockReturnValue({ id: 'alguem' });
    await enviarEscolhaVi('p1', 'sim');
    expect(rpc).not.toHaveBeenCalled();
  });
});
