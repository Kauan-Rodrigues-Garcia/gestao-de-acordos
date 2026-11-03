/**
 * arquivarDesligadosAnteriores — o arquivamento é todo do banco.
 *
 * Desde 03/11/2026 (migration 20261103120000) quem tira o desligado de equipe,
 * liderança, clone e par Direto/Extra é `fn_desligado_sai_de_tudo`, chamada
 * pela própria RPC. A tela só pede o arquivamento e conta quantos foram:
 * nenhum acordo é tocado pelo navegador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockFrom, mockInvalidar } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockInvalidar: vi.fn(),
}));

vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: mockRpc, tabelaSemTipo: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom, rpc: vi.fn() } }));
vi.mock('@/services/analitico/composicaoCache', () => ({ invalidarComposicaoEquipes: mockInvalidar }));

import { arquivarDesligadosAnteriores } from '../situacaoUsuario.service';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockInvalidar.mockReset();
});

describe('arquivarDesligadosAnteriores', () => {
  it('pede o arquivamento ao banco e conta os arquivados, sem tocar em acordo', async () => {
    mockRpc.mockResolvedValue({ data: ['p1', 'p2'], error: null });

    await expect(arquivarDesligadosAnteriores('empresa-1')).resolves.toBe(2);
    expect(mockRpc).toHaveBeenCalledWith('fn_arquivar_desligados_ids', { p_empresa_id: 'empresa-1' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInvalidar).toHaveBeenCalled();
  });

  it('aceita a lista no formato de objeto de uma chave', async () => {
    mockRpc.mockResolvedValue({
      data: [{ fn_arquivar_desligados_ids: 'p1' }],
      error: null,
    });
    await expect(arquivarDesligadosAnteriores('empresa-1')).resolves.toBe(1);
  });

  it('erro do banco conta zero e não quebra a tela', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'falhou' } });
    await expect(arquivarDesligadosAnteriores('empresa-1')).resolves.toBe(0);
    expect(mockInvalidar).not.toHaveBeenCalled();
  });
});
