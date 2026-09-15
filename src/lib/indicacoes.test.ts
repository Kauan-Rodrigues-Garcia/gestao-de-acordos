import { describe, it, expect } from 'vitest';
import {
  parseColagem, chaveDaInstituicao, dataDoTexto,
  prontosParaGravar, repetidasNaGrade, itemVazio,
} from './indicacoes';

const HOJE = '2026-09-15';

describe('a data, nos dois formatos que existem por aqui', () => {
  it('aceita o da planilha pt-BR', () => {
    expect(dataDoTexto('03/09/2026')).toBe('2026-09-03');
    expect(dataDoTexto('3/9/2026')).toBe('2026-09-03');
  });

  it('aceita o de export', () => {
    expect(dataDoTexto('2026-09-03')).toBe('2026-09-03');
  });

  it('ano de dois dígitos vira 20xx, não ano 26', () => {
    expect(dataDoTexto('03/09/26')).toBe('2026-09-03');
  });

  it('31 de fevereiro não existe — e `new Date` o aceitaria virando 03/03', () => {
    expect(dataDoTexto('31/02/2026')).toBeNull();
    expect(dataDoTexto('2026-02-31')).toBeNull();
  });

  it('mês 13 e dia 0 também não', () => {
    expect(dataDoTexto('01/13/2026')).toBeNull();
    expect(dataDoTexto('00/09/2026')).toBeNull();
  });

  it('29 de fevereiro vale em ano bissexto e não vale fora dele', () => {
    expect(dataDoTexto('29/02/2024')).toBe('2024-02-29');
    expect(dataDoTexto('29/02/2026')).toBeNull();
  });

  it('vazio e lixo são null', () => {
    expect(dataDoTexto('')).toBeNull();
    expect(dataDoTexto('   ')).toBeNull();
    expect(dataDoTexto('ontem')).toBeNull();
    expect(dataDoTexto(null)).toBeNull();
  });
});

describe('a chave da instituição', () => {
  it('ignora caixa e espaço sobrando', () => {
    expect(chaveDaInstituicao('  Colégio São José ')).toBe('colégio são josé');
    expect(chaveDaInstituicao('COLÉGIO SÃO JOSÉ')).toBe('colégio são josé');
  });

  it('espaço duplo interno some — planilha cola assim o tempo todo', () => {
    expect(chaveDaInstituicao('Colégio  São   José')).toBe('colégio são josé');
  });
});

describe('colar da planilha', () => {
  it('lê TAB, que é o que o Excel cola', () => {
    const r = parseColagem(
      'Colégio São José\tMaria Fátima\t(14) 99999-0000\t03/09/2026',
      HOJE,
    );
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toEqual({
      instituicao: 'Colégio São José',
      gestora: 'Maria Fátima',
      telefone: '(14) 99999-0000',
      data_indicacao: '2026-09-03',
      observacao: null,
    });
  });

  it('lê ponto e vírgula, que é o que vem do bloco de notas', () => {
    const r = parseColagem('Escola Nova;Ana;14988887777;2026-09-10', HOJE);
    expect(r.itens[0].gestora).toBe('Ana');
    expect(r.itens[0].data_indicacao).toBe('2026-09-10');
  });

  it('TAB vence, para o nome poder conter ponto e vírgula', () => {
    // «Colégio Santa Rita; Unidade II» é um nome só, e partir nele criaria
    // duas escolas que não existem.
    const r = parseColagem('Colégio Santa Rita; Unidade II\tAna', HOJE);
    expect(r.itens[0].instituicao).toBe('Colégio Santa Rita; Unidade II');
    expect(r.itens[0].gestora).toBe('Ana');
  });

  it('a decisão do separador é POR LINHA', () => {
    const r = parseColagem('Escola A\tAna\nEscola B;Bia', HOJE);
    expect(r.itens.map(i => i.gestora)).toEqual(['Ana', 'Bia']);
  });

  it('sem data vale hoje — o caso de quem acabou de voltar da visita', () => {
    const r = parseColagem('Escola A\tAna\t14999', HOJE);
    expect(r.itens[0].data_indicacao).toBe(HOJE);
  });

  it('data ilegível também vira hoje, e não perde a escola', () => {
    // Recusar a linha por causa de «12/13/2026» jogaria fora o nome, que é o
    // que importa. A pessoa corrige na grade antes de gravar.
    const r = parseColagem('Escola A\tAna\t14999\t12/13/2026', HOJE);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].data_indicacao).toBe(HOJE);
  });

  it('linha em branco é ignorada em silêncio; linha sem instituição é RELATADA', () => {
    const r = parseColagem('Escola A\n\n\tAna\t14999\nEscola B', HOJE);
    expect(r.itens.map(i => i.instituicao)).toEqual(['Escola A', 'Escola B']);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0].linha).toBe(3);
  });

  it('acusa repetida dentro da própria colagem, antes da ida ao banco', () => {
    const r = parseColagem('Colégio São José\nEscola B\ncolégio  são josé', HOJE);
    expect(r.itens).toHaveLength(3);
    expect(r.repetidasNaColagem).toEqual(['colégio  são josé']);
  });

  it('colagem vazia não explode', () => {
    const r = parseColagem('', HOJE);
    expect(r.itens).toEqual([]);
    expect(r.ignoradas).toEqual([]);
    expect(r.repetidasNaColagem).toEqual([]);
  });

  it('CRLF do Windows não vira linha fantasma', () => {
    const r = parseColagem('Escola A\r\nEscola B\r\n', HOJE);
    expect(r.itens).toHaveLength(2);
    expect(r.itens[1].instituicao).toBe('Escola B');
  });
});

describe('a grade antes de gravar', () => {
  it('linha em branco não é erro — é o espaço esperando', () => {
    const itens = [
      { ...itemVazio(HOJE), instituicao: 'Escola A' },
      itemVazio(HOJE),
    ];
    expect(prontosParaGravar(itens)).toHaveLength(1);
  });

  it('marca as DUAS repetidas, não só a segunda', () => {
    const itens = [
      { ...itemVazio(HOJE), instituicao: 'Escola A' },
      { ...itemVazio(HOJE), instituicao: 'Escola B' },
      { ...itemVazio(HOJE), instituicao: 'ESCOLA A ' },
    ];
    // Dizer só «a terceira repete» faz procurar a primeira à mão numa lista
    // de trinta.
    expect([...repetidasNaGrade(itens)].sort()).toEqual([0, 2]);
  });

  it('linha em branco não conta como repetida de outra em branco', () => {
    const itens = [itemVazio(HOJE), itemVazio(HOJE)];
    expect(repetidasNaGrade(itens).size).toBe(0);
  });

  it('o nome vai aparado para o banco', () => {
    const itens = [{ ...itemVazio(HOJE), instituicao: '  Escola A  ' }];
    expect(prontosParaGravar(itens)[0].instituicao).toBe('Escola A');
  });
});
