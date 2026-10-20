import { describe, expect, it } from 'vitest';
import {
  labelPagamentoBookplay,
  parseRelatorioBookplayRows,
} from './bookplayRecebimentoParser';

const CABECALHO = [
  'Cobradora',
  'Equipe/SubGrupo',
  'Cliente',
  'Título',
  'Colchão?',
  'Parcela',
  'NrDocumento',
  'Empresa',
  'TpDoc',
  'Tipo comissão',
  'DtPgto',
  'Recebido',
];

function linha({
  operador = 'AGATHA_ROCHA',
  equipe = 'RECEPTIVO',
  cliente = '123 - CLIENTE TESTE',
  titulo = '4191831',
  colchao = 'Não',
  parcela = '1',
  nr = '12847788',
  tpdoc = 'PIX AUTOMÁTICO',
  tipoComissao = 'Integral',
  data = '12/08/2026',
  valor = 100,
} = {}) {
  return [
    operador,
    equipe,
    cliente,
    titulo,
    colchao,
    parcela,
    nr,
    'FACULDADE BOOKPLAY',
    tpdoc,
    tipoComissao,
    data,
    valor,
  ];
}

describe('parseRelatorioBookplayRows — relatório 58', () => {
  it('aceita Colchão somente até 14/08/2026 e preserva NR/parcelas posteriores', () => {
    const resultado = parseRelatorioBookplayRows([
      CABECALHO,
      linha({ colchao: 'Sim', data: '12/08/2026', valor: 125 }),
      // 15/08: DEPOIS do corte (que passou a ser o dia 14 em 23/08/2026).
      linha({ colchao: 'Sim', data: '15/08/2026', parcela: '15', valor: 40 }),
      linha({ colchao: 'Sim', data: '15/08/2026', parcela: '16', valor: 60 }),
      linha({ colchao: 'Não', data: '15/08/2026', nr: '999', valor: 75 }),
    ]);

    expect(resultado.colchaoNaMeta).toEqual({ linhas: 1, valor: 125 });
    expect(resultado.analitico.reduce((s, l) => s + l.valor_recebido, 0)).toBe(200);
    expect(resultado.diario.reduce((s, l) => s + l.valor_recebido, 0)).toBe(200);
    expect(resultado.colchao).toHaveLength(2);
    expect(resultado.colchao.map(l => l.nr_documento)).toEqual(['12847788', '12847788']);
    expect(resultado.colchao.map(l => l.parcela)).toEqual(['15', '16']);
  });

  it('remove Retenção de todas as saídas antes da consolidação', () => {
    const resultado = parseRelatorioBookplayRows([
      CABECALHO,
      linha({ equipe: 'EQUIPE RETENÇÃO / RETENÇÃO', valor: 999 }),
      linha({ equipe: 'Retenção', colchao: 'Sim', data: '13/08/2026', valor: 888 }),
      linha({ nr: '777', valor: 50 }),
    ]);

    expect(resultado.retencaoRemovidas).toBe(2);
    expect(resultado.analitico).toHaveLength(1);
    expect(resultado.diario).toHaveLength(1);
    expect(resultado.colchao).toHaveLength(0);
  });

  /*
   * O Colchão NÃO conta para o setor — nunca, fora da janela de agosto/2026.
   * Ele entra no total da empresa e fica de fora de setor, equipe e operador,
   * igual à Retenção.
   *
   * Em 13/09/2026 esta regra chegou a ser removida por engano, e a diretoria
   * corrigiu no mesmo dia. Se alguém tentar de novo, estes dois testes caem.
   */
  it('fora de agosto, todo Colchão fica somente no acompanhamento', () => {
    const resultado = parseRelatorioBookplayRows([
      CABECALHO,
      linha({ colchao: 'Sim', data: '01/09/2026' }),
    ]);

    expect(resultado.analitico).toHaveLength(0);
    expect(resultado.diario).toHaveLength(0);
    expect(resultado.colchao).toHaveLength(1);
    expect(resultado.colchaoNaMeta).toEqual({ linhas: 0, valor: 0 });
  });

  it('dentro da janela de agosto/2026 o Colchão conta, como exceção daquele mês', () => {
    const resultado = parseRelatorioBookplayRows([
      CABECALHO,
      linha({ colchao: 'Sim', data: '10/08/2026' }),
    ]);

    expect(resultado.analitico).toHaveLength(1);
    expect(resultado.colchao).toHaveLength(0);
    expect(resultado.colchaoNaMeta.linhas).toBe(1);
  });

  /*
   * Até 20/10/2026 o NR inteiro virava UMA linha com a data do primeiro
   * pagamento, e num mês do 59 o pagamento de hoje sumia junto com a entrada de
   * ontem — ver o bloco do Analítico no parser.
   */
  it('analítico: uma linha por operador + NR + dia, somando o que caiu no dia', () => {
    const resultado = parseRelatorioBookplayRows([
      CABECALHO,
      linha({ nr: '10812488', tpdoc: 'PIX', parcela: '3', data: '19/10/2026', valor: 200 }),
      linha({ nr: '10812488', tpdoc: 'BOLETO NEGOCIAÇÃO', parcela: '4', data: '20/10/2026', valor: 93 }),
      linha({ nr: '10812488', tpdoc: 'BOLETO NEGOCIAÇÃO', parcela: '9', data: '20/10/2026', valor: 79 }),
      linha({ nr: '10812488', operador: 'OUTRA', tpdoc: 'PIX', data: '20/10/2026', valor: 10 }),
    ]);

    const resumo = resultado.analitico.map(l => [
      l.operador_usuario, l.data_pagamento.getDate(), l.valor_recebido, l.forma_detalhe,
    ]);
    expect(resumo).toEqual([
      ['AGATHA_ROCHA', 19, 200, 'Pix'],
      ['AGATHA_ROCHA', 20, 172, 'Boleto'],
      ['OUTRA', 20, 10, 'Pix'],
    ]);
    // O total não muda: só deixa de ir tudo para o primeiro dia.
    expect(resultado.analitico.reduce((s, l) => s + l.valor_recebido, 0)).toBe(382);
  });

  it('mantém a regra BookPlay de TpDoc vazio como cartão de crédito', () => {
    expect(labelPagamentoBookplay('')).toBe('Cartão de Crédito');
    const resultado = parseRelatorioBookplayRows([
      CABECALHO,
      linha({ tpdoc: '', colchao: 'Não' }),
    ]);

    expect(resultado.analitico[0]?.forma_pagamento).toBe('cartao');
    expect(resultado.analitico[0]?.forma_detalhe).toBe('Cartão de Crédito');
  });
});
