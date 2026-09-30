/** O gráfico da equipe no celular — mesma regra do Gráfico do Painel do Líder. */
import { describe, it, expect } from 'vitest';
import { montarGraficoDoMes } from './graficoDia';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';

const linha = (op: string | null, data: string, valor: number, extra: Partial<LinhaRecebidaDia> = {}): LinhaRecebidaDia => ({
  operador_id: op, setor_id: 's1', importado_por_id: null, valor_recebido: valor, data_pagamento: data, ...extra,
});
const equipe = { tipo: 'equipe' as const, operadores: new Set(['a', 'b']) };

describe('montarGraficoDoMes', () => {
  const g = montarGraficoDoMes({
    mes: '2026-09', hojeISO: '2026-09-17', escopo: equipe,
    linhas: [
      linha('a', '2026-09-01', 100),
      linha('b', '2026-09-01', 50),
      linha('a', '2026-09-03', 300),
      linha('x', '2026-09-03', 999),          // fora da equipe
      linha(null, '2026-09-04', 999),         // órfão: equipe não leva
      linha('a', '2026-09-17', 30),
    ],
  });

  it('soma por dia só o que é da equipe', () => {
    expect(g.dias[0].valor).toBe(150);
    expect(g.dias[2].valor).toBe(300);
    expect(g.dias[3].valor).toBeNull();
  });

  it('dia sem recebimento é buraco, não zero', () => {
    expect(g.dias[1].valor).toBeNull();
  });

  it('média divide pelos dias COM recebimento', () => {
    expect(g.total).toBe(480);
    expect(g.diasComRecebimento).toBe(3);
    expect(g.media).toBe(160);
  });

  it('melhor dia, hoje e dias futuros', () => {
    expect(g.melhor).toEqual({ dia: 3, valor: 300 });
    expect(g.dias[16].hoje).toBe(true);
    expect(g.dias[16].futuro).toBe(false);
    expect(g.dias[17].futuro).toBe(true);
    expect(g.dias).toHaveLength(30);
  });

  it('mês sem recebimento: zero e sem melhor dia', () => {
    const vazio = montarGraficoDoMes({ mes: '2026-09', hojeISO: '2026-09-17', escopo: equipe, linhas: [] });
    expect(vazio.total).toBe(0);
    expect(vazio.media).toBe(0);
    expect(vazio.melhor).toBeNull();
  });
});
