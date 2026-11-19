import { describe, expect, it } from 'vitest';
import { graficoPeloPagamento, linhasDoPagamento, type PagamentoSetor } from './pagamentoSetor';

const p: PagamentoSetor = { setorId: 'cofen', dias: [{ data: '2026-11-03', bruto: 150.5, ho: 37.56, quantidade: 2 }] };

describe('gráfico do setor Cofen pelo 945', () => {
  it('só com o setor inteiro: «todos» ou o próprio setor, sem equipe marcada', () => {
    expect(graficoPeloPagamento(p, [], [])).toBe(true);
    expect(graficoPeloPagamento(p, ['cofen'], [])).toBe(true);
    expect(graficoPeloPagamento(p, ['cofen'], ['equipe'])).toBe(false);
    expect(graficoPeloPagamento(p, ['outro'], [])).toBe(false);
    expect(graficoPeloPagamento(p, ['cofen', 'outro'], [])).toBe(false);
    expect(graficoPeloPagamento(null, [], [])).toBe(false);
  });

  it('cada dia vira uma linha do setor, sem operador', () => {
    expect(linhasDoPagamento(p)).toEqual([
      { operador_id: null, setor_id: 'cofen', importado_por_id: null, valor_recebido: 150.5, data_pagamento: '2026-11-03' },
    ]);
  });
});
