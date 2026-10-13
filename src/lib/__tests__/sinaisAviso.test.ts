/** O aviso com os ids (20261013170000): leitura tolerante e «diz respeito a mim?». */
import { describe, expect, it } from 'vitest';
import { avisoToca, normalizarAviso } from '@/lib/sinais';

describe('normalizarAviso', () => {
  it('lê ids e autores, descartando o que não é texto', () => {
    expect(normalizarAviso({ tabela: 'tickets', operacao: 'INSERT', ids: ['a', 1, null], autores: ['u'] }))
      .toEqual({ tabela: 'tickets', operacao: 'INSERT', ids: ['a'], autores: ['u'], recarregar: false });
  });

  it('payload vazio vira UPDATE sem ids', () => {
    expect(normalizarAviso({})).toEqual({ tabela: '', operacao: 'UPDATE', ids: [], autores: [], recarregar: false });
  });
});

describe('avisoToca', () => {
  const aviso = normalizarAviso({ tabela: 'tickets', operacao: 'UPDATE', ids: ['t1'] });
  it('só o registro avisado', () => {
    expect(avisoToca(aviso, 't1')).toBe(true);
    expect(avisoToca(aviso, 't2')).toBe(false);
    expect(avisoToca(aviso, null)).toBe(false);
  });
  it('«recarregar» toca todo mundo', () => {
    expect(avisoToca(normalizarAviso({ recarregar: true }), 'qualquer')).toBe(true);
  });
});
