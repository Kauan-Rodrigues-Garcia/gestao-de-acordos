import { describe, it, expect } from 'vitest';
import {
  parseColagem, chaveDaInstituicao, chaveDoTelefone, dataDoTexto,
  prontosParaGravar, repetidasNaGrade, contatoVazio, telefonesDaCelula,
  telefonesColados, agruparPorContato,
  type ContatoIndicacao,
} from './indicacoes';

const HOJE = '2026-09-15';

function contato(parcial: Partial<ContatoIndicacao>): ContatoIndicacao {
  return { ...contatoVazio(HOJE), ...parcial };
}

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

describe('a chave do telefone — a mesma de fn_indicacao_telefone_chave', () => {
  it('só os dígitos: o mesmo número escrito de três jeitos é um contato', () => {
    expect(chaveDoTelefone('(18) 93505-6541')).toBe('18935056541');
    expect(chaveDoTelefone('18 935056541')).toBe('18935056541');
    expect(chaveDoTelefone('18.93505.6541')).toBe('18935056541');
  });

  it('o 55 do país sai, no celular e no fixo', () => {
    expect(chaveDoTelefone('+55 18 93505-6541')).toBe('18935056541');
    expect(chaveDoTelefone('+55 (18) 3505-6541')).toBe('1835056541');
  });

  it('o zero de interurbano sai', () => {
    expect(chaveDoTelefone('0 18 93505-6541')).toBe('18935056541');
    expect(chaveDoTelefone('0055 18 93505-6541')).toBe('18935056541');
  });

  it('DDD 55 (Santa Maria) com número de 11 dígitos NÃO perde o 55', () => {
    // Só sai o 55 que sobra: com 12 ou 13 dígitos. 55 + 9 dígitos é DDD.
    expect(chaveDoTelefone('(55) 99999-0000')).toBe('55999990000');
  });

  it('sem dígito nenhum não é chave', () => {
    expect(chaveDoTelefone('não tem')).toBeNull();
    expect(chaveDoTelefone('')).toBeNull();
    expect(chaveDoTelefone(null)).toBeNull();
  });
});

describe('os números de uma célula', () => {
  it('Alt+Enter separa', () => {
    expect(telefonesDaCelula('18 935056541\n18 93505 9999')).toEqual(['18 935056541', '18 93505 9999']);
  });

  it('barra, vírgula e ponto e vírgula separam quando todos os pedaços são número', () => {
    expect(telefonesDaCelula('18 93505-1111 / 18 93505-2222')).toEqual(['18 93505-1111', '18 93505-2222']);
    expect(telefonesDaCelula('18935051111, 18935052222')).toEqual(['18935051111', '18935052222']);
  });

  it('«ramal 2» não vira um segundo contato', () => {
    expect(telefonesDaCelula('(18) 3505-6541 / ramal 2')).toEqual(['(18) 3505-6541 / ramal 2']);
  });

  it('vazio é lista vazia', () => {
    expect(telefonesDaCelula('')).toEqual([]);
    expect(telefonesDaCelula(undefined)).toEqual([]);
  });
});

describe('colar da planilha', () => {
  it('lê TAB, que é o que o Excel cola', () => {
    const r = parseColagem(
      'Colégio São José\tMaria Fátima\t(14) 99999-0000\t03/09/2026',
      HOJE,
    );
    expect(r.contatos).toEqual([{
      instituicao: 'Colégio São José',
      gestora: 'Maria Fátima',
      telefones: ['(14) 99999-0000'],
      data_indicacao: '2026-09-03',
      observacao: null,
    }]);
  });

  it('lê ponto e vírgula, que é o que vem do bloco de notas', () => {
    const r = parseColagem('Escola Nova;Ana;14988887777;2026-09-10', HOJE);
    expect(r.contatos[0].gestora).toBe('Ana');
    expect(r.contatos[0].data_indicacao).toBe('2026-09-10');
  });

  it('TAB vence, para o nome poder conter ponto e vírgula', () => {
    // «Colégio Santa Rita; Unidade II» é um nome só, e partir nele criaria
    // duas escolas que não existem.
    const r = parseColagem('Colégio Santa Rita; Unidade II\tAna', HOJE);
    expect(r.contatos[0].instituicao).toBe('Colégio Santa Rita; Unidade II');
    expect(r.contatos[0].gestora).toBe('Ana');
  });

  it('a decisão do separador é POR LINHA', () => {
    const r = parseColagem('Escola A\tAna\nEscola B;Bia', HOJE);
    expect(r.contatos.map(c => c.gestora)).toEqual(['Ana', 'Bia']);
  });

  it('sem data vale hoje — o caso de quem acabou de voltar da visita', () => {
    const r = parseColagem('Escola A\tAna\t14999999999', HOJE);
    expect(r.contatos[0].data_indicacao).toBe(HOJE);
  });

  it('data ilegível também vira hoje, e não perde a escola', () => {
    // Recusar a linha por causa de «12/13/2026» jogaria fora o nome, que é o
    // que importa. A pessoa corrige na grade antes de gravar.
    const r = parseColagem('Escola A\tAna\t14999999999\t12/13/2026', HOJE);
    expect(r.contatos).toHaveLength(1);
    expect(r.contatos[0].data_indicacao).toBe(HOJE);
  });

  it('linha em branco é ignorada em silêncio', () => {
    const r = parseColagem('Escola A\n\n\nEscola B', HOJE);
    expect(r.contatos.map(c => c.instituicao)).toEqual(['Escola A', 'Escola B']);
    expect(r.ignoradas).toEqual([]);
  });

  it('linha sem instituição e sem nada acima de onde herdar é RELATADA', () => {
    const r = parseColagem('\tAna\t14999999999\nEscola B', HOJE);
    expect(r.contatos.map(c => c.instituicao)).toEqual(['Escola B']);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0].linha).toBe(1);
  });

  it('colagem vazia não explode', () => {
    const r = parseColagem('', HOJE);
    expect(r.contatos).toEqual([]);
    expect(r.ignoradas).toEqual([]);
  });

  it('CRLF do Windows não vira linha fantasma', () => {
    const r = parseColagem('Escola A\r\nEscola B\r\n', HOJE);
    expect(r.contatos).toHaveLength(2);
    expect(r.contatos[1].instituicao).toBe('Escola B');
  });
});

describe('um contato, vários telefones — o pedido de 18/09', () => {
  const ESPERADO = ['18 935056541', '18 93505 1111', '18 93505 2222', '18 93505 3333'];

  it('vários números na MESMA célula (Alt+Enter): o Excel cola entre aspas', () => {
    // Antes, cada número depois do primeiro virava uma escola nova.
    const colado =
      'Colegio São José\tMaria Clara\t"18 935056541\n18 93505 1111\n18 93505 2222\n18 93505 3333"\t03/09/2026\r\n';
    const r = parseColagem(colado, HOJE);
    expect(r.contatos).toHaveLength(1);
    expect(r.contatos[0].instituicao).toBe('Colegio São José');
    expect(r.contatos[0].gestora).toBe('Maria Clara');
    expect(r.contatos[0].telefones).toEqual(ESPERADO);
    expect(r.contatos[0].data_indicacao).toBe('2026-09-03');
    expect(r.ignoradas).toEqual([]);
  });

  it('só o número nas linhas de baixo: é mais telefone do contato de cima', () => {
    const colado = 'Colegio São José\tMaria Clara\t18 935056541\n18 93505 1111\n18 93505 2222\n18 93505 3333';
    const r = parseColagem(colado, HOJE);
    expect(r.contatos).toHaveLength(1);
    expect(r.contatos[0].telefones).toEqual(ESPERADO);
  });

  it('célula mesclada: instituição e gestora em branco embaixo valem as de cima', () => {
    const colado = [
      'Colegio São José\tMaria Clara\t18 935056541\t03/09/2026',
      '\t\t18 93505 1111',
      '\t\t18 93505 2222',
      '\t\t18 93505 3333',
    ].join('\r\n');
    const r = parseColagem(colado, HOJE);
    expect(r.contatos).toHaveLength(1);
    expect(r.contatos[0].telefones).toEqual(ESPERADO);
    // A data também vem de cima: é a mesma visita.
    expect(r.contatos[0].data_indicacao).toBe('2026-09-03');
  });

  it('a escola repetida em toda linha chega igual à mesclada', () => {
    const colado = [
      'Colegio São José\tMaria Clara\t18 935056541',
      'Colegio São José\tMaria Clara\t18 93505 1111',
      'COLEGIO SÃO JOSÉ \tMaria Clara\t18 93505 2222',
    ].join('\n');
    const r = parseColagem(colado, HOJE);
    expect(r.contatos).toHaveLength(1);
    expect(r.contatos[0].telefones).toHaveLength(3);
  });

  it('outra gestora da mesma escola é outro contato, com a escola herdada', () => {
    const colado = 'Colegio São José\tMaria Clara\t18935051111\n\tAna\t18935052222';
    const r = parseColagem(colado, HOJE);
    expect(r.contatos.map(c => [c.instituicao, c.gestora, c.telefones])).toEqual([
      ['Colegio São José', 'Maria Clara', ['18935051111']],
      ['Colegio São José', 'Ana', ['18935052222']],
    ]);
  });

  it('a escola seguinte começa um contato novo', () => {
    const colado = [
      'Escola A\tAna\t18935051111',
      '18935052222',
      'Escola B\tBia\t18935053333',
      '18935054444',
    ].join('\n');
    const r = parseColagem(colado, HOJE);
    expect(r.contatos.map(c => c.telefones)).toEqual([
      ['18935051111', '18935052222'],
      ['18935053333', '18935054444'],
    ]);
  });

  it('número solto sem contato acima é relatado, não vira escola', () => {
    const r = parseColagem('18 93505 1111\nEscola A\tAna', HOJE);
    expect(r.contatos.map(c => c.instituicao)).toEqual(['Escola A']);
    expect(r.ignoradas[0].linha).toBe(1);
  });

  it('nome de escola com número continua sendo escola', () => {
    const r = parseColagem('Escola A\tAna\t18935051111\nColégio 24 de Maio\tBia', HOJE);
    expect(r.contatos.map(c => c.instituicao)).toEqual(['Escola A', 'Colégio 24 de Maio']);
  });

  it('a linha seguinte a uma célula citada é contada certo no relato', () => {
    const colado = 'Escola A\tAna\t"18935051111\n18935052222"\n\n\t\t\t03/09/2026';
    const r = parseColagem(colado, HOJE);
    expect(r.ignoradas).toEqual([{ linha: 4, conteudo: '03/09/2026' }]);
  });

  it('aspas no meio do nome não são aspas de célula', () => {
    const r = parseColagem('"Tia Nena" Escola\tAna', HOJE);
    expect(r.contatos[0].instituicao).toBe('"Tia Nena" Escola');
  });

  it('aspas dobradas dentro da célula citada viram uma', () => {
    const r = parseColagem('"Escola ""Tia Nena""\nUnidade II"\tAna', HOJE);
    expect(r.contatos[0].instituicao).toBe('Escola "Tia Nena" Unidade II');
  });
});

describe('colar direto no campo de telefone', () => {
  it('uma célula com Alt+Enter, como o Excel a copia', () => {
    expect(telefonesColados('"18935051111\n18935052222"\r\n')).toEqual(['18935051111', '18935052222']);
  });

  it('uma coluna inteira do Excel', () => {
    expect(telefonesColados('18935051111\r\n18935052222\r\n')).toEqual(['18935051111', '18935052222']);
  });
});

describe('a grade antes de gravar', () => {
  it('contato em branco não é erro — é o espaço esperando', () => {
    const grade = [contato({ instituicao: 'Escola A' }), contatoVazio(HOJE)];
    expect(prontosParaGravar(grade)).toHaveLength(1);
  });

  it('cada telefone é UMA indicação, com a escola e a gestora do contato', () => {
    const grade = [contato({
      instituicao: ' Escola A ', gestora: 'Ana', telefones: ['18935051111', ' ', '18935052222'],
    })];
    expect(prontosParaGravar(grade)).toEqual([
      { instituicao: 'Escola A', gestora: 'Ana', telefone: '18935051111', data_indicacao: HOJE, observacao: null },
      { instituicao: 'Escola A', gestora: 'Ana', telefone: '18935052222', data_indicacao: HOJE, observacao: null },
    ]);
  });

  it('contato sem número vira uma indicação sem telefone', () => {
    const itens = prontosParaGravar([contato({ instituicao: 'Escola A', telefones: [''] })]);
    expect(itens).toHaveLength(1);
    expect(itens[0].telefone).toBeNull();
  });

  it('vários números da mesma escola NÃO são repetidos', () => {
    const grade = [contato({ instituicao: 'Escola A', telefones: ['18935051111', '18935052222'] })];
    expect(repetidasNaGrade(grade).size).toBe(0);
  });

  it('o mesmo número em dois lugares marca os DOIS, mesmo escrito diferente', () => {
    const grade = [
      contato({ instituicao: 'Escola A', telefones: ['(18) 93505-1111'] }),
      contato({ instituicao: 'Escola B', telefones: ['18935052222', '+55 18 93505 1111'] }),
    ];
    // Dizer só «o terceiro repete» faz procurar o primeiro à mão numa lista
    // de trinta.
    expect([...repetidasNaGrade(grade)].sort()).toEqual(['0:0', '1:1']);
  });

  it('escola sem número que já tem outra linha é marcada — só ela', () => {
    const grade = [
      contato({ instituicao: 'Escola A', telefones: ['18935051111'] }),
      contato({ instituicao: 'ESCOLA A ', telefones: [''] }),
    ];
    expect([...repetidasNaGrade(grade)]).toEqual(['1:*']);
  });

  it('duas vezes a mesma escola sem número: as duas', () => {
    const grade = [
      contato({ instituicao: 'Escola A' }),
      contato({ instituicao: 'escola a' }),
    ];
    expect([...repetidasNaGrade(grade)].sort()).toEqual(['0:*', '1:*']);
  });

  it('contato em branco não conta como repetido de outro em branco', () => {
    expect(repetidasNaGrade([contatoVazio(HOJE), contatoVazio(HOJE)]).size).toBe(0);
  });
});

describe('a lista gravada, em blocos de contato', () => {
  it('junta os números da mesma escola e gestora, na ordem do primeiro', () => {
    const itens = [
      { id: 1, instituicao: 'Escola A', gestora: 'Ana' },
      { id: 2, instituicao: 'Escola B', gestora: null },
      { id: 3, instituicao: 'escola a ', gestora: 'ANA' },
      { id: 4, instituicao: 'Escola A', gestora: 'Bia' },
    ];
    expect(agruparPorContato(itens).map(g => g.map(i => i.id))).toEqual([[1, 3], [2], [4]]);
  });
});
