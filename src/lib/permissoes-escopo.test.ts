import { describe, expect, it } from 'vitest';
import { escoposPermitidos, PERMISSOES_ESCOPO, temEscopo } from './permissoes-escopo';

describe('escopos de permissão por aba', () => {
  it('não compartilha chaves entre abas', () => {
    const chaves = Object.values(PERMISSOES_ESCOPO)
      .flatMap(mapa => Object.values(mapa).map(meta => meta.permissao));
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('uma concessão no Dashboard não libera Acordos', () => {
    const concedidas = new Set(['dashboard_escopo_todos_setores']);
    const pode = (chave: string) => concedidas.has(chave);
    expect(temEscopo('dashboard', 'todos_setores', pode)).toBe(true);
    expect(temEscopo('acordos', 'todos_setores', pode)).toBe(false);
    expect(escoposPermitidos('pix_automatico', pode)).toEqual([]);
  });
});
