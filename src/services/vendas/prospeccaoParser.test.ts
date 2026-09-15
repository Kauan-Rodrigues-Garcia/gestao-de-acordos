import { describe, it, expect } from 'vitest';
import {
  parseProspeccao, numeroPtBr, numeroEn, normalizarCabecalho,
  quebrarLinhaCsv, situacaoDoErp,
} from './prospeccaoParser';

/*
 * O cabeçalho REAL do arquivo, na ordem em que o ERP o entrega. Manter a ordem
 * importa: o parser mapeia por nome, e um teste que use ordem própria não
 * provaria que o mapeamento funciona sobre o arquivo de verdade.
 */
const CABECALHO = [
  'Codigo_Venda', 'NrDocumento', 'Data_Venda', 'Data_Confirmacao',
  'Codigo_Franquia', 'Franquia', 'CPF', 'UF', 'Nome_Vendedor', 'Login_Vendedor',
  'Login_Confirmador', 'Tipo_Documento', 'Login_Cartao', 'Setor_Cartao',
  'PaguePlay', 'Valor_Faturamento', 'QTDE_Parcela', 'Valor_Parcela', 'Situacao',
  'Pix', 'Cartao_Padrao', 'Cartao_Recorrente', 'Total_Recebido',
  'Porcentagem_Recebido', 'TipoRecebimento', 'Recorrencia', 'Produto',
  'Categoria', 'TipoVenda', 'Codigo_Mailing', 'Mailing_Avanti',
  'Data_Cancelamento', 'Setor_Cancelamento', 'Data_Devolucao', 'Status_Aula',
  'Data_Aula', 'Motivo_Cancelado', 'Motivo_Devolucao', 'Tipo_Produto',
  'Data_Vencimento', 'Data_Link', 'Usuario_Link', 'Escolaridade', 'Idade',
  'ScoreClasse', 'ScoreTipo', 'SpcSerasa', 'ContratoBp', 'ContratoAtivo',
  'DtContratoAssinatura', 'Cliente', 'TipoPix', 'PixAuto_DtVcto',
  'PixAuto_DtPgto', 'PixAuto_UltStatus', 'PixAuto_Automatico', 'SetorPIX',
  'UsuarioPIX', 'ContratoAssinado', 'VendaLead',
].join(';');

type Campos = Partial<Record<string, string>>;

/** Uma linha do arquivo, com os campos que o teste quer e o resto em branco. */
function linha(campos: Campos): string {
  const nomes = CABECALHO.split(';');
  const padrao: Campos = {
    Codigo_Venda: '7130464', NrDocumento: '13075688',
    Data_Venda: '2026-09-08', Data_Confirmacao: '2026-09-08 21:59:04.597',
    Codigo_Franquia: '7661', Franquia: '28-EXTREMEDIGITAL - CONVENCIONAL - 2',
    UF: 'PR', Nome_Vendedor: 'KEVIN FABIANO', Login_Vendedor: 'Kevin',
    Tipo_Documento: 'BOLETO BANCÁRIO',
    Valor_Faturamento: '5.572,00', QTDE_Parcela: '28', Valor_Parcela: '199.0',
    Situacao: 'Confirmada', Pix: '0,00', Cartao_Padrao: '0,00',
    Cartao_Recorrente: '0,00', Total_Recebido: '0.0',
    Porcentagem_Recebido: '0.0', TipoRecebimento: 'SEM RECEBIMENTO',
    Produto: 'PEC - GERAL - 4 PÓS  - FBP', Categoria: 'PÓS MULTIDISCIPLINAR',
    TipoVenda: 'PEC', Tipo_Produto: 'PEC 4',
    ScoreClasse: 'C', SpcSerasa: 'Aprovado',
    ContratoAssinado: 'Sim', VendaLead: 'Não',
    Cliente: 'LUIZ RIVAMAR ALVES PAZ',
  };
  return nomes.map(n => campos[n] ?? padrao[n] ?? '').join(';');
}

function arquivo(...linhas: string[]): string {
  return '\ufeff' + [CABECALHO, ...linhas].join('\r\n') + '\r\n';
}

describe('o formato do número é POR COLUNA', () => {
  it('pt-BR: ponto é milhar, vírgula é decimal', () => {
    expect(numeroPtBr('3.816,00')).toBe(3816);
    expect(numeroPtBr('11.890.148,62')).toBe(11890148.62);
    expect(numeroPtBr('0,00')).toBe(0);
  });

  it('en: ponto é decimal e não existe milhar', () => {
    expect(numeroEn('159.0')).toBe(159);
    expect(numeroEn('1526.4')).toBe(1526.4);
    expect(numeroEn('0.0')).toBe(0);
  });

  it('a diferença não é acadêmica: «1.234» vale mil ou vale um', () => {
    expect(numeroPtBr('1.234')).toBe(1234);
    expect(numeroEn('1.234')).toBe(1.234);
  });

  it('vazio é null nos dois, nunca zero', () => {
    expect(numeroPtBr('')).toBeNull();
    expect(numeroEn('   ')).toBeNull();
  });

  it('lixo é null, não NaN', () => {
    expect(numeroPtBr('abc')).toBeNull();
    expect(numeroEn('R$ 5,00')).toBeNull();
  });
});

describe('cabeçalho', () => {
  it('tira acento, underscore e caixa', () => {
    expect(normalizarCabecalho('Data_Confirmacao')).toBe('dataconfirmacao');
    expect(normalizarCabecalho('QTDE_Parcela')).toBe('qtdeparcela');
    expect(normalizarCabecalho('Porcentagem_Recebido')).toBe('porcentagemrecebido');
  });
});

describe('quebra de linha com aspas', () => {
  it('o ponto e vírgula dentro de aspas não parte a coluna', () => {
    expect(quebrarLinhaCsv('a;"b;c";d')).toEqual(['a', 'b;c', 'd']);
  });

  it('aspa dobrada é aspa literal', () => {
    expect(quebrarLinhaCsv('a;"di""z";b')).toEqual(['a', 'di"z', 'b']);
  });

  it('campo vazio no fim continua existindo', () => {
    expect(quebrarLinhaCsv('a;b;')).toEqual(['a', 'b', '']);
  });
});

describe('situação do ERP', () => {
  it('as três que o geral traz', () => {
    expect(situacaoDoErp('Confirmada')).toBe('confirmada');
    expect(situacaoDoErp('Cancelada')).toBe('cancelada');
    expect(situacaoDoErp('Devolvida')).toBe('devolvida');
  });

  it('aberta é aceita — ela chega pelo relatório do setor', () => {
    expect(situacaoDoErp('Aberta')).toBe('aberta');
  });

  it('desconhecida é null, para a linha ser recusada com o nome do problema', () => {
    expect(situacaoDoErp('Em análise')).toBeNull();
    expect(situacaoDoErp('')).toBeNull();
  });
});

describe('o arquivo como o ERP o entrega', () => {
  const r = parseProspeccao(arquivo(linha({})));

  it('engole BOM, CRLF e separador ponto e vírgula', () => {
    expect(r.colunasFaltando).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    expect(r.erros).toEqual([]);
  });

  it('lê cada coluna no formato dela', () => {
    const l = r.linhas[0];
    expect(l.valor_total).toBe(5572);      // pt-BR
    expect(l.valor_parcela).toBe(199);     // en
    expect(l.qtde_parcela).toBe(28);       // inteiro
    expect(l.valor_recebido).toBe(0);      // en
  });

  it('a confirmação vem com hora e é cortada em dez caracteres', () => {
    expect(r.linhas[0].data_confirmacao).toBe('2026-09-08');
  });

  it('o login do vendedor é normalizado para minúsculas', () => {
    expect(r.linhas[0].login_vendedor).toBe('kevin');
  });

  it('o mês sai do eixo de confirmação', () => {
    expect(r.mes).toBe('2026-09');
  });
});

describe('a régua atravessa a importação', () => {
  const r = parseProspeccao(arquivo(
    linha({ NrDocumento: '1', Situacao: 'Confirmada', ContratoAssinado: 'Sim',
            Valor_Faturamento: '5.572,00' }),
    // Confirmada sem assinatura: 109 destas em setembro, R$ 536.355,71.
    linha({ NrDocumento: '2', Situacao: 'Confirmada', ContratoAssinado: 'Não',
            Valor_Faturamento: '6.972,00' }),
    // Devolvida que CONTINUA assinada: 187 destas, R$ 877.917,32.
    linha({ NrDocumento: '3', Situacao: 'Devolvida', ContratoAssinado: 'Sim',
            Valor_Faturamento: '3.984,00' }),
    linha({ NrDocumento: '4', Situacao: 'Cancelada', ContratoAssinado: 'Não',
            Valor_Faturamento: '2.800,00' }),
  ));

  it('conta só o que está confirmado E assinado', () => {
    expect(r.quantidadeNaRegua).toBe(1);
    expect(r.faturamentoNaRegua).toBe(5572);
  });

  it('o que fica de fora não é descartado — só não conta', () => {
    expect(r.linhas).toHaveLength(4);
    expect(r.descartadas).toBe(0);
  });

  it('a assinatura da devolvida é preservada, para a tela poder explicá-la', () => {
    const devolvida = r.linhas.find(l => l.nr_documento === '3')!;
    expect(devolvida.situacao).toBe('devolvida');
    expect(devolvida.contrato_assinado).toBe(true);
  });
});

describe('NR duplicado dentro do arquivo', () => {
  /*
   * O caso real, medido: 13075361 vem devolvida com PEC 4 PÓS (28×249 =
   * 6.972,00) e depois confirmada com PEC 1 PÓS (16×175 = 2.800,00). Somar as
   * duas contaria R$ 9.772,00 numa venda de R$ 2.800,00.
   */
  const r = parseProspeccao(arquivo(
    linha({ NrDocumento: '13075361', Situacao: 'Devolvida',
            Valor_Faturamento: '6.972,00', Produto: 'PEC - GERAL - 4 PÓS  - FBP' }),
    linha({ NrDocumento: '13075361', Situacao: 'Confirmada',
            Valor_Faturamento: '2.800,00', Produto: 'PEC - GERAL - 1 PÓS  - FBP' }),
  ));

  it('sobra UMA linha por NR', () => {
    expect(r.linhas).toHaveLength(1);
  });

  it('a última vence — é a linha viva', () => {
    expect(r.linhas[0].situacao).toBe('confirmada');
    expect(r.linhas[0].valor_total).toBe(2800);
    expect(r.linhas[0].produto).toContain('1 PÓS');
  });

  it('o NR resolvido é relatado, porque não é erro e precisa ser visível', () => {
    expect(r.duplicadosResolvidos).toEqual(['13075361']);
    expect(r.descartadas).toBe(0);
  });

  it('a franquia não conta o faturamento duas vezes', () => {
    expect(r.franquias).toHaveLength(1);
    expect(r.franquias[0].linhas).toBe(1);
    expect(r.franquias[0].faturamento).toBe(2800);
  });
});

describe('franquias, para o de-para', () => {
  const r = parseProspeccao(arquivo(
    linha({ NrDocumento: '1', Codigo_Franquia: '7661',
            Franquia: '28-EXTREMEDIGITAL - CONVENCIONAL - 2', Valor_Faturamento: '5.572,00' }),
    linha({ NrDocumento: '2', Codigo_Franquia: '7661',
            Franquia: '28-EXTREMEDIGITAL - CONVENCIONAL - 2', Valor_Faturamento: '4.776,00' }),
    linha({ NrDocumento: '3', Codigo_Franquia: '5731',
            Franquia: 'GR - SERTAOZINHO', Valor_Faturamento: '1.526,40' }),
  ));

  it('agrupa por CÓDIGO, que é a chave', () => {
    expect(r.franquias.map(f => f.codigo)).toEqual(['7661', '5731']);
  });

  it('ordena por faturamento — a decisão maior primeiro', () => {
    expect(r.franquias[0].faturamento).toBe(10348);
    expect(r.franquias[0].linhas).toBe(2);
  });

  it('o nome é rótulo: o último visto vence', () => {
    const renomeada = parseProspeccao(arquivo(
      linha({ NrDocumento: '1', Codigo_Franquia: '7661', Franquia: 'NOME VELHO' }),
      linha({ NrDocumento: '2', Codigo_Franquia: '7661', Franquia: 'NOME NOVO' }),
    ));
    expect(renomeada.franquias[0].nome).toBe('NOME NOVO');
  });
});

describe('linhas que o parser recusa', () => {
  it('sem Codigo_Franquia — não haveria como ligar a setor nenhum', () => {
    const r = parseProspeccao(arquivo(linha({ Codigo_Franquia: '' })));
    expect(r.linhas).toHaveLength(0);
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toContain('Codigo_Franquia vazio');
  });

  it('sem Data_Confirmacao — não teria mês, e o mês é o eixo oficial', () => {
    const r = parseProspeccao(arquivo(linha({ Data_Confirmacao: '' })));
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toContain('Data_Confirmacao');
  });

  it('situação desconhecida diz qual era', () => {
    const r = parseProspeccao(arquivo(linha({ Situacao: 'Em análise' })));
    expect(r.erros[0]).toContain('Em análise');
  });

  it('faturamento que não é número', () => {
    const r = parseProspeccao(arquivo(linha({ Valor_Faturamento: 'R$ 5,00' })));
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toContain('Valor_Faturamento');
  });

  it('uma linha ruim não derruba as boas', () => {
    const r = parseProspeccao(arquivo(
      linha({ NrDocumento: '1' }),
      linha({ NrDocumento: '2', Codigo_Franquia: '' }),
      linha({ NrDocumento: '3' }),
    ));
    expect(r.linhas.map(l => l.nr_documento)).toEqual(['1', '3']);
    expect(r.descartadas).toBe(1);
  });
});

describe('arquivo que não é o esperado', () => {
  it('cabeçalho faltando recusa o arquivo inteiro, sem processar linha', () => {
    const r = parseProspeccao('A;B;C\r\n1;2;3\r\n');
    expect(r.colunasFaltando.length).toBeGreaterThan(0);
    expect(r.colunasFaltando).toContain('nrdocumento');
    expect(r.linhas).toHaveLength(0);
  });

  it('arquivo vazio', () => {
    expect(parseProspeccao('').erros[0]).toContain('vazio');
  });

  it('misturar meses de confirmação é avisado — cada lote é UM mês', () => {
    const r = parseProspeccao(arquivo(
      linha({ NrDocumento: '1', Data_Confirmacao: '2026-08-31 10:00:00.000' }),
      linha({ NrDocumento: '2', Data_Confirmacao: '2026-09-01 10:00:00.000' }),
    ));
    expect(r.mes).toBeNull();
    expect(r.erros.join(' ')).toContain('mistura 2 meses');
  });
});

describe('a entrada é oportunista', () => {
  it('sem a coluna, o arquivo é aceito e a entrada fica nula', () => {
    const r = parseProspeccao(arquivo(linha({})));
    expect(r.colunasFaltando).toEqual([]);
    expect(r.linhas[0].valor_entrada).toBeNull();
  });

  it('com a coluna do export de 119, ela é lida em pt-BR', () => {
    const cab = CABECALHO + ';Valor PIX Entrada';
    const conteudo = '\ufeff' + [cab, linha({}) + ';2.029,80'].join('\r\n');
    const r = parseProspeccao(conteudo);
    expect(r.linhas[0].valor_entrada).toBe(2029.8);
  });
});

describe('o que o parser NÃO traz', () => {
  it('CPF não entra — o sistema o expurgou de propósito', () => {
    const r = parseProspeccao(arquivo(linha({ CPF: '123.398.369-56' })));
    expect(JSON.stringify(r.linhas[0])).not.toContain('123.398.369-56');
    expect(Object.keys(r.linhas[0])).not.toContain('cpf');
  });

  it('a decomposição de pagamento não entra — ela não fecha com o total', () => {
    const chaves = Object.keys(
      parseProspeccao(arquivo(linha({}))).linhas[0],
    );
    expect(chaves).not.toContain('pix');
    expect(chaves).not.toContain('cartao_padrao');
    expect(chaves).not.toContain('cartao_recorrente');
    // O que fica é o par que a regra 4 definiu.
    expect(chaves).toContain('valor_recebido');
    expect(chaves).toContain('tipo_recebimento');
  });
});

describe('o cliente, que o parser não lia', () => {
  /*
   * Até 15/09/2026 a coluna `Cliente` não estava declarada em `COLUNAS`. O
   * efeito só apareceu com as 140 vendas de setembro projetadas: a aba Vendas
   * mostrava «sem cliente» na frente de TODOS os NRs, e parecia dado que o
   * relatório não traz.
   *
   * Traz — coluna 51, com ZERO vazios em 3.101 linhas nos dois meses medidos.
   */
  it('lê o nome de quem comprou', () => {
    const r = parseProspeccao(arquivo(linha({})));
    expect(r.linhas[0].cliente).toBe('LUIZ RIVAMAR ALVES PAZ');
  });

  it('cliente em branco vira null, e não string vazia', () => {
    const r = parseProspeccao(arquivo(linha({ Cliente: '   ' })));
    expect(r.linhas[0].cliente).toBeNull();
  });

  it('é coluna OBRIGATÓRIA — export sem ela é recusado, não silenciado', () => {
    // O contrário — aceitar e gravar 140 nomes em branco — foi exatamente o
    // que aconteceu. Recusar dizendo qual coluna falta é o comportamento que
    // teria evitado a viagem.
    const cabSemCliente = CABECALHO.split(';').filter(c => c !== 'Cliente').join(';');
    const corpo = linha({}).split(';');
    const iCliente = CABECALHO.split(';').indexOf('Cliente');
    corpo.splice(iCliente, 1);

    const r = parseProspeccao('﻿' + [cabSemCliente, corpo.join(';')].join('\r\n'));
    expect(r.colunasFaltando).toContain('cliente');
    expect(r.linhas).toHaveLength(0);
  });
});
