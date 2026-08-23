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
