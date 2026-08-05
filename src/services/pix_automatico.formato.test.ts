import { describe, it, expect, vi } from 'vitest';

// formatarLinhaPix é pura, mas o módulo importa `supabase` no topo — sem mock,
// createClient() explode em teste por falta de VITE_SUPABASE_URL.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { formatarLinhaPix, formatarCopiaPix } from './pix_automatico.service';

describe('formatarLinhaPix', () => {
  it('leva só o código do acordo', () => {
    expect(formatarLinhaPix({ nr_cliente: '23232' })).toBe('23232');
  });

  it('não acrescenta rótulo nem comissão', () => {
    const linha = formatarLinhaPix({ nr_cliente: 'NR-1' });
    expect(linha).toBe('NR-1');
    expect(linha).not.toMatch(/NR:|COMISS/i);
  });
});

describe('formatarCopiaPix', () => {
  it('lista os códigos e fecha com o total da comissão', () => {
    const texto = formatarCopiaPix([
      { acordo: { nr_cliente: '111' }, comissao: 8.33 },
      { acordo: { nr_cliente: '222' }, comissao: 1.67 },
      { acordo: { nr_cliente: '333' }, comissao: 10 },
    ]);
    expect(texto).toBe(
      '111\n' +
      '222\n' +
      '333\n' +
      'R$ 20,00',
    );
  });

  it('mostra o total mesmo com um acordo só', () => {
    // Sem comissão por linha, o total é o único valor do texto — sem ele quem
    // recebe não saberia quanto pagar.
    const texto = formatarCopiaPix([{ acordo: { nr_cliente: '111' }, comissao: 8.33 }]);
    expect(texto).toBe('111\nR$ 8,33');
  });

  it('soma em padrão brasileiro, com separador de milhar', () => {
    const texto = formatarCopiaPix([
      { acordo: { nr_cliente: 'A' }, comissao: 600 },
      { acordo: { nr_cliente: 'B' }, comissao: 634.5 },
    ]);
    expect(texto).toBe('A\nB\nR$ 1.234,50');
  });

  it('devolve string vazia sem acordos', () => {
    expect(formatarCopiaPix([])).toBe('');
  });
});
