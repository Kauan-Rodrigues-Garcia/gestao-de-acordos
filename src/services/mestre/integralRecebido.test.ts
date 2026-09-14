/**
 * A Contribuição Receptivo lida do 59 — 14/09/2026.
 *
 * `buscarIntegralRecebidoPorSetor` decide duas coisas que mudam dinheiro na
 * tela: se o mês tem 59 (senão a tela volta ao valor digitado) e quanto cada
 * setor recebeu de Integral cobrado por outro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (...args: unknown[]) => mockRpc(...args),
}));

import { buscarIntegralRecebidoPorSetor } from './diretoriaSetores.service';

const setor = (id: string, integral: unknown) => ({
  setor_id: id, setor_nome: id, foto_url: null, valor: 0, linhas: 0, operadores: 0, carteiras: 0,
  integral_recebido: integral, movido_para_ca: 0, valor_anterior: 0, tem_anterior: false, tem_grupo: true,
});

describe('buscarIntegralRecebidoPorSetor', () => {
  beforeEach(() => mockRpc.mockReset());

  it('lê a grade do mês inteiro e devolve só os setores com Integral recebido', async () => {
    mockRpc.mockResolvedValue({
      data: { setores: [setor('play5', '38656.52'), setor('receptivo', 0), setor('play1', 1200)], carteiras_sem_setor: [] },
      error: null,
    });

    const r = await buscarIntegralRecebidoPorSetor('e1', '2026-09');

    expect(mockRpc).toHaveBeenCalledWith('fn_mestre_diretoria_setores', {
      p_empresa_id: 'e1', p_mes: '2026-09', p_dia_corte: null,
    });
    expect(r).toEqual({ play5: 38656.52, play1: 1200 });
  });

  it('mês sem lote do 59 devolve null — a tela volta ao valor digitado', async () => {
    mockRpc.mockResolvedValue({ data: { setores: [], carteiras_sem_setor: [] }, error: null });
    expect(await buscarIntegralRecebidoPorSetor('e1', '2026-07')).toBeNull();
  });

  it('mês com 59 e nenhum Integral devolve mapa vazio, e não null', async () => {
    mockRpc.mockResolvedValue({ data: { setores: [setor('play5', 0)], carteiras_sem_setor: [] }, error: null });
    expect(await buscarIntegralRecebidoPorSetor('e1', '2026-09')).toEqual({});
  });

  it('erro do banco devolve null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Sem acesso a esta empresa.' } });
    expect(await buscarIntegralRecebidoPorSetor('e1', '2026-09')).toBeNull();
  });
});
