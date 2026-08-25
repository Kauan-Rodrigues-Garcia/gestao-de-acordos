/**
 * O que estes testes protegem é uma REGRA, não uma função.
 *
 * A regra: aba sem produto declarado não aparece em lugar nenhum. Ela existe
 * porque a régua anterior era por exclusão, e com o quarto tenant a omissão
 * virou vazamento — o Comercial abriu mostrando a cobrança inteira.
 *
 * Se alguém um dia «consertar» `produtoPermite` para devolver `true` quando a
 * lista falta, estes testes quebram. É esse o ponto.
 */
import { describe, it, expect } from 'vitest';
import {
  produtoDaEmpresa, produtoDoSlug, produtoPermite, ehProduto, rotuloDoProduto,
  type Produto,
} from '../produto';

const empresa = (slug: string, produto?: string | null) =>
  ({ slug, produto } as { slug: string; produto?: string | null });

describe('produtoDaEmpresa', () => {
  it('BookPlay e PaguePlay são duas empresas do MESMO produto', () => {
    expect(produtoDaEmpresa(empresa('bookplay'))).toBe('cobranca');
    expect(produtoDaEmpresa(empresa('pagueplay'))).toBe('cobranca');
  });

  it('Comercial e RH são outros produtos', () => {
    expect(produtoDaEmpresa(empresa('comercial'))).toBe('comercial');
    expect(produtoDaEmpresa(empresa('rh'))).toBe('rh');
  });

  it('a coluna do banco manda sobre o mapa de slug', () => {
    // O mapa é atalho para o instante em que a linha ainda não voltou. Quando
    // ela volta, é ela que decide — senão renomear um slug quebraria o produto.
    expect(produtoDaEmpresa(empresa('bookplay', 'comercial'))).toBe('comercial');
  });

  it('cai no slug do site quando ainda não há empresa carregada', () => {
    expect(produtoDaEmpresa(null, 'comercial')).toBe('comercial');
  });

  it('devolve null para slug desconhecido, e NÃO cobrança', () => {
    // O padrão silencioso era o bug. Empresa nova sem produto declarado tem de
    // aparecer vazia, não vestida de cobrança.
    expect(produtoDaEmpresa(empresa('financeiro'))).toBeNull();
    expect(produtoDaEmpresa(null, null)).toBeNull();
  });

  it('ignora produto inválido gravado na coluna e volta ao slug', () => {
    expect(produtoDaEmpresa(empresa('bookplay', 'qualquer-coisa'))).toBe('cobranca');
  });
});

describe('produtoPermite — a lista branca', () => {
  it('sem lista declarada, a aba não existe em produto nenhum', () => {
    expect(produtoPermite(undefined, 'cobranca')).toBe(false);
    expect(produtoPermite([], 'cobranca')).toBe(false);
  });

  it('sem saber o produto, não mostra nada', () => {
    // Enquanto a empresa carrega. Meio segundo vazio é melhor do que meio
    // segundo com as abas do produto errado.
    expect(produtoPermite(['cobranca'], null)).toBe(false);
  });

  it('só libera o que foi declarado', () => {
    const so: readonly Produto[] = ['cobranca'];
    expect(produtoPermite(so, 'cobranca')).toBe(true);
    expect(produtoPermite(so, 'comercial')).toBe(false);
    expect(produtoPermite(so, 'rh')).toBe(false);
  });

  it('aba de vários produtos vale em todos eles', () => {
    const todos: readonly Produto[] = ['cobranca', 'comercial', 'rh'];
    expect(produtoPermite(todos, 'comercial')).toBe(true);
    expect(produtoPermite(todos, 'rh')).toBe(true);
  });
});

describe('ehProduto', () => {
  it('reconhece os três, e recusa o resto', () => {
    expect(ehProduto('cobranca')).toBe(true);
    expect(ehProduto('comercial')).toBe(true);
    expect(ehProduto('rh')).toBe(true);
    expect(ehProduto('vendas')).toBe(false);
    expect(ehProduto(null)).toBe(false);
    expect(ehProduto(undefined)).toBe(false);
    expect(ehProduto(42)).toBe(false);
  });
});

describe('produtoDoSlug', () => {
  it('normaliza espaço e caixa', () => {
    expect(produtoDoSlug('  BookPlay ')).toBe('cobranca');
    expect(produtoDoSlug('COMERCIAL')).toBe('comercial');
  });
});

describe('rotuloDoProduto', () => {
  it('dá nome ao que a tela mostra, inclusive ao desconhecido', () => {
    expect(rotuloDoProduto('cobranca')).toBe('Cobrança');
    expect(rotuloDoProduto('comercial')).toBe('Comercial');
    expect(rotuloDoProduto('rh')).toBe('Recursos Humanos');
    expect(rotuloDoProduto(null)).toBe('Sem produto definido');
  });
});
