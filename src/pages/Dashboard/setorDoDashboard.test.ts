/**
 * O total do setor no Dashboard é o do card do setor no Painel do Líder
 * (12/11/2026): Cofen pela conciliação, os demais por `carregarTotalDoSetor`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { conciliacaoSpy, rpcSpy, totalSpy } = vi.hoisted(() => ({
  conciliacaoSpy: vi.fn(),
  rpcSpy: vi.fn(),
  totalSpy: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: rpcSpy }));
vi.mock('@/services/analitico/analitico.service', () => ({ buscarAlternativosDoRetrato: vi.fn() }));
vi.mock('@/services/relatorioPaguePlay/conciliacaoSetor', () => ({ carregarConciliacaoSetor: conciliacaoSpy }));
vi.mock('@/pages/Mobile/setor/totalDoSetor', () => ({ carregarTotalDoSetor: totalSpy }));

import { carregarSetorDoDashboard } from './setorDoDashboard';

const base = { empresaId: 'emp', mes: '2026-11' };
const setor = (o: { cofen?: boolean; alternativo?: boolean } = {}) =>
  ({ id: 's1', nome: 'Setor', cofen: !!o.cofen, alternativo: !!o.alternativo });

beforeEach(() => {
  conciliacaoSpy.mockReset(); rpcSpy.mockReset(); totalSpy.mockReset();
});

describe('carregarSetorDoDashboard', () => {
  it('Cofen: total e dia a dia da conciliação, nunca o analítico', async () => {
    conciliacaoSpy.mockResolvedValue({ setorId: 's1', bruto: 2_357_713.25, ho: 540_416.76, quantidade: 10 });
    rpcSpy.mockResolvedValue({ data: [{ dia: 3, bruto: '100.50', ho: '25.10', qtd: 2 }], error: null });
    const carregarFontes = vi.fn();
    const r = await carregarSetorDoDashboard({ ...base, setor: setor({ cofen: true }), isPaguePlay: true, carregarFontes });
    expect(r).toEqual({
      bruto: 2_357_713.25, ho: 540_416.76, fonte: 'conciliacao', cofen: true,
      porDia: { 3: { bruto: 100.5, ho: 25.1, qtd: 2 } },
    });
    expect(rpcSpy).toHaveBeenCalledWith('fn_app_conciliacao_diaria', { p_empresa_id: 'emp', p_mes: '2026-11' });
    expect(totalSpy).not.toHaveBeenCalled();
    expect(carregarFontes).not.toHaveBeenCalled();
  });

  it('Cofen sem o dia a dia: total da conciliação, gráfico fica no analítico', async () => {
    conciliacaoSpy.mockResolvedValue({ setorId: 's1', bruto: 10, ho: 2, quantidade: 1 });
    rpcSpy.mockResolvedValue({ data: null, error: { message: 'x' } });
    const r = await carregarSetorDoDashboard({ ...base, setor: setor({ cofen: true }), isPaguePlay: true, carregarFontes: vi.fn() });
    expect(r.porDia).toBeNull();
    expect(r.bruto).toBe(10);
  });

  it('Cofen sem acesso: o erro sobe (quem chama cai no analítico)', async () => {
    conciliacaoSpy.mockRejectedValue(new Error('Sem acesso à conciliação do setor'));
    rpcSpy.mockResolvedValue({ data: [], error: null });
    await expect(carregarSetorDoDashboard({ ...base, setor: setor({ cofen: true }), isPaguePlay: true, carregarFontes: vi.fn() }))
      .rejects.toThrow(/Sem acesso/);
  });

  it('setor normal: acumulado do Painel, sem a leitura pesada das pessoas', async () => {
    totalSpy.mockResolvedValue({ bruto: 757_742, ho: 0, ajuste: 0 });
    const carregarFontes = vi.fn();
    const r = await carregarSetorDoDashboard({ ...base, setor: setor(), isPaguePlay: false, carregarFontes });
    expect(r).toEqual({ bruto: 757_742, ho: 0, porDia: null, fonte: 'acumulado', cofen: false });
    expect(carregarFontes).not.toHaveBeenCalled();
    expect(totalSpy.mock.calls[0][0].fontes.resumos).toEqual([]);
  });

  it('setor alternativo: soma as pessoas, com as fontes do Painel', async () => {
    const fontes = { resumos: [{ operador_id: 'o1' }], operadorEquipeMap: {}, equipesExtrasPorOperador: {}, equipes: [] };
    totalSpy.mockResolvedValue({ bruto: 5, ho: 0, ajuste: 0 });
    const carregarFontes = vi.fn().mockResolvedValue(fontes);
    await carregarSetorDoDashboard({ ...base, setor: setor({ alternativo: true }), isPaguePlay: false, carregarFontes });
    expect(carregarFontes).toHaveBeenCalledTimes(1);
    expect(totalSpy.mock.calls[0][0].fontes).toBe(fontes);
  });
});
