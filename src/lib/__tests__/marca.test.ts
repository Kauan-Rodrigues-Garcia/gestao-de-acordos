import { describe, expect, it } from 'vitest';
import { marcaDaCidade } from '@/lib/marca';

describe('marcaDaCidade', () => {
  it('Birigui é BookPlay azul, Marília é PaguePlay verde', () => {
    expect(marcaDaCidade('Birigui')).toEqual({ nome: 'BookPlay', tema: 'light' });
    expect(marcaDaCidade('Marília')).toEqual({ nome: 'PaguePlay', tema: 'verde' });
    expect(marcaDaCidade(' marilia ')).toEqual({ nome: 'PaguePlay', tema: 'verde' });
  });

  it('cidade sem marca ou ausente dá null', () => {
    expect(marcaDaCidade('Araçatuba')).toBeNull();
    expect(marcaDaCidade(null)).toBeNull();
  });
});
