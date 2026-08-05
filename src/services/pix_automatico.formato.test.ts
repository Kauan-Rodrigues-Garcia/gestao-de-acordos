import { describe, it, expect, vi } from 'vitest';

// formatarLinhaPix é pura, mas o módulo importa `supabase` no topo — sem mock,
// createClient() explode em teste por falta de VITE_SUPABASE_URL.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { formatarLinhaPix, formatarCopiaPix } from './pix_automatico.service';

describe('formatarLinhaPix', () => {
  it('leva apenas NR e comissão', () => {
    const linha = formatarLinhaPix({ nr_cliente: '23232' }, 8.33);
    expect(linha).toBe('NR: 23232 COMISSÃO 8,33');
  });

  it('formata a comissão em padrão brasileiro', () => {
    expect(formatarLinhaPix({ nr_cliente: 'NR-1' }, 0.25)).toBe('NR: NR-1 COMISSÃO 0,25');
    expect(formatarLinhaPix({ nr_cliente: 'NR-2' }, 1234.5)).toBe('NR: NR-2 COMISSÃO 1.234,50');
  });
});

describe('formatarCopiaPix', () => {
  it('soma a comissão quando há mais de um acordo', () => {
    const texto = formatarCopiaPix([
      { acordo: { nr_cliente: '111' }, comissao: 8.33 },
      { acordo: { nr_cliente: '222' }, comissao: 1.67 },
      { acordo: { nr_cliente: '333' }, comissao: 10 },
    ]);
    expect(texto).toBe(
      'NR: 111 COMISSÃO 8,33\n' +
      'NR: 222 COMISSÃO 1,67\n' +
      'NR: 333 COMISSÃO 10,00\n' +
      'TOTAL COMISSÃO 20,00',
    );
  });

  it('não repete o total quando há um acordo só', () => {
    const texto = formatarCopiaPix([{ acordo: { nr_cliente: '111' }, comissao: 8.33 }]);
    expect(texto).toBe('NR: 111 COMISSÃO 8,33');
  });

  it('devolve string vazia sem acordos', () => {
    expect(formatarCopiaPix([])).toBe('');
  });
});
