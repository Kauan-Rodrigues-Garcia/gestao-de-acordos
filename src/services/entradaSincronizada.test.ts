import { describe, it, expect } from 'vitest';
import { camposDeEntradaAposEdicao } from './entradaSincronizada';

describe('camposDeEntradaAposEdicao', () => {
  it('acordo sem entrada não regrava nada', () => {
    expect(camposDeEntradaAposEdicao({
      temEntrada: false, totalDeclarado: 4, demaisFallback: 100,
      parcelas: [{ numero: 1, valor: 500 }],
    })).toBeNull();
  });

  it('lista completa: total é a soma do que está escrito', () => {
    // Entrada de 1000 + três de 150.
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 4, demaisFallback: 150,
      parcelas: [
        { numero: 1, valor: 1000 },
        { numero: 2, valor: 150 },
        { numero: 3, valor: 150 },
        { numero: 4, valor: 150 },
      ],
    })).toEqual({ valor_entrada: 1000, valor_total: 1450 });
  });

  it('lista completa com valores irregulares (edição em conjunto) soma o real', () => {
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 3, demaisFallback: 150,
      parcelas: [
        { numero: 1, valor: 1000 },
        { numero: 2, valor: 200 },
        { numero: 3, valor: 90.55 },
      ],
    })).toEqual({ valor_entrada: 1000, valor_total: 1290.55 });
  });

  it('faltando linhas: usa entrada + demais × (N−1)', () => {
    // Só as duas primeiras existem; o acordo declara 5 parcelas.
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 5, demaisFallback: 150,
      parcelas: [{ numero: 1, valor: 800 }, { numero: 2, valor: 120 }],
    })).toEqual({ valor_entrada: 800, valor_total: 800 + 120 * 4 });
  });

  it('faltando linhas e sem parcela 2: cai no valor derivado do acordo', () => {
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 4, demaisFallback: 150,
      parcelas: [{ numero: 1, valor: 800 }],
    })).toEqual({ valor_entrada: 800, valor_total: 800 + 150 * 3 });
  });

  it('entrada zerada ou ausente não regrava — melhor não mexer do que mentir', () => {
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 4, demaisFallback: 150,
      parcelas: [{ numero: 2, valor: 150 }],
    })).toBeNull();
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 4, demaisFallback: 150,
      parcelas: [{ numero: 1, valor: 0 }],
    })).toBeNull();
  });

  it('sem demais conhecido e com linhas faltando, não inventa total', () => {
    expect(camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 6, demaisFallback: null,
      parcelas: [{ numero: 1, valor: 800 }],
    })).toBeNull();
  });

  it('centavos não derrapam na soma', () => {
    const r = camposDeEntradaAposEdicao({
      temEntrada: true, totalDeclarado: 3, demaisFallback: 0.1,
      parcelas: [{ numero: 1, valor: 0.1 }, { numero: 2, valor: 0.2 }, { numero: 3, valor: 0.1 }],
    });
    expect(r!.valor_total).toBe(0.4);
  });
});
