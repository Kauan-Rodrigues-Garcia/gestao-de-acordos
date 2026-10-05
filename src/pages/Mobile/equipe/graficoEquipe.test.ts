/**
 * carregarGraficoEquipe — a leitura que alimenta o Gráfico e o «Hoje» da
 * equipe no celular. Em Nosso produto ela descarta o recebimento que caiu num
 * setor onde a pessoa não está no mês, para bater com o card da equipe e com o
 * aviso de equipe (05/10/2026).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { porDia, fora, diario, ajustes } = vi.hoisted(() => ({
  porDia:  vi.fn(),
  fora:    vi.fn(),
  diario:  vi.fn(),
  ajustes: vi.fn(),
}));

vi.mock('@/services/analitico/analitico.service', async (original) => ({
  ...(await original<typeof import('@/services/analitico/analitico.service')>()),
  buscarRecebidoPorDiaDosOperadores: porDia,
  buscarParesForaDoSetor: fora,
  buscarAjustesComoLinhasDia: ajustes,
}));
vi.mock('@/services/diario/diario.service', async (original) => ({
  ...(await original<typeof import('@/services/diario/diario.service')>()),
  buscarResumoMensalDiario: diario,
}));

import { carregarGraficoEquipe } from './useTelaEquipe';

const linha = (operador_id: string, setor_id: string, valor_recebido: number) => ({
  operador_id, setor_id, importado_por_id: null, valor_recebido, data_pagamento: '2026-10-05',
});

describe('carregarGraficoEquipe', () => {
  beforeEach(() => { porDia.mockReset(); fora.mockReset(); diario.mockReset(); ajustes.mockReset(); });

  it('Nosso produto: linha fora do setor da pessoa sai, a do setor dela fica', async () => {
    porDia.mockResolvedValue({ data: [linha('ana', 'play1', 100), linha('ana', 'play2', 40), linha('bia', 'play1', 10)], error: null });
    fora.mockResolvedValue(new Set(['ana|play2']));
    const r = await carregarGraficoEquipe('emp', '2026-10', false, ['ana', 'bia']);
    expect(r.map(l => l.valor_recebido)).toEqual([100, 10]);
  });

  it('Nosso produto sem nada fora do setor: devolve as linhas como vieram', async () => {
    const linhas = [linha('ana', 'play1', 100)];
    porDia.mockResolvedValue({ data: linhas, error: null });
    fora.mockResolvedValue(new Set());
    expect(await carregarGraficoEquipe('emp', '2026-10', false, ['ana'])).toBe(linhas);
  });

  it('Cofen: lê o diário e não consulta o corte por setor', async () => {
    diario.mockResolvedValue({ linhasDia: [linha('ana', 'conecta', 50)], error: null });
    ajustes.mockResolvedValue([]);
    const r = await carregarGraficoEquipe('emp', '2026-10', true, ['ana']);
    expect(r).toHaveLength(1);
    expect(fora).not.toHaveBeenCalled();
    expect(porDia).not.toHaveBeenCalled();
  });
});
