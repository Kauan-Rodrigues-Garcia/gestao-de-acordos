import { describe, it, expect } from 'vitest';
import {
  norm,
  extrairCodigo,
  extrairNome,
  toDate,
  isCartao,
  mapearFormaPgto,
  resolveCols,
  ehEquipeRetencao,
  ehLinhaColchao,
  colchaoContaNaMeta,
  parseRelatorioRows,
} from './analiticoParser';

// ── norm ────────────────────────────────────────────────────────────────────

describe('norm', () => {
  it('remove acentos e passa para lower sem espaços', () => {
    expect(norm('Equipe/SubGrupo')).toBe('equipe/subgrupo');
    expect(norm('TpDoc')).toBe('tpdoc');
    expect(norm('Cobradora')).toBe('cobradora');
    expect(norm('Total HO')).toBe('totalho');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});

// ── extrairCodigo ────────────────────────────────────────────────────────────

describe('extrairCodigo', () => {
  it('extrai código numérico do início', () => {
    expect(extrairCodigo('1994034 - DIELY NEVES MEIRELES')).toBe('1994034');
    expect(extrairCodigo('001234 - NOME')).toBe('001234');
  });

  it('retorna tudo antes do " - " quando há código', () => {
    expect(extrairCodigo('5375194 - SIMONE MARIA')).toBe('5375194');
  });

  it('lida com string sem separador', () => {
    expect(extrairCodigo('1375834')).toBe('1375834');
  });

  it('retorna string vazia para null', () => {
    expect(extrairCodigo(null)).toBe('');
    expect(extrairCodigo('')).toBe('');
  });
});

// ── extrairNome ──────────────────────────────────────────────────────────────

describe('extrairNome', () => {
  it('extrai nome após " - "', () => {
    expect(extrairNome('1994034 - DIELY NEVES MEIRELES')).toBe('DIELY NEVES MEIRELES');
    expect(extrairNome('5375194 - SIMONE MARIA CAVALCANTI')).toBe('SIMONE MARIA CAVALCANTI');
  });

  it('retorna string inteira quando não há separador', () => {
    expect(extrairNome('ALGUM NOME')).toBe('ALGUM NOME');
  });
});

// ── toDate ───────────────────────────────────────────────────────────────────

describe('toDate', () => {
  it('converte Date object', () => {
    const d = new Date(2026, 5, 15); // junho 2026
    expect(toDate(d)).toEqual(new Date(2026, 5, 15));
  });

  it('converte serial Excel (número)', () => {
    // Serial 46095 = 2026-03-03 em UTC
    const d = toDate(46095);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it('converte string dd/mm/yyyy', () => {
    const d = toDate('23/06/2026');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);   // junho = índice 5
    expect(d!.getDate()).toBe(23);
  });

  it('converte string yyyy-mm-dd', () => {
    const d = toDate('2026-06-23');
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(23);
  });

  it('retorna null para valores inválidos', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('não é data')).toBeNull();
  });
});

// ── isCartao e mapearFormaPgto ────────────────────────────────────────────────

describe('isCartao', () => {
  it('detecta CARTÃO DE CRÉDITO', () => {
    expect(isCartao('CARTÃO DE CRÉDITO')).toBe(true);
    expect(isCartao('Cartao de Credito')).toBe(true);
    expect(isCartao('cartao')).toBe(true);
  });

  it('não detecta BOLETO como cartão', () => {
    expect(isCartao('BOLETO NEGOCIAÇÃO')).toBe(false);
    expect(isCartao('PIX')).toBe(false);
    expect(isCartao('BOLEPIX')).toBe(false);
  });
});

describe('mapearFormaPgto', () => {
  it('mapeia BOLETO NEGOCIAÇÃO para boleto_pix', () => {
    expect(mapearFormaPgto('BOLETO NEGOCIAÇÃO')).toBe('boleto_pix');
    expect(mapearFormaPgto('PIX')).toBe('boleto_pix');
  });

  it('mapeia CARTÃO DE CRÉDITO para cartao', () => {
    expect(mapearFormaPgto('CARTÃO DE CRÉDITO')).toBe('cartao');
  });
});

// ── resolveCols ───────────────────────────────────────────────────────────────

describe('resolveCols', () => {
  it('resolve colunas do relatório real', () => {
    const headers = [
      'Cobradora', 'Equipe/SubGrupo', 'Cliente', 'Email', 'Título', 'Colchão?',
      'Parcela', 'NrDocumento', 'Empresa', 'Tipo Venda', 'TpDoc',
      'DtLig', 'DtPgto', 'Dias em atraso', 'Recebido',
      'Dias entre ligação e baixa', 'Total HO',
    ];
    const cols = resolveCols(headers);
    expect(cols).not.toBeNull();
    expect(cols!.op).toBe(0);   // Cobradora
    expect(cols!.eq).toBe(1);   // Equipe/SubGrupo
    expect(cols!.cli).toBe(2);  // Cliente
    expect(cols!.colchao).toBe(5);
    expect(cols!.parcela).toBe(6);
    expect(cols!.nr).toBe(7);
    expect(cols!.tp).toBe(10);   // TpDoc (NÃO Tipo Venda)
    expect(cols!.dt).toBe(12);   // DtPgto
    expect(cols!.rec).toBe(14);  // Recebido
    expect(cols!.ho).toBe(16);   // Total HO
  });

  it('rejeita planilha sem colunas obrigatórias', () => {
    expect(resolveCols(['A', 'B', 'C'])).toBeNull();
  });

  it('tolera variações de nome', () => {
    const headers = ['operador', 'cliente', 'formapagamento', 'datapagamento', 'valorrecebido'];
    const cols = resolveCols(headers);
    expect(cols).not.toBeNull();
    expect(cols!.tp).toBe(2);   // formapagamento
    expect(cols!.dt).toBe(3);   // datapagamento
    expect(cols!.rec).toBe(4);  // valorrecebido
  });

  it('NÃO mapeia Tipo Venda para coluna tp', () => {
    // "tipovenda" não deve ser mapeado para tp (só TpDoc/formapagamento)
    const headers = ['Cobradora', 'Cliente', 'Tipo Venda', 'TpDoc', 'DtPgto', 'Recebido'];
    const cols = resolveCols(headers);
    expect(cols).not.toBeNull();
    expect(cols!.tp).toBe(3); // TpDoc, não Tipo Venda (índice 2)
  });

  it('mantém acordo válido quando a célula TpDoc está vazia', () => {
    const resultado = parseRelatorioRows([
      ['Cobradora', 'Equipe/SubGrupo', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido'],
      ['OPERADOR', 'RECEPTIVO', '123 - CLIENTE', null, '13/08/2026', 249],
    ]);
    expect(resultado.erros).toEqual([]);
    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0].forma_pagamento).toBe('boleto_pix');
    expect(resultado.linhas[0].tpdoc_original).toBe('NÃO INFORMADO');
  });
});

// ── ehEquipeRetencao ─────────────────────────────────────────────────────────

describe('ehEquipeRetencao', () => {
  it('reconhece a equipe de Retenção com e sem acento', () => {
    expect(ehEquipeRetencao('Retenção')).toBe(true);
    expect(ehEquipeRetencao('RETENCAO')).toBe(true);
    expect(ehEquipeRetencao('retencao')).toBe(true);
    expect(ehEquipeRetencao('EQUIPE RETENÇÃO')).toBe(true);
  });

  it('reconhece as variações com subgrupo', () => {
    // A coluna Equipe/SubGrupo do relatório 58 traz as duas grafias.
    expect(ehEquipeRetencao('Retenção e Retenção')).toBe(true);
    expect(ehEquipeRetencao('Retenção / Retenção')).toBe(true);
    expect(ehEquipeRetencao('  Retenção  ')).toBe(true);
  });

  it('não confunde com as equipes do Receptivo', () => {
    expect(ehEquipeRetencao('Receptivo')).toBe(false);
    expect(ehEquipeRetencao('Play 1')).toBe(false);
    expect(ehEquipeRetencao('')).toBe(false);
    expect(ehEquipeRetencao(null)).toBe(false);
    expect(ehEquipeRetencao(undefined)).toBe(false);
  });
});

describe('regra do Colchão', () => {
  it('reconhece somente a marcação Sim', () => {
    expect(ehLinhaColchao('Sim')).toBe(true);
    expect(ehLinhaColchao(' SIM ')).toBe(true);
    expect(ehLinhaColchao('Não')).toBe(false);
    expect(ehLinhaColchao(null)).toBe(false);
  });

  it('conta na meta somente até 12/08/2026', () => {
    expect(colchaoContaNaMeta(new Date(2026, 7, 12))).toBe(true);
    expect(colchaoContaNaMeta(new Date(2026, 7, 13))).toBe(false);
    expect(colchaoContaNaMeta(new Date(2026, 8, 1))).toBe(false);
    expect(colchaoContaNaMeta(new Date(2027, 7, 1))).toBe(false);
  });

  it('separa o Colchão fora da meta, preserva parcelas e remove Retenção', () => {
    const headers = [
      'Cobradora', 'Equipe/SubGrupo', 'Cliente', 'Email', 'Título', 'Colchão?',
      'Parcela', 'NrDocumento', 'Empresa', 'Tipo Venda', 'TpDoc', 'DtLig',
      'DtPgto', 'Dias em atraso', 'Recebido', 'Dias entre ligação e baixa',
      'Total HO', 'Tipo comissão',
    ];
    const linha = (
      operador: string, equipe: string, colchao: string, parcela: number,
      nr: number, data: string, recebido: number,
    ) => [
      operador, equipe, '123 - CLIENTE TESTE', null, 4191831, colchao,
      parcela, nr, 'FACULDADE BOOKPLAY', 'PEC', 'PIX AUTOMÁTICO', '01/07/2026',
      data, 0, recebido, 0, 0, 'Integral',
    ];

    const resultado = parseRelatorioRows([
      headers,
      linha('OPERADOR_A', 'RECEPTIVO', 'Não', 1, 1001, '13/08/2026', 10),
      linha('OPERADOR_A', 'RECEPTIVO', 'Sim', 2, 1002, '12/08/2026', 20),
      linha('OPERADOR_A', 'RECEPTIVO', 'Sim', 15, 12847788, '13/08/2026', 30),
      linha('OPERADOR_A', 'RECEPTIVO', 'Sim', 16, 12847788, '13/08/2026', 40),
      linha('OPERADOR_B', 'EQUIPE RETENÇÃO', 'Não', 1, 1003, '10/08/2026', 50),
    ]);

    expect(resultado.retencaoRemovidas).toBe(1);
    expect(resultado.colchaoNaMeta).toEqual({ linhas: 1, valor: 20 });
    expect(resultado.linhas).toHaveLength(2);
    expect(resultado.linhasColchao).toHaveLength(2);
    expect(resultado.linhasColchao.map(l => l.nr_documento)).toEqual(['12847788', '12847788']);
    expect(resultado.linhasColchao.map(l => l.parcela)).toEqual(['15', '16']);
  });
});

// ── H.O. calculado, não lido ─────────────────────────────────────────────────

describe('total_ho', () => {
  const headers = [
    'Cobradora', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido', 'Total HO',
  ];
  const linha = (recebido: number, hoDaPlanilha: number) =>
    ['OPERADOR_A', '123 - CLIENTE TESTE', 'PIX', '13/08/2026', recebido, hoDaPlanilha];

  it('ignora o valor da coluna e usa 24,96% do recebido', () => {
    // 269,02 é o caso real da planilha de 18/08/2026: o ERP mandou 67,2550
    // (divisão por 4 = 25,00%); o certo é 67,15 (24,96%).
    const r = parseRelatorioRows([headers, linha(269.02, 67.2550)]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].total_ho).toBe(67.15);
  });

  it('não se importa com o que vem na coluna — nem zero, nem lixo', () => {
    const r = parseRelatorioRows([
      headers,
      ['OPERADOR_A', '111 - CLIENTE UM',  'PIX', '13/08/2026', 1000, 0],
      ['OPERADOR_A', '222 - CLIENTE DOIS', 'PIX', '13/08/2026', 1000, 999999],
    ]);
    expect(r.linhas.map(l => l.total_ho)).toEqual([249.6, 249.6]);
  });

  it('sem coluna de H.O. o valor é zero — é o relatório da BookPlay', () => {
    const semHO = ['Cobradora', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido'];
    const r = parseRelatorioRows([
      semHO,
      ['OPERADOR_A', '123 - CLIENTE TESTE', 'PIX', '13/08/2026', 1000],
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].total_ho).toBe(0);
  });
});
