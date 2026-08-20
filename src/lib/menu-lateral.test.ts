import { describe, expect, it } from 'vitest';
import { mesclarOrdemVisivel, normalizarOrdemMenu, ordenarMenu } from './menu-lateral';

describe('ordem do menu lateral', () => {
  it('descarta IDs inválidos/duplicados e inclui abas novas no final', () => {
    expect(normalizarOrdemMenu(['/b', '/fantasma', '/b'], ['/a', '/b', '/c']))
      .toEqual(['/b', '/a', '/c']);
  });

  it('ordena os itens sem alterar o array recebido', () => {
    const itens = [{ to: '/a' }, { to: '/b' }, { to: '/c' }];
    expect(ordenarMenu(itens, ['/c', '/a', '/b']).map(i => i.to))
      .toEqual(['/c', '/a', '/b']);
    expect(itens.map(i => i.to)).toEqual(['/a', '/b', '/c']);
  });

  it('reordena apenas abas visíveis e preserva as ocultas', () => {
    expect(mesclarOrdemVisivel(['/a', '/oculta', '/b', '/c'], ['/c', '/a', '/b']))
      .toEqual(['/c', '/oculta', '/a', '/b']);
  });
});
