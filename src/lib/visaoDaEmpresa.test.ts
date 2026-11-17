import { describe, it, expect } from 'vitest';
import { visaoDaEmpresa, indexarVisoes, type VisaoEmpresaBruta } from './visaoDaEmpresa';

const base = (x: Partial<VisaoEmpresaBruta>): VisaoEmpresaBruta => ({
  empresa_id: 'id', nome: 'X', slug: 'x', produto: null,
  regras: [], cidades: [], setores: [], ...x,
});

describe('visaoDaEmpresa', () => {
  it('empresa BOOKPLAY com setores de Birigui e Marília = Nosso produto, duas marcas', () => {
    const v = visaoDaEmpresa(base({
      nome: 'BOOKPLAY', slug: 'bookplay', produto: 'cobranca',
      regras: ['nosso_produto'], cidades: ['Birigui', 'Marília'],
    }));
    expect(v.titulo).toBe('Nosso produto');
    expect(v.detalhe).toBe('BookPlay (Birigui) · PaguePlay (Marília)');
    expect(v.regras).toEqual(['nosso_produto']);
  });

  it('empresa PAGUEPLAY com Conecta Play = Cofen, pelo setor — nunca «PaguePlay»', () => {
    const v = visaoDaEmpresa(base({
      nome: 'PAGUEPLAY', slug: 'pagueplay', produto: 'cobranca',
      regras: ['cofen'], cidades: ['Marília'], setores: ['Conecta Play'],
    }));
    expect(v.titulo).toBe('Cofen');
    expect(v.detalhe).toBe('Conecta Play');
  });

  it('as duas regras na mesma empresa aparecem juntas, Nosso produto primeiro', () => {
    const v = visaoDaEmpresa(base({ produto: 'cobranca', regras: ['cofen', 'nosso_produto'] }));
    expect(v.titulo).toBe('Nosso produto + Cofen');
  });

  it('fora da cobrança o título é o produto', () => {
    expect(visaoDaEmpresa(base({ produto: 'cantina', nome: 'Cantina' })).titulo).toBe('Cantina');
    expect(visaoDaEmpresa(base({ produto: 'rh', nome: 'RH - Recursos Humanos' })).titulo).toBe('RH');
    expect(visaoDaEmpresa(base({ produto: 'comercial', nome: 'COMERCIAL' })).titulo).toBe('Comercial');
  });

  it('sem dado da visão cai no nome do cadastro', () => {
    expect(visaoDaEmpresa(null, 'BOOKPLAY').titulo).toBe('BOOKPLAY');
    expect(visaoDaEmpresa(base({ nome: 'Nova', produto: 'cobranca' })).titulo).toBe('Nova');
  });

  it('regra desconhecida é ignorada', () => {
    expect(visaoDaEmpresa(base({ nome: 'N', produto: 'cobranca', regras: ['xpto'] })).titulo).toBe('N');
  });

  it('indexarVisoes devolve por id', () => {
    const m = indexarVisoes([base({ empresa_id: 'a', produto: 'rh' })]);
    expect(m.get('a')?.titulo).toBe('RH');
  });
});
