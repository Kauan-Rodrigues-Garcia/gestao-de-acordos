import { describe, it, expect } from 'vitest';
import { montarLinhasEditaveis, type RegistroDeParcela } from './linhasParcelas';

function reg(numero: number, extra: Partial<RegistroDeParcela> = {}): RegistroDeParcela {
  return {
    id:             `p${numero}`,
    numero_parcela: numero,
    vencimento:     '2026-08-20',
    valor:          400,
    tipo:           'boleto',
    status:         'verificar_pendente',
    ...extra,
  };
}

const base = { valorPadrao: 400, tipoPadrao: 'boleto', isPaguePlay: false, valoresCalculados: null };

describe('montarLinhasEditaveis', () => {
  it('acordo de 17 parcelas com 2 registradas devolve 17 linhas', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [reg(1, { vencimento: '2026-08-20' }), reg(2, { vencimento: '2026-09-20' })],
      totalDeclarado: 17,
    });
    expect(linhas).toHaveLength(17);
    expect(linhas.filter(l => l.id !== null)).toHaveLength(2);
    expect(linhas.filter(l => l.id === null)).toHaveLength(15);
  });

  it('as que faltam seguem a cadência do acordo, mantendo o dia', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [reg(1, { vencimento: '2026-08-20' }), reg(2, { vencimento: '2026-09-20' })],
      totalDeclarado: 4,
    });
    expect(linhas.map(l => l.vencimento)).toEqual([
      '2026-08-20', '2026-09-20', '2026-10-20', '2026-11-20',
    ]);
  });

  it('mês curto satura em vez de inventar dia 31', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [reg(1, { vencimento: '2026-01-31' })],
      totalDeclarado: 3,
    });
    expect(linhas.map(l => l.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-28']);
  });

  it('a linha real vence o cálculo — o que está no banco manda', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [
        reg(1, { vencimento: '2026-08-20', valor: 400 }),
        reg(3, { vencimento: '2026-12-05', valor: 90, tipo: 'pix', status: 'pago' }),
      ],
      totalDeclarado: 3,
    });
    expect(linhas[2]).toEqual({
      numero: 3, id: 'p3', vencimento: '2026-12-05', valor: 90, tipo: 'pix', status: 'pago',
    });
    // A do meio continua virtual, com a data calculada.
    expect(linhas[1].id).toBeNull();
    expect(linhas[1].vencimento).toBe('2026-09-20');
  });

  it('acordo com entrada: cada linha que falta pega o valor das demais', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [reg(1, { valor: 1000, vencimento: '2026-08-10' })],
      totalDeclarado: 4,
      valoresCalculados: [1000, 150, 150, 150],
    });
    expect(linhas.map(l => l.valor)).toEqual([1000, 150, 150, 150]);
  });

  it('acordo que nasceu no meio do plano: as anteriores ficam sem data', () => {
    // Primeira real é a 4ª de 6 — as 3 primeiras foram pagas antes da tabulação.
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [reg(4, { vencimento: '2026-08-20' })],
      totalDeclarado: 6,
    });
    expect(linhas).toHaveLength(6);
    expect(linhas.slice(0, 3).every(l => l.id === null && l.vencimento === '')).toBe(true);
    expect(linhas[3].id).toBe('p4');
    expect(linhas[4].vencimento).toBe('2026-09-20');
  });

  it('mais linhas reais do que o total declarado não some com nenhuma', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      registros: [reg(1), reg(2), reg(3)],
      totalDeclarado: 2,
    });
    expect(linhas).toHaveLength(3);
  });

  it('sem registros devolve o total declarado sem data', () => {
    const linhas = montarLinhasEditaveis({ ...base, registros: [], totalDeclarado: 3 });
    expect(linhas).toHaveLength(3);
    expect(linhas.every(l => l.id === null && l.vencimento === '')).toBe(true);
  });

  it('PaguePlay continua caindo no fim do mês', () => {
    const linhas = montarLinhasEditaveis({
      ...base,
      isPaguePlay: true,
      registros: [reg(1, { vencimento: '2026-08-31' })],
      totalDeclarado: 3,
    });
    expect(linhas.map(l => l.vencimento)).toEqual(['2026-08-31', '2026-09-30', '2026-10-31']);
  });
});
