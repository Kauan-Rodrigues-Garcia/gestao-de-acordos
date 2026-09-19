import { describe, expect, it } from 'vitest';
import { casaBusca, chaveDeBusca, palavrasDaBusca } from './busca';

describe('busca do chat', () => {
  const chave = chaveDeBusca('João Paulo Silva', 'joao.silva', 'Play 4', 'Equipe Alfa');

  it('ignora acento e caixa', () => {
    expect(casaBusca(chave, palavrasDaBusca('JOAO'))).toBe(true);
  });

  it('cada palavra casa em qualquer lugar, em qualquer ordem', () => {
    expect(casaBusca(chave, palavrasDaBusca('silva joão'))).toBe(true);
    expect(casaBusca(chave, palavrasDaBusca('play 4 alfa'))).toBe(true);
    expect(casaBusca(chave, palavrasDaBusca('joão maria'))).toBe(false);
  });

  it('termo vazio casa com tudo', () => {
    expect(palavrasDaBusca('   ')).toEqual([]);
    expect(casaBusca(chave, [])).toBe(true);
  });

  it('campo nulo não vira a palavra «null»', () => {
    expect(casaBusca(chaveDeBusca('Ana', null, undefined), palavrasDaBusca('null'))).toBe(false);
  });
});
