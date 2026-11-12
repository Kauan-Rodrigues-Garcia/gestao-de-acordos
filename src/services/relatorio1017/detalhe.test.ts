import { describe, it, expect } from 'vitest';
import { filtrarLinhas, porDia, tiposDoMes } from './detalhe';
import type { LinhaDoRelatorio } from './relatorioDoSetor.service';

const l = (nr: string, pagamento: string, tipo: string, valor: number, extra: Partial<LinhaDoRelatorio> = {}): LinhaDoRelatorio => ({
  nr, pagamento, tipo, valor, codCliente: null, franquia: null, status: 'Confirmado',
  parcela: 2, vencimento: pagamento, ...extra,
});

const linhas = [
  l('100', '2026-11-04', 'Pix', 10.1),
  l('101', '2026-11-04', 'Cartão de Crédito', 20.2, { codCliente: '29448090' }),
  l('102', '2026-11-06', 'Pix', 30, { franquia: 'FRANQUIA SÃO JOSÉ' }),
];

describe('detalhe do 1017', () => {
  it('tipos do maior para o menor, com centavos certos', () => {
    expect(tiposDoMes(linhas)).toEqual([
      { tipo: 'Pix', linhas: 2, valor: 40.1 },
      { tipo: 'Cartão de Crédito', linhas: 1, valor: 20.2 },
    ]);
  });

  it('um ponto por dia até o último pagamento, dias vazios em zero', () => {
    const p = porDia(linhas, '2026-11');
    expect(p.map(x => x.dia)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(p[3]).toMatchObject({ data: '2026-11-04', total: 30.3, porTipo: { Pix: 10.1, 'Cartão de Crédito': 20.2 } });
    expect(p[4].total).toBe(0);
  });

  it('busca por NR, cliente e franquia sem acento; filtro de dia', () => {
    expect(filtrarLinhas(linhas, '1017', null)).toHaveLength(0);
    expect(filtrarLinhas(linhas, '101', null).map(x => x.nr)).toEqual(['101']);
    expect(filtrarLinhas(linhas, '29448', null).map(x => x.nr)).toEqual(['101']);
    expect(filtrarLinhas(linhas, 'sao jose', null).map(x => x.nr)).toEqual(['102']);
    expect(filtrarLinhas(linhas, '', '2026-11-04').map(x => x.nr)).toEqual(['101', '100']);
  });
});
