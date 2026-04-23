/**
 * src/lib/__tests__/setores-ordem.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Testes dos helpers de persistência de ordem de setores (drag-and-drop da
 * aba Setores em AdminUsuarios).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  chaveOrdemSetores,
  lerOrdemSetores,
  salvarOrdemSetores,
  aplicarOrdemSetores,
} from '../setores-ordem';

// Polyfill mínimo de localStorage (jsdom geralmente provê, mas garantimos)
beforeEach(() => {
  localStorage.clear();
});

describe('chaveOrdemSetores', () => {
  it('gera chave namespaced por empresa', () => {
    expect(chaveOrdemSetores('emp-123')).toBe('setores-ordem:emp-123');
  });
});

describe('lerOrdemSetores', () => {
  it('retorna [] quando não há nada persistido', () => {
    expect(lerOrdemSetores('emp-1')).toEqual([]);
  });

  it('retorna array de strings quando persistido corretamente', () => {
    localStorage.setItem('setores-ordem:emp-1', JSON.stringify(['a', 'b', 'c']));
    expect(lerOrdemSetores('emp-1')).toEqual(['a', 'b', 'c']);
  });

  it('filtra entradas não-string defensivamente', () => {
    localStorage.setItem(
      'setores-ordem:emp-1',
      JSON.stringify(['a', 123, null, 'b', { x: 1 }]),
    );
    expect(lerOrdemSetores('emp-1')).toEqual(['a', 'b']);
  });

  it('retorna [] quando o JSON é inválido', () => {
    localStorage.setItem('setores-ordem:emp-1', '{not valid json');
    expect(lerOrdemSetores('emp-1')).toEqual([]);
  });

  it('retorna [] quando o valor não é array', () => {
    localStorage.setItem('setores-ordem:emp-1', JSON.stringify({ a: 1 }));
    expect(lerOrdemSetores('emp-1')).toEqual([]);
  });
});

describe('salvarOrdemSetores', () => {
  it('persiste a ordem e lerOrdemSetores lê de volta', () => {
    salvarOrdemSetores('emp-1', ['x', 'y', 'z']);
    expect(lerOrdemSetores('emp-1')).toEqual(['x', 'y', 'z']);
  });

  it('empresas diferentes não se contaminam', () => {
    salvarOrdemSetores('emp-A', ['1', '2']);
    salvarOrdemSetores('emp-B', ['3', '4']);
    expect(lerOrdemSetores('emp-A')).toEqual(['1', '2']);
    expect(lerOrdemSetores('emp-B')).toEqual(['3', '4']);
  });
});

describe('aplicarOrdemSetores', () => {
  const setores = [
    { id: 's1', nome: 'Alpha' },
    { id: 's2', nome: 'Bravo' },
    { id: 's3', nome: 'Charlie' },
    { id: 's4', nome: 'Delta' },
  ];

  it('sem empresaId: ordena alfabeticamente', () => {
    const r = aplicarOrdemSetores(setores, undefined);
    expect(r.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('empresaId=null: ordena alfabeticamente', () => {
    const r = aplicarOrdemSetores(setores, null);
    expect(r.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('sem ordem persistida: ordena alfabeticamente', () => {
    const r = aplicarOrdemSetores(setores, 'emp-1');
    expect(r.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('com ordem persistida completa: usa a ordem exatamente', () => {
    salvarOrdemSetores('emp-1', ['s3', 's1', 's4', 's2']);
    const r = aplicarOrdemSetores(setores, 'emp-1');
    expect(r.map(s => s.id)).toEqual(['s3', 's1', 's4', 's2']);
  });

  it('com ordem persistida parcial: ids conhecidos na ordem, desconhecidos ao fim alfabeticamente', () => {
    salvarOrdemSetores('emp-1', ['s3', 's1']);
    const r = aplicarOrdemSetores(setores, 'emp-1');
    expect(r.map(s => s.id)).toEqual(['s3', 's1', 's2', 's4']); // Bravo, Delta no fim (alfabético)
  });

  it('não muta o input', () => {
    const originais = [...setores];
    salvarOrdemSetores('emp-1', ['s4', 's3']);
    aplicarOrdemSetores(setores, 'emp-1');
    expect(setores).toEqual(originais);
  });

  it('aceita tipo genérico com campos adicionais', () => {
    const ampliados = setores.map(s => ({ ...s, descricao: `desc ${s.nome}`, ativo: true }));
    salvarOrdemSetores('emp-1', ['s2', 's1']);
    const r = aplicarOrdemSetores(ampliados, 'emp-1');
    expect(r.map(s => s.id)).toEqual(['s2', 's1', 's3', 's4']);
    // preserva campos extras
    expect(r[0].descricao).toBe('desc Bravo');
    expect(r[0].ativo).toBe(true);
  });

  it('ids órfãos na ordem persistida (que não estão na lista) são ignorados silenciosamente', () => {
    salvarOrdemSetores('emp-1', ['fantasma-1', 's2', 'fantasma-2', 's1']);
    const r = aplicarOrdemSetores(setores, 'emp-1');
    // s2 (posição 1), s1 (posição 3), resto alfabético
    expect(r.map(s => s.id)).toEqual(['s2', 's1', 's3', 's4']);
  });
});
