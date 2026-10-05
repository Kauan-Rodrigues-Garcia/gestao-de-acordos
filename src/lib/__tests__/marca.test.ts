import { describe, expect, it } from 'vitest';
import { marcaDaCidade } from '@/lib/marca';

describe('marcaDaCidade', () => {
  it('Birigui é BookPlay (tons azuis), Marília é PaguePlay (tons verdes) — tom, não tema', () => {
    expect(marcaDaCidade('Birigui')).toEqual({ nome: 'BookPlay', tom: 'bookplay' });
    expect(marcaDaCidade('Marília')).toEqual({ nome: 'PaguePlay', tom: 'pagueplay' });
    expect(marcaDaCidade(' marilia ')).toEqual({ nome: 'PaguePlay', tom: 'pagueplay' });
  });

  it('cidade sem marca ou ausente dá null', () => {
    expect(marcaDaCidade('Araçatuba')).toBeNull();
    expect(marcaDaCidade(null)).toBeNull();
  });
});
