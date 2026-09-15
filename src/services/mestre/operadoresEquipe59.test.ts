/**
 * Os operadores de uma equipe do 59 no detalhe do setor — 14/09/2026.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (...args: unknown[]) => mockRpc(...args),
}));

import { buscarOperadoresDaEquipe59 } from './diretoriaSetores.service';

describe('buscarOperadoresDaEquipe59', () => {
  beforeEach(() => mockRpc.mockReset());

  it('pede a equipe do setor com o corte e normaliza os números', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        cobradora: 'BEATRIZ_SILVA', linhas: '12', recebido: '4500.30', integral_para_ca: '0', dias: 7,
        primeiro_pgto: '2026-09-01', ultimo_pgto: '2026-09-12',
        perfil_id: 'p1', perfil_nome: 'Beatriz Silva', perfil_ativo: true, foto_url: null,
        equipe_atual: 'Equipe Matheus', setor_atual: 'COB RECEPTIVO',
      }],
      error: null,
    });

    const r = await buscarOperadoresDaEquipe59('e1', '2026-09', { setorId: 's1', codGrupo: '63', subgrupo: 'COB RECEPTIVO - BEATRIZ' }, 12);

    expect(mockRpc).toHaveBeenCalledWith('fn_mestre_diretoria_equipe_operadores', {
      p_empresa_id: 'e1', p_mes: '2026-09', p_setor_id: 's1', p_cod_grupo: '63',
      p_subgrupo: 'COB RECEPTIVO - BEATRIZ', p_dia_corte: 12,
    });
    expect(r).toEqual([{
      cobradora: 'BEATRIZ_SILVA', linhas: 12, recebido: 4500.3, integralParaCa: 0, dias: 7,
      primeiroPgto: '2026-09-01', ultimoPgto: '2026-09-12',
      perfilId: 'p1', perfilNome: 'Beatriz Silva', perfilAtivo: true, fotoUrl: null,
      equipeAtual: 'Equipe Matheus', setorAtual: 'COB RECEPTIVO',
    }]);
  });

  it('sem a função no banco, diz qual migration falta', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.fn_mestre_diretoria_equipe_operadores in the schema cache' },
    });
    await expect(buscarOperadoresDaEquipe59('e1', '2026-09', { setorId: null, codGrupo: '63', subgrupo: 'X' }))
      .rejects.toThrow(/20260914210000/);
  });
});
