import { describe, expect, it } from 'vitest';
import { lerData, lerLista, paraCsv } from './importar';

const HOJE = '2026-11-04';

describe('importar NRs', () => {
  it('lê datas nos formatos comuns e recusa as impossíveis', () => {
    expect(lerData('03/11/2026')).toBe('2026-11-03');
    expect(lerData('3/11/26')).toBe('2026-11-03');
    expect(lerData('2026-11-03')).toBe('2026-11-03');
    expect(lerData('31/02/2026')).toBeNull();
  });

  it('NR sozinho usa a data da tela; com data, a da linha; cabeçalho some', () => {
    const r = lerLista('NR;Data\n12345678\n87654321;02/11/2026\n02/11/2026\t555\n', '2026-11-04', HOJE);
    expect(r.itens).toEqual([
      { nr: '12345678', data: '2026-11-04' },
      { nr: '87654321', data: '2026-11-02' },
      { nr: '555', data: '2026-11-02' },
    ]);
    expect(r.ignoradas).toBe(0);
  });

  it('o mesmo NR no mesmo mês entra uma vez; data futura e lixo são contados', () => {
    const r = lerLista('111;01/11/2026\n111;03/11/2026\n111;30/10/2026\n222;05/11/2026\nabc 12/x\n333;31/02/2026', HOJE, HOJE);
    expect(r.itens.map(i => i.nr + '@' + i.data)).toEqual(['111@2026-11-01', '111@2026-10-30']);
    expect(r.repetidosNaLista).toBe(1);
    expect(r.futuras).toBe(1);
    expect(r.ignoradas).toBe(2);
  });

  it('o CSV de baixar tem só NR e data, em dd/mm/aaaa', () => {
    expect(paraCsv([{ nr: '123', data: '2026-11-04' }])).toBe('NR;Data\r\n123;04/11/2026\r\n');
  });
});
