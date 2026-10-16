import { describe, it, expect, vi } from 'vitest';

// formatarLinhaPix é pura, mas o módulo importa `supabase` no topo — sem mock,
// createClient() explode em teste por falta de VITE_SUPABASE_URL.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  formatarLinhaPix, formatarCopiaPix, formatarCopiaPixPorOperador, separarParaCopiaPix,
} from './pix_automatico.service';

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

describe('formatarCopiaPixPorOperador', () => {
  const de = (op: string, nome: string | null, nr: string, comissao: number, ajuste?: number) =>
    ({ acordo: { nr_cliente: nr, operador_id: op, operador_nome: nome }, comissao, ajuste });

  it('agrupa por operador, com o nome, o total de cada um e o total geral', () => {
    const texto = formatarCopiaPixPorOperador([
      de('op-2', 'Maria', '333', 10),
      de('op-1', 'João', '111', 8.33),
      de('op-2', 'Maria', '444', 5),
      de('op-1', 'João', '222', 1.67),
    ]);
    expect(texto).toBe(
      'João\n111\n222\nTotal João: R$ 10,00\n\n' +
      'Maria\n333\n444\nTotal Maria: R$ 15,00\n\n' +
      'Total geral: R$ 25,00',
    );
  });

  it('com um operador só, não repete o total como total geral', () => {
    const texto = formatarCopiaPixPorOperador([de('op-1', 'João', '111', 8.33)]);
    expect(texto).toBe('João\n111\nTotal João: R$ 8,33');
  });

  it('a correção fica no grupo do operador, antes do total dele', () => {
    const texto = formatarCopiaPixPorOperador([
      de('op-1', 'João', '111', 35, 10),
      de('op-2', 'Maria', '222', 20),
    ]);
    expect(texto).toBe(
      'João\n111\nCorreção no 111: +R$ 10,00\nTotal João: R$ 35,00\n\n' +
      'Maria\n222\nTotal Maria: R$ 20,00\n\n' +
      'Total geral: R$ 55,00',
    );
  });

  it('sem nome, o grupo sai com travessão', () => {
    expect(formatarCopiaPixPorOperador([de('op-1', null, 'A', 1)])).toBe('—\nA\nTotal —: R$ 1,00');
  });

  it('devolve string vazia sem acordos', () => {
    expect(formatarCopiaPixPorOperador([])).toBe('');
  });
});

describe('separarParaCopiaPix', () => {
  const linha = (id: string, status: 'pendente' | 'aprovado' | 'desaprovado', pago = false) =>
    ({ id, status, pago });

  it('o filtro "Aprovados" traz os pagos junto, e eles não entram no texto', () => {
    // 15/10/2026: a seleção levou os já pagos e o Pix saiu a mais.
    const r = separarParaCopiaPix([
      linha('a', 'aprovado'), linha('b', 'aprovado', true), linha('c', 'aprovado'),
    ]);
    expect(r.copiar.map(i => i.id)).toEqual(['a', 'c']);
    expect(r.porOperador).toBe(true);
    expect(r.jaPagos).toBe(1);
  });

  it('com aprovado a pagar na seleção, só ele entra', () => {
    const r = separarParaCopiaPix([
      linha('a', 'aprovado'), linha('p', 'pendente'), linha('d', 'desaprovado'),
    ]);
    expect(r.copiar.map(i => i.id)).toEqual(['a']);
    expect(r.foraDosAprovados).toBe(2);
  });

  it('só pendentes: copia para encaminhar, sem agrupar', () => {
    const r = separarParaCopiaPix([linha('p1', 'pendente'), linha('p2', 'pendente')]);
    expect(r.copiar.map(i => i.id)).toEqual(['p1', 'p2']);
    expect(r.porOperador).toBe(false);
  });

  it('tudo pago: nada a copiar', () => {
    const r = separarParaCopiaPix([linha('a', 'aprovado', true)]);
    expect(r.copiar).toEqual([]);
    expect(r.jaPagos).toBe(1);
  });
});
