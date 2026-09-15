import { describe, it, expect } from 'vitest';
import { utils as xlsxUtils, write as xlsxWrite } from '@e965/xlsx';
import {
  parseProspeccaoSetor, mapearColunas, dataDoSerial,
} from './prospeccaoSetorParser';

/*
 * As duas linhas de cabeçalho do arquivo real, na ordem e com os buracos que
 * ele tem. O grupo (linha 1) só aparece na PRIMEIRA coluna de cada bloco — é
 * assim que a planilha desenha o cabeçalho mesclado, e é disso que o parser
 * depende para separar as cinco colunas chamadas «Data».
 *
 * Reduzido ao que o parser lê, mas com as repetições preservadas: um teste que
 * removesse as colunas duplicadas não provaria nada.
 */
const GRUPO = [
  'Identificação da Prospecção', '', '', '',
  'Prospecção', '', '', '', '', '', '', '', '',
  'Plano Bookplay',
  'Tp.Doc / Valores', '', '', '',
  'Categorias',
  'Confirmação', '',
  'Cancelamento', '', '',
  'Devolução', '',
];

const NOME = [
  'Nr.Doc', 'Cliente', 'UF', '#',
  'Data', 'Franquia', 'Vendedor', 'Login', 'Sit. Venda', 'Parcelas',
  'Valor Parcela', 'Valor Total', 'Produto',
  'Assinado',
  'Tipo de Documento', 'Valor PIX Entrada', 'Total Recebido', 'Tipo Recebimento',
  'Tipo de venda',
  'Data', 'Informação',
  'Data', 'Motivo', 'Setor',
  'Data', 'Motivo Devolução',
];

/** 46266 = 2026-09-01. Ver `dataDoSerial`. */
const SERIAL_01_09 = 46266;

type Campos = Record<string, unknown>;

function linha(campos: Campos = {}): unknown[] {
  const padrao: Campos = {
    'Nr.Doc': '13073323', Cliente: 'EMILIA MORAIS', UF: 'MA',
    Data: SERIAL_01_09, Franquia: '28-EXTREMEDIGITAL - CONVENCIONAL - 1',
    Vendedor: 'KEVIN FABIANO', Login: 'Kevin', 'Sit. Venda': 'Confirmada',
    Parcelas: 17, 'Valor Parcela': 278.6, 'Valor Total': 4736.2,
    Produto: 'PEC - EDUCADOR - 4 PÓS', Assinado: 'Sim',
    'Tipo de Documento': 'BOLETO BANCÁRIO', 'Total Recebido': 2029.8,
    'Tipo Recebimento': 'CARTÃO PADRÃO', 'Tipo de venda': 'PEC',
  };
  // A coluna é endereçada por posição: nomes repetidos exigem que o teste diga
  // qual ocorrência quer, e ele faz isso pelo índice.
  const saida: unknown[] = [];
  for (let i = 0; i < NOME.length; i++) {
    const chavePorIndice = `@${i}`;
    if (chavePorIndice in campos) { saida.push(campos[chavePorIndice]); continue; }
    const nome = NOME[i];
    // Para nome repetido, só a primeira ocorrência recebe o valor por nome.
    const primeira = NOME.indexOf(nome) === i;
    saida.push(primeira && nome in campos ? campos[nome]
             : primeira && nome in padrao ? padrao[nome] : '');
  }
  return saida;
}

/** Índices das colunas repetidas, para o teste endereçá-las sem ambiguidade. */
const COL = {
  dataConfirmacao: 19,
  dataCancelamento: 21,
  motivoCancelado: 22,
  setorCancelamento: 23,
  dataDevolucao: 24,
} as const;

function planilha(...linhas: unknown[][]): ArrayBuffer {
  const wb = xlsxUtils.book_new();
  const ws = xlsxUtils.aoa_to_sheet([GRUPO, NOME, ...linhas]);
  xlsxUtils.book_append_sheet(wb, ws, 'teste');
  return xlsxWrite(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('serial do Excel vira data', () => {
  it('a época é 1899-12-30 — o Excel conta um 29/02/1900 que não existiu', () => {
    expect(dataDoSerial(46266)).toBe('2026-09-01');
  });

  it('a fração é a hora e vai fora', () => {
    expect(dataDoSerial(46266.4241849537)).toBe('2026-09-01');
  });

  it('data já em texto ISO também passa', () => {
    expect(dataDoSerial('2026-09-08')).toBe('2026-09-08');
    expect(dataDoSerial('2026-09-08 21:59:04.597')).toBe('2026-09-08');
  });

  it('vazio e lixo viram null, nunca 1899-12-30', () => {
    expect(dataDoSerial('')).toBeNull();
    expect(dataDoSerial(null)).toBeNull();
    expect(dataDoSerial(0)).toBeNull();
    expect(dataDoSerial('abc')).toBeNull();
  });
});

describe('o mapa de colunas usa GRUPO + nome', () => {
  const mapa = mapearColunas(GRUPO, NOME);

  it('as cinco «Data» não colidem', () => {
    expect(mapa.get('prospeccao|data')).toBe(4);
    expect(mapa.get('confirmacao|data')).toBe(COL.dataConfirmacao);
    expect(mapa.get('cancelamento|data')).toBe(COL.dataCancelamento);
    expect(mapa.get('devolucao|data')).toBe(COL.dataDevolucao);
  });

  it('o grupo vale até o próximo aparecer — é cabeçalho mesclado', () => {
    // `Franquia` não tem grupo na própria célula: ele vem de «Prospecção».
    expect(mapa.get('prospeccao|franquia')).toBe(5);
    expect(mapa.get('prospeccao|valortotal')).toBe(11);
  });

  it('as colunas antes do primeiro grupo continuam endereçáveis', () => {
    expect(mapa.get('identificacaodaprospeccao|nrdoc')).toBe(0);
  });

  it('«Setor» do cancelamento não é confundido com outro Setor', () => {
    expect(mapa.get('cancelamento|setor')).toBe(COL.setorCancelamento);
  });
});

describe('a planilha como o sistema a entrega', () => {
  const r = parseProspeccaoSetor(planilha(linha({ [`@${COL.dataConfirmacao}`]: 46266.4241849537 })));

  it('lê sem reclamar de coluna faltando', () => {
    expect(r.colunasFaltando).toEqual([]);
    expect(r.linhas).toHaveLength(1);
  });

  it('os números vêm como número, não como texto pt-BR', () => {
    const l = r.linhas[0];
    expect(l.valor_total).toBe(4736.2);
    expect(l.valor_parcela).toBe(278.6);
    expect(l.valor_recebido).toBe(2029.8);
    expect(l.qtde_parcela).toBe(17);
  });

  it('a data da venda vem do grupo Prospecção', () => {
    expect(r.linhas[0].data_venda).toBe('2026-09-01');
  });

  it('a data de confirmação vem do grupo Confirmação, e não da primeira «Data»', () => {
    expect(r.linhas[0].data_confirmacao).toBe('2026-09-01');
  });

  it('o mês sai do eixo da VENDA — é o recorte deste arquivo', () => {
    expect(r.mes).toBe('2026-09');
  });

  it('a franquia vem sem código: o arquivo do setor não tem', () => {
    expect(r.linhas[0].codigo_franquia).toBeNull();
    expect(r.linhas[0].franquia).toBe('28-EXTREMEDIGITAL - CONVENCIONAL - 1');
  });

  it('o login é normalizado para minúsculas', () => {
    expect(r.linhas[0].login_vendedor).toBe('kevin');
  });
});

describe('o que só este relatório enxerga', () => {
  const r = parseProspeccaoSetor(planilha(
    linha({ 'Nr.Doc': '1', 'Sit. Venda': 'Aberta', Assinado: 'Não' }),
    linha({ 'Nr.Doc': '2', 'Sit. Venda': 'Aberta', Assinado: 'Não' }),
    linha({ 'Nr.Doc': '3', 'Sit. Venda': 'Confirmada', Assinado: 'Sim',
            [`@${COL.dataConfirmacao}`]: 46266.5 }),
  ));

  it('venda em aberto entra — o geral nunca a traz', () => {
    expect(r.abertas).toBe(2);
    expect(r.linhas.filter(l => l.situacao === 'aberta')).toHaveLength(2);
  });

  it('venda em aberto fica sem data de confirmação, e isso não é erro', () => {
    const aberta = r.linhas.find(l => l.nr_documento === '1')!;
    expect(aberta.data_confirmacao).toBeNull();
    expect(r.descartadas).toBe(0);
  });

  it('só as confirmadas contam quantas já têm data', () => {
    expect(r.confirmadasNoArquivo).toBe(1);
  });

  it('a régua é a mesma do geral: confirmada E assinada', () => {
    expect(r.quantidadeNaRegua).toBe(1);
    expect(r.faturamentoNaRegua).toBe(4736.2);
  });
});

describe('linhas recusadas', () => {
  it('sem franquia — não haveria como ligar a setor nenhum', () => {
    const r = parseProspeccaoSetor(planilha(linha({ Franquia: '' })));
    expect(r.linhas).toHaveLength(0);
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toContain('Franquia vazia');
  });

  it('sem data de venda — é o eixo deste arquivo', () => {
    const r = parseProspeccaoSetor(planilha(linha({ Data: '' })));
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toContain('Data da venda');
  });

  it('situação desconhecida diz qual era', () => {
    const r = parseProspeccaoSetor(planilha(linha({ 'Sit. Venda': 'Em análise' })));
    expect(r.erros[0]).toContain('Em análise');
  });

  it('linha sem NR é pulada em silêncio — é rodapé, não erro', () => {
    const r = parseProspeccaoSetor(planilha(linha({ 'Nr.Doc': '' }), linha({ 'Nr.Doc': '9' })));
    expect(r.linhas.map(l => l.nr_documento)).toEqual(['9']);
    expect(r.descartadas).toBe(0);
  });
});

describe('NR duplicado', () => {
  const r = parseProspeccaoSetor(planilha(
    linha({ 'Nr.Doc': '77', 'Sit. Venda': 'Devolvida', 'Valor Total': 6972 }),
    linha({ 'Nr.Doc': '77', 'Sit. Venda': 'Confirmada', 'Valor Total': 2800,
            [`@${COL.dataConfirmacao}`]: 46266.5 }),
  ));

  it('sobra uma linha, e é a última', () => {
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].situacao).toBe('confirmada');
    expect(r.linhas[0].valor_total).toBe(2800);
  });

  it('o duplicado é relatado sem virar erro', () => {
    expect(r.duplicadosResolvidos).toEqual(['77']);
    expect(r.descartadas).toBe(0);
  });

  it('a franquia não soma o faturamento duas vezes', () => {
    expect(r.franquias[0].faturamento).toBe(2800);
    expect(r.franquias[0].linhas).toBe(1);
  });
});

describe('arquivo que não é o esperado', () => {
  it('planilha sem as duas linhas de cabeçalho', () => {
    const r = parseProspeccaoSetor(planilha());
    expect(r.erros.join(' ')).toContain('duas linhas de cabeçalho');
  });

  it('cabeçalho de outro relatório recusa o arquivo inteiro', () => {
    const wb = xlsxUtils.book_new();
    const ws = xlsxUtils.aoa_to_sheet([['A', 'B'], ['C', 'D'], [1, 2]]);
    xlsxUtils.book_append_sheet(wb, ws, 'x');
    const r = parseProspeccaoSetor(xlsxWrite(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(r.colunasFaltando.length).toBeGreaterThan(0);
    expect(r.colunasFaltando.join(' ')).toContain('Nr.Doc');
    expect(r.linhas).toHaveLength(0);
  });

  it('misturar meses de venda é avisado', () => {
    const r = parseProspeccaoSetor(planilha(
      linha({ 'Nr.Doc': '1', Data: 46266 }),           // 2026-09-01
      linha({ 'Nr.Doc': '2', Data: 46235 }),           // 2026-08-01
    ));
    expect(r.mes).toBeNull();
    expect(r.erros.join(' ')).toContain('mistura 2 meses');
  });

  it('o que não é planilha nenhuma vira erro legível', () => {
    const r = parseProspeccaoSetor(new TextEncoder().encode('isto não é xlsx').buffer);
    expect(r.erros[0]).toContain('planilha');
    expect(r.linhas).toHaveLength(0);
  });
});

describe('a entrada continua oportunista', () => {
  it('coluna presente e vazia — medido: 205 de 205 linhas do arquivo real', () => {
    const r = parseProspeccaoSetor(planilha(linha({})));
    expect(r.colunasFaltando).toEqual([]);
    expect(r.linhas[0].valor_entrada).toBeNull();
  });

  it('quando vier preenchida, entra', () => {
    const r = parseProspeccaoSetor(planilha(linha({ 'Valor PIX Entrada': 2029.8 })));
    expect(r.linhas[0].valor_entrada).toBe(2029.8);
  });
});
