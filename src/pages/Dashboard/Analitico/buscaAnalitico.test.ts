import { describe, expect, it } from 'vitest';
import {
  codigoCasa, filtrarGruposPorBusca, operadorCasaBusca, recebimentoCasaBusca, termoParaBanco,
} from './buscaAnalitico';
import type { GrupoOperadores } from '@/pages/Analitico/ListaOperadores';
import type { LinhaOperadorPainel } from '@/pages/Analitico/linhaOperador';

describe('recebimentoCasaBusca', () => {
  const linha = { codigo: '1234567', nome_cliente: 'João da Conceição', instituicao: 'Mundial Editora' };

  it('acha pelo NR, pelo cliente (sem acento) e pela empresa', () => {
    expect(recebimentoCasaBusca(linha, '4567')).toBe(true);
    expect(recebimentoCasaBusca(linha, 'joao conc')).toBe(false);
    expect(recebimentoCasaBusca(linha, 'CONCEICAO')).toBe(true);
    expect(recebimentoCasaBusca(linha, 'mundial')).toBe(true);
    expect(recebimentoCasaBusca(linha, 'maria')).toBe(false);
  });

  it('termo vazio casa com tudo', () => {
    expect(recebimentoCasaBusca(linha, '  ')).toBe(true);
  });
});

describe('codigoCasa', () => {
  it('compara só os dígitos quando o termo tem pontuação', () => {
    expect(codigoCasa('1234567', '123.456-7')).toBe(true);
    expect(codigoCasa('123.456-7', '1234567')).toBe(true);
  });

  it('menos de 3 dígitos não vira busca por dígito', () => {
    expect(codigoCasa('1234567', '1-2')).toBe(false);
  });
});

describe('operadorCasaBusca', () => {
  it('acha pelo nome ou pelo login', () => {
    expect(operadorCasaBusca({ nome: 'Ana Júlia', usuario: 'ana.j' }, 'julia')).toBe(true);
    expect(operadorCasaBusca({ nome: null, usuario: 'ana.j' }, 'ANA.J')).toBe(true);
    expect(operadorCasaBusca({ nome: 'Ana', usuario: 'ana' }, 'bruno')).toBe(false);
  });
});

describe('filtrarGruposPorBusca', () => {
  const item = (id: string, nome: string): LinhaOperadorPainel => ({
    operador_id: id, usuario: id, nome, equipeId: 'e', equipeNome: 'E',
    valor: 10, ho: null, pagamentos: 1, novos: 0, porForma: [],
  });
  const grupos: GrupoOperadores[] = [
    { equipeId: 'e1', equipeNome: 'Equipe 1', itens: [item('a', 'Ana'), item('b', 'Bruno')] },
    { equipeId: 'e2', equipeNome: 'Equipe 2', itens: [item('c', 'Carla')] },
  ];

  it('fica quem casa pelo nome e quem tem recebimento achado; equipe vazia sai', () => {
    const r = filtrarGruposPorBusca(grupos, 'ana', new Set(['b']));
    expect(r).toHaveLength(1);
    expect(r[0].itens.map(i => i.operador_id)).toEqual(['a', 'b']);
  });

  it('sem termo devolve a lista inteira', () => {
    expect(filtrarGruposPorBusca(grupos, '', new Set())).toHaveLength(2);
  });
});

describe('termoParaBanco', () => {
  it('tira o que quebra o filtro do PostgREST', () => {
    expect(termoParaBanco('12,3(4)%5*')).toBe('12 3 4 5');
  });

  it('número com pontuação vai só com os dígitos', () => {
    expect(termoParaBanco('123.456-7')).toBe('1234567');
  });

  it('curto demais não vai ao banco', () => {
    expect(termoParaBanco('ab')).toBeNull();
    expect(termoParaBanco(' , ')).toBeNull();
  });
});
